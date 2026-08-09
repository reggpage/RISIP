// Apple-Notes-style document scan, entirely client-side, no external libraries.
//
// Given a receipt image URL we: crop away the background (the paper is bright,
// the desk/hand behind it is darker), then whiten the paper and deepen the ink
// for a crisp "scanned page" look. This is deliberately dependency-free — an
// earlier OpenCV/jscanify build was unreliable in the field, so we use a robust
// brightness-projection crop that works for the common case (light receipt on a
// darker surface) and always degrades to a clean enhanced image, never a crash.

async function loadBitmap(url: string): Promise<ImageBitmap> {
  // Blob first so the canvas is never tainted; honour EXIF so phone photos are
  // upright before we analyse them.
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`image fetch failed (${resp.status})`);
  return createImageBitmap(await resp.blob(), { imageOrientation: 'from-image' });
}

function bitmapToCanvas(bmp: ImageBitmap, maxDim = 1800): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return canvas;
}

// Otsu's method: pick the grey level that best separates dark (background) from
// bright (paper) pixels, from a 256-bin histogram.
function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

// Crop to the paper by projecting bright pixels onto each axis and trimming the
// margins that are mostly background. Returns the same canvas if it cannot find
// a confident, large-enough region (so we never over-crop into the receipt).
function autoCropPaper(src: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const ctx = src.getContext('2d')!;
  const data = ctx.getImageData(0, 0, w, h).data;

  const gray = new Uint8ClampedArray(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[p] = g;
    hist[g]++;
  }
  // Bias the threshold up a touch so faint desk texture doesn't read as "paper".
  const thr = Math.min(245, otsuThreshold(hist, w * h) + 10);

  const colCount = new Int32Array(w);
  const rowCount = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let rc = 0;
    for (let x = 0; x < w; x++) {
      if (gray[base + x] > thr) {
        rc++;
        colCount[x]++;
      }
    }
    rowCount[y] = rc;
  }

  // A row/column belongs to the paper if a good share of it is bright.
  const colNeed = h * 0.3;
  const rowNeed = w * 0.3;
  let x0 = 0;
  while (x0 < w && colCount[x0] < colNeed) x0++;
  let x1 = w - 1;
  while (x1 > x0 && colCount[x1] < colNeed) x1--;
  let y0 = 0;
  while (y0 < h && rowCount[y0] < rowNeed) y0++;
  let y1 = h - 1;
  while (y1 > y0 && rowCount[y1] < rowNeed) y1--;

  const cw = x1 - x0;
  const ch = y1 - y0;
  // Bail if the detected region is implausibly small (bad lighting) — better to
  // print the whole enhanced photo than a sliver.
  if (cw < w * 0.25 || ch < h * 0.25) return src;

  const pad = Math.round(Math.min(cw, ch) * 0.02);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);

  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext('2d')!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
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
 * Never throws — on any failure it returns the original URL untouched.
 */
export async function scanReceiptToDataUrl(url: string): Promise<string> {
  try {
    const src = bitmapToCanvas(await loadBitmap(url), 1800);
    const cropped = autoCropPaper(src);
    enhanceToDocument(cropped);
    return cropped.toDataURL('image/jpeg', 0.9);
  } catch {
    return url;
  }
}
