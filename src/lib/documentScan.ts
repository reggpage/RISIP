// Apple-Notes-style document scan, entirely client-side and lazy-loaded.
//
// Given a receipt image URL we: detect the paper, perspective-correct it to a
// straight rectangle, and render it as a crisp near-black-and-white "scanned
// page". OpenCV (~10MB WASM) and jscanify are pulled from a CDN on the first
// scan only, so they never touch the initial app bundle. Every step degrades
// gracefully: if OpenCV fails to load, or no paper is detected, we still return
// a contrast-enhanced version of the original so printing never breaks.

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
const JSCANIFY_URL = 'https://cdn.jsdelivr.net/npm/jscanify@1.3.0/src/jscanify.min.js';

type Corner = { x: number; y: number };
type Corners = {
  topLeftCorner: Corner;
  topRightCorner: Corner;
  bottomLeftCorner: Corner;
  bottomRightCorner: Corner;
};

const scriptCache = new Map<string, Promise<void>>();
function loadScriptOnce(src: string): Promise<void> {
  const cached = scriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

let cvPromise: Promise<unknown> | null = null;
function loadOpenCv(): Promise<unknown> {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    const w = window as unknown as { cv?: unknown };
    await loadScriptOnce(OPENCV_URL);
    // Newer builds expose `cv` as a promise; older ones need onRuntimeInitialized.
    let cv = w.cv as { Mat?: unknown; onRuntimeInitialized?: () => void; then?: unknown } | undefined;
    if (cv && typeof (cv as { then?: unknown }).then === 'function') {
      cv = (await (cv as unknown as Promise<typeof cv>)) as typeof cv;
      w.cv = cv;
    }
    if (!cv) throw new Error('OpenCV did not initialise');
    if (cv.Mat) return cv;
    await new Promise<void>((resolve) => {
      cv!.onRuntimeInitialized = () => resolve();
    });
    return w.cv;
  })();
  return cvPromise;
}

let scannerPromise: Promise<any> | null = null;
function loadScanner(): Promise<any> {
  if (scannerPromise) return scannerPromise;
  scannerPromise = (async () => {
    await loadScriptOnce(JSCANIFY_URL);
    const Ctor = (window as unknown as { jscanify?: new () => any }).jscanify;
    if (!Ctor) throw new Error('jscanify did not load');
    return new Ctor();
  })();
  return scannerPromise;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  // Fetch to a blob first so the canvas is never tainted (blob: is same-origin),
  // which lets us read pixels back out for OpenCV and toDataURL.
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`image fetch failed (${resp.status})`);
  return createImageBitmap(await resp.blob());
}

function bitmapToCanvas(bmp: ImageBitmap, maxDim = 1800): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return canvas;
}

function dist(a: Corner, b: Corner): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Rejects degenerate detections (a sliver, or basically the whole frame) so we
// fall back to the full image instead of producing a warped mess.
function cornersAreUsable(c: Corners, imgW: number, imgH: number): boolean {
  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  if (pts.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  // Shoelace area of the quad.
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  area = Math.abs(area) / 2;
  const frac = area / (imgW * imgH);
  return frac > 0.12 && frac < 0.999;
}

function paperSize(c: Corners): { w: number; h: number } {
  const wTop = dist(c.topLeftCorner, c.topRightCorner);
  const wBot = dist(c.bottomLeftCorner, c.bottomRightCorner);
  const hL = dist(c.topLeftCorner, c.bottomLeftCorner);
  const hR = dist(c.topRightCorner, c.bottomRightCorner);
  const w = Math.round((wTop + wBot) / 2);
  const h = Math.round((hL + hR) / 2);
  const clamp = (v: number) => Math.max(240, Math.min(2200, v));
  return { w: clamp(w), h: clamp(h) };
}

// Whiten the background and deepen the ink for a clean "scanned document" look
// without hard 1-bit thresholding (which would eat faint thermal print).
function enhanceToDocument(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[p] = g;
    hist[g]++;
  }
  // Background ≈ the 82nd brightness percentile (the paper, minus specular spikes).
  let acc = 0;
  let bg = 200;
  const target = n * 0.82;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) {
      bg = Math.max(v, 1);
      break;
    }
  }
  const scale = 245 / bg;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let g = gray[p] * scale;
    g = (g - 128) * 1.45 + 128 - 8; // contrast around mid-grey, slight darkening
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Scan a single receipt image into a Notes-style black-and-white data URL.
 * Never throws — on any failure it returns an enhanced (or original) image.
 */
export async function scanReceiptToDataUrl(url: string): Promise<string> {
  let srcCanvas: HTMLCanvasElement;
  try {
    srcCanvas = bitmapToCanvas(await loadBitmap(url), 1800);
  } catch {
    return url; // Could not even load it — let the print fall back to the URL.
  }

  try {
    const cv = (await loadOpenCv()) as { imread: (c: HTMLCanvasElement) => { delete?: () => void } };
    const scanner = await loadScanner();
    let cropped: HTMLCanvasElement | null = null;
    const mat = cv.imread(srcCanvas);
    try {
      const contour = scanner.findPaperContour(mat);
      if (contour) {
        const corners = scanner.getCornerPoints(contour) as Corners;
        if (cornersAreUsable(corners, srcCanvas.width, srcCanvas.height)) {
          const { w, h } = paperSize(corners);
          cropped = scanner.extractPaper(srcCanvas, w, h, corners) as HTMLCanvasElement;
        }
        (contour as { delete?: () => void }).delete?.();
      }
    } finally {
      mat.delete?.();
    }
    const out = cropped ?? srcCanvas;
    enhanceToDocument(out);
    return out.toDataURL('image/jpeg', 0.9);
  } catch {
    enhanceToDocument(srcCanvas);
    return srcCanvas.toDataURL('image/jpeg', 0.9);
  }
}
