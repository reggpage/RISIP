// CamScanner-style document scan, entirely client-side, no external libraries.
//
// Pipeline: crop away the background → find the paper's four corners → warp it to
// a straight rectangle (deskew) → adaptive-binarise for a pure-white page with
// crisp black ink. Every stage fails soft: low-confidence corners skip the warp,
// and any error returns the original image, so printing never breaks.

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`image fetch failed (${resp.status})`);
  return createImageBitmap(await resp.blob(), { imageOrientation: 'from-image' });
}

function bitmapToCanvas(bmp: ImageBitmap, maxDim = 1600): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return canvas;
}

function grayscaleOf(data: Uint8ClampedArray, n: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

// Otsu's method: the grey level that best separates dark background from bright paper.
function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (let p = 0; p < gray.length; p++) hist[gray[p]]++;
  const total = gray.length;
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

type Pt = { x: number; y: number };

// Crop to the bright paper's bounding box (row/column brightness projections).
function cropRegion(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  thr: number,
): { x0: number; y0: number; x1: number; y1: number } {
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
  if (x1 - x0 < w * 0.25 || y1 - y0 < h * 0.25) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return { x0, y0, x1, y1 };
}

// Find the four paper corners via the classic sum/difference extremes of the
// bright-pixel mask: TL=min(x+y), BR=max(x+y), TR=max(x−y), BL=min(x−y).
function detectCorners(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  thr: number,
): [Pt, Pt, Pt, Pt] | null {
  let tl = { x: 0, y: 0 };
  let br = { x: 0, y: 0 };
  let tr = { x: 0, y: 0 };
  let bl = { x: 0, y: 0 };
  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  let count = 0;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      if (gray[base + x] <= thr) continue;
      count++;
      const s = x + y;
      const d = x - y;
      if (s < sMin) { sMin = s; tl = { x, y }; }
      if (s > sMax) { sMax = s; br = { x, y }; }
      if (d > dMax) { dMax = d; tr = { x, y }; }
      if (d < dMin) { dMin = d; bl = { x, y }; }
    }
  }
  if (count < w * h * 0.05) return null;
  const side = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = side(tl, tr);
  const bottom = side(bl, br);
  const left = side(tl, bl);
  const right = side(tr, br);
  // Reject degenerate quads (a corner collapsed, or edges wildly mismatched).
  if (Math.min(top, bottom, left, right) < Math.max(w, h) * 0.15) return null;
  if (Math.max(top, bottom) > Math.min(top, bottom) * 2.2) return null;
  if (Math.max(left, right) > Math.min(left, right) * 2.2) return null;
  return [tl, tr, br, bl];
}

// Deskew: inverse bilinear map from the source quad to a straight rectangle.
function warpToRect(
  src: HTMLCanvasElement,
  tl: Pt,
  tr: Pt,
  br: Pt,
  bl: Pt,
): HTMLCanvasElement {
  const sctx = src.getContext('2d')!;
  const sw = src.width;
  const sh = src.height;
  const sd = sctx.getImageData(0, 0, sw, sh).data;

  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hL = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hR = Math.hypot(br.x - tr.x, br.y - tr.y);
  const outW = Math.max(240, Math.min(1400, Math.round((wTop + wBot) / 2)));
  const outH = Math.max(240, Math.min(2000, Math.round((hL + hR) / 2)));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d')!;
  const oImg = octx.createImageData(outW, outH);
  const od = oImg.data;

  for (let j = 0; j < outH; j++) {
    const v = j / (outH - 1);
    const lx = tl.x + (bl.x - tl.x) * v;
    const ly = tl.y + (bl.y - tl.y) * v;
    const rx = tr.x + (br.x - tr.x) * v;
    const ry = tr.y + (br.y - tr.y) * v;
    for (let i = 0; i < outW; i++) {
      const u = i / (outW - 1);
      let sx = lx + (rx - lx) * u;
      let sy = ly + (ry - ly) * u;
      sx = sx < 0 ? 0 : sx > sw - 1 ? sw - 1 : sx;
      sy = sy < 0 ? 0 : sy > sh - 1 ? sh - 1 : sy;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (j * outW + i) * 4;
      for (let c = 0; c < 3; c++) {
        const p00 = sd[(y0 * sw + x0) * 4 + c];
        const p10 = sd[(y0 * sw + x1) * 4 + c];
        const p01 = sd[(y1 * sw + x0) * 4 + c];
        const p11 = sd[(y1 * sw + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bot = p01 + (p11 - p01) * fx;
        od[o + c] = (top + (bot - top) * fy) | 0;
      }
      od[o + 3] = 255;
    }
  }
  octx.putImageData(oImg, 0, 0);
  return out;
}

// Adaptive binarisation: pure white page, crisp black ink. Compares each pixel
// to the mean of a local window (via an integral image), so shadows and uneven
// lighting don't grey out the background the way a global threshold would.
function adaptiveBinarize(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const gray = grayscaleOf(d, w * h);

  // Integral image for O(1) window sums.
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
    }
  }

  const rad = Math.max(8, Math.min(28, Math.round(Math.min(w, h) * 0.02)));
  const C = 10; // how far below the local mean counts as ink
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - rad);
    const yb = Math.min(h - 1, y + rad);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - rad);
      const xb = Math.min(w - 1, x + rad);
      const area = (yb - ya + 1) * (xb - xa + 1);
      const sum =
        integral[(yb + 1) * iw + (xb + 1)] -
        integral[(ya) * iw + (xb + 1)] -
        integral[(yb + 1) * iw + (xa)] +
        integral[(ya) * iw + (xa)];
      const mean = sum / area;
      const val = gray[y * w + x] < mean - C ? 0 : 255;
      const o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = val;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Scan a single receipt image into a CamScanner-style black-and-white data URL.
 * Never throws — on any failure it returns the original URL untouched.
 */
export async function scanReceiptToDataUrl(url: string): Promise<string> {
  try {
    const src = bitmapToCanvas(await loadBitmap(url), 1600);
    const w = src.width;
    const h = src.height;
    const gray = grayscaleOf(src.getContext('2d')!.getImageData(0, 0, w, h).data, w * h);
    const thr = Math.min(245, otsuThreshold(gray) + 8);

    // 1) Crop to the paper's bounding box.
    const { x0, y0, x1, y1 } = cropRegion(gray, w, h, thr);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const cropped = document.createElement('canvas');
    cropped.width = cw;
    cropped.height = ch;
    cropped.getContext('2d')!.drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);

    // 2) Deskew if we can confidently find the four corners inside the crop.
    const cGray = grayscaleOf(cropped.getContext('2d')!.getImageData(0, 0, cw, ch).data, cw * ch);
    const cThr = Math.min(245, otsuThreshold(cGray) + 8);
    const corners = detectCorners(cGray, cw, ch, cThr);
    // Nudge the corners ~3% outward so text right at the paper edge isn't clipped.
    let page = cropped;
    if (corners) {
      const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
      const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      const f = 0.03;
      const clamp = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
      const e = corners.map((p) => ({
        x: clamp(p.x + (p.x - cx) * f, cw - 1),
        y: clamp(p.y + (p.y - cy) * f, ch - 1),
      })) as [Pt, Pt, Pt, Pt];
      page = warpToRect(cropped, e[0], e[1], e[2], e[3]);
    }

    // 3) Crisp black-and-white.
    adaptiveBinarize(page);
    return page.toDataURL('image/jpeg', 0.92);
  } catch {
    return url;
  }
}
