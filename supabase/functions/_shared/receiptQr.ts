// Reading the QR square instead of reading the print.
//
// Every TRA fiscal receipt carries a QR holding the URL of its own verification
// page, which ends in the verification code. That code is the one field the
// model must get exactly right — it is the global duplicate key (0041), and the
// second factor for the TRA lookup (traVerify.ts). On a real receipt the model
// read it as 1097A5E214A5 when it was 18935E214576, and everything downstream
// followed the wrong one.
//
// A QR is not read, it is decoded: error-correcting, checksummed, and either
// right or absent. There is no "nearly". So where the square is legible this
// replaces guesswork entirely, and where it is not — a crease, a thumb, a
// glare — nothing is lost, because the model's reading is still there.

import jsQR from 'npm:jsqr@1.4.0';
import { decode as decodeJpeg } from 'npm:jpeg-js@0.4.4';

/** Above this, a photo is downsampled before decoding rather than held whole. */
const MAX_PIXELS = 2_000_000;
/** jpeg-js allocates eagerly; a cap keeps a huge photo from taking the function down. */
const MAX_DECODE_MB = 256;

/**
 * The verification code inside whatever the QR turned out to hold.
 *
 * Kept liberal about the wrapper and strict about the code: TRA prints the
 * verify URL, but different EFD vendors have been seen emitting the bare code,
 * a query parameter, or the URL with a trailing slash. The code itself is always
 * the alphanumeric run at the end.
 */
export function parseTraQrPayload(payload: string | null | undefined): string | null {
  const text = String(payload ?? '').trim();
  if (!text) return null;

  const candidates: string[] = [];

  // https://verify.tra.go.tz/18935E214576  (with or without scheme or slash)
  const fromUrl = /verify\.tra\.go\.tz\/+([A-Za-z0-9]{6,20})/i.exec(text);
  if (fromUrl) candidates.push(fromUrl[1]);

  // ...?code=XXXX / ?rctvcode=XXXX
  const fromQuery = /[?&](?:code|rctvcode|verificationcode)=([A-Za-z0-9]{6,20})/i.exec(text);
  if (fromQuery) candidates.push(fromQuery[1]);

  // The bare code, when that is all the square holds.
  if (/^[A-Za-z0-9]{6,20}$/.test(text)) candidates.push(text);

  for (const candidate of candidates) {
    const code = candidate.toUpperCase();
    // A code is alphanumeric and mixed; a run of only digits is far more likely
    // to be a receipt or serial number that happened to match the shape.
    if (/^[A-Z0-9]{6,20}$/.test(code) && /[A-Z]/.test(code)) return code;
  }
  return null;
}

type Decoded = { data: Uint8ClampedArray; width: number; height: number };

/**
 * Reduces a photo to something jsQR can scan without holding tens of megabytes.
 * Nearest-neighbour on purpose: a QR is black and white, and interpolation
 * blurs exactly the edges the decoder is looking for.
 */
function downsample(image: Decoded, factor: number): Decoded {
  if (factor <= 1) return image;
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceRow = Math.floor(y * factor) * image.width;
    for (let x = 0; x < width; x++) {
      const from = (sourceRow + Math.floor(x * factor)) * 4;
      const to = (y * width + x) * 4;
      data[to] = image.data[from];
      data[to + 1] = image.data[from + 1];
      data[to + 2] = image.data[from + 2];
      data[to + 3] = image.data[from + 3];
    }
  }
  return { data, width, height };
}

/** A rectangle of the image, copied out so it can be scanned on its own. */
function crop(image: Decoded, left: number, top: number, width: number, height: number): Decoded {
  const w = Math.min(width, image.width - left);
  const h = Math.min(height, image.height - top);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(from, from + w * 4), y * w * 4);
  }
  return { data, width: w, height: h };
}

/**
 * Greyscale with a local threshold.
 *
 * jsQR binarises globally, which a thermal receipt defeats: it is photographed
 * under a window, so one corner is blown out and another is in shadow, and TRA
 * prints pale blue watermarks straight over the square. Thresholding against a
 * neighbourhood mean rather than the whole frame keeps the modules black and the
 * paper white in both corners at once.
 */
