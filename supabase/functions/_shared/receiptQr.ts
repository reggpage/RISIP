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

/** Runs jsQR over an already-decoded image, trying a couple of scales. */
export function scanDecodedImage(image: Decoded): string | null {
  // Full resolution first, then halved and quartered. A photographed QR often
  // decodes better small, where sensor noise stops looking like modules.
  for (const factor of [1, 2, 4]) {
    const scaled = downsample(image, factor);
    if (scaled.width < 40 || scaled.height < 40) break;
    const found = jsQR(scaled.data, scaled.width, scaled.height, { inversionAttempts: 'attemptBoth' });
    const code = parseTraQrPayload(found?.data);
    if (code) return code;
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

    // A 12-megapixel photo is scanned at about two, which is ample for a QR and
    // keeps the working set within an edge function's means.
    const pixels = image.width * image.height;
    if (pixels > MAX_PIXELS) image = downsample(image, Math.ceil(Math.sqrt(pixels / MAX_PIXELS)));

    return scanDecodedImage(image);
  } catch {
    return null;
  }
}