function binarise(image: Decoded, window = 25): Decoded {
  const { width, height, data } = image;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  // Integral image, so each window mean is four lookups regardless of its size.
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += grey[y * width + x];
      sums[(y + 1) * (width + 1) + (x + 1)] = sums[y * (width + 1) + (x + 1)] + row;
    }
  }
  const half = Math.max(4, Math.floor(window / 2));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half); const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half); const x1 = Math.min(width - 1, x + half);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const total = sums[(y1 + 1) * (width + 1) + (x1 + 1)] - sums[y0 * (width + 1) + (x1 + 1)]
        - sums[(y1 + 1) * (width + 1) + x0] + sums[y0 * (width + 1) + x0];
      // Slightly below the local mean, so faint watermark blue reads as paper.
      const value = grey[y * width + x] < (total / area) * 0.92 ? 0 : 255;
      const at = (y * width + x) * 4;
      out[at] = value; out[at + 1] = value; out[at + 2] = value; out[at + 3] = 255;
    }
  }
  return { data: out, width, height };
}

function attempt(image: Decoded): string | null {
  const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return parseTraQrPayload(found?.data);
}

/** Longest side capped, so jsQR is never handed a twelve-megapixel frame. */
function fit(image: Decoded, longest: number): Decoded {
  const factor = Math.max(image.width, image.height) / longest;
  return factor > 1 ? downsample(image, factor) : image;
}

/**
 * Finds the code in an already-decoded image.
 *
 * The whole frame first, then tiles. A receipt QR is a small square in a big
 * photo — 3% of the width in a real case — and jsQR looks for finder patterns at
 * the scale it is given, so a tile where the square fills a third of the frame
 * succeeds where the full photo does not. Tiles overlap by half so a QR on a
 * seam is whole in some tile.
 *
 * Bounded by a time budget rather than by trying everything: the earlier version
 * handed jsQR the full frame and took fifteen to twenty seconds, which is not
 * time an upload can spend.
 */
export function scanDecodedImage(image: Decoded, budgetMs = 6000): string | null {
  const started = Date.now();
  const spent = () => Date.now() - started > budgetMs;

  const whole = fit(image, 1400);
  for (const candidate of [whole, binarise(whole)]) {
    const code = attempt(candidate);
    if (code) return code;
    if (spent()) return null;
  }

  // Thirds, overlapping by half. The tile is fitted to a size it usually
  // already is, so a small square keeps its pixels: shrinking the tile was what
  // lost a QR three per cent of the photo wide — 3px a module became under 2,
  // which is below what any decoder can resolve.
  const tile = Math.floor(Math.min(image.width, image.height) / 3);
  const step = Math.max(1, Math.floor(tile / 2));
  for (let top = 0; top + 40 < image.height; top += step) {
    for (let left = 0; left + 40 < image.width; left += step) {
      // Checked before the work, not only after it: binarising a tile is the
      // expensive step and one more of them was overrunning the budget.
      if (spent()) return null;
      const piece = fit(crop(image, left, top, tile, tile), 1200);
      if (piece.width < 40 || piece.height < 40) continue;
      const code = attempt(piece);
      if (code) return code;
      if (spent()) return null;
      const cleaned = attempt(binarise(piece));
      if (cleaned) return cleaned;
    }
  }
  return null;
}

/**
 * The verification code from a receipt photo, or null.
 *
 * Never throws. A QR that cannot be found is the ordinary case — creased paper,
 * a thumb over the square, a photo taken at an angle — and it costs nothing,
 * because the model's reading is still there to fall back on.
 */
export function readReceiptQr(bytes: Uint8Array, mimeType?: string | null): string | null {
  const type = String(mimeType ?? '').toLowerCase();
  // jpeg-js only speaks JPEG. WhatsApp sends JPEG; anything else falls through
  // to the model rather than pretending.
  if (type && !type.includes('jpeg') && !type.includes('jpg')) return null;

  try {
    const raw = decodeJpeg(bytes, { useTArray: true, maxMemoryUsageInMB: MAX_DECODE_MB, formatAsRGBA: true });
    if (!raw?.width || !raw?.height) return null;

    let image: Decoded = {
      data: new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
      width: raw.width,
      height: raw.height,
    };

    // NOT downsampled here. The earlier version shrank a 12-megapixel photo to
    // two before scanning, which took a QR that was 3% of the width down to
    // about 80 pixels — below what jsQR can resolve. scanDecodedImage does its
    // own fitting per tile, where shrinking helps instead of hurting.

    return scanDecodedImage(image);
  } catch {
    return null;
  }
}
