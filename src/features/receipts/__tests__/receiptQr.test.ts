import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import {
  parseTraQrPayload,
  scanDecodedImage,
} from '../../../../supabase/functions/_shared/receiptQr';

/**
 * A real QR, rendered to pixels the way a decoder sees them.
 *
 * Encoding and decoding for real is the only way to know the integration works;
 * a hand-built fixture would only prove the fixture. The modules are drawn at
 * scale with a quiet zone, exactly as a printed square appears.
 */
function renderQr(text: string, scale = 6, quiet = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const width = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * width + ((x + quiet) * scale + dx);
          data[px * 4] = 0; data[px * 4 + 1] = 0; data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

describe('what the square holds', () => {
  it('reads the code out of the TRA verify URL', () => {
    expect(parseTraQrPayload('https://verify.tra.go.tz/18935E214576')).toBe('18935E214576');
    expect(parseTraQrPayload('http://verify.tra.go.tz/18935E214576/')).toBe('18935E214576');
    expect(parseTraQrPayload('verify.tra.go.tz/18935E214576')).toBe('18935E214576');
  });

  it('copes with the other shapes EFD vendors emit', () => {
    expect(parseTraQrPayload('https://verify.tra.go.tz/?rctvcode=8F9CDB204130')).toBe('8F9CDB204130');
    expect(parseTraQrPayload('18935E214576')).toBe('18935E214576');
    expect(parseTraQrPayload(' 8f9cdb204130 ')).toBe('8F9CDB204130');
  });

  it('refuses a run of digits, which is usually a receipt number', () => {
    // A code is mixed alphanumeric. "214576" is the receipt number on this very
    // receipt, and taking it for a code would send the lookup somewhere wrong.
    expect(parseTraQrPayload('214576')).toBeNull();
    expect(parseTraQrPayload('138955834')).toBeNull();
  });

  it('refuses anything that is not a code at all', () => {
    expect(parseTraQrPayload('')).toBeNull();
    expect(parseTraQrPayload(null)).toBeNull();
    expect(parseTraQrPayload('https://example.com/hello')).toBeNull();
    expect(parseTraQrPayload('WIFI:S:shop;T:WPA;P:secret;;')).toBeNull();
  });
});

describe('decoding a real QR', () => {
  it('round-trips the code off an actual rendered square', () => {
    // Encoded by a QR library and decoded by the scanner — no fixture in between.
    expect(scanDecodedImage(renderQr('https://verify.tra.go.tz/18935E214576'))).toBe('18935E214576');
  });

  it('still reads it when the square is small on the page', () => {
    expect(scanDecodedImage(renderQr('https://verify.tra.go.tz/8F9CDB204130', 3))).toBe('8F9CDB204130');
  });

  it('reads a large photo by scanning it down', () => {
    // A phone photo is far bigger than a QR needs; the scanner halves it until
    // the modules stop looking like sensor noise.
    expect(scanDecodedImage(renderQr('https://verify.tra.go.tz/18935E214576', 20))).toBe('18935E214576');
  });

  it('returns null for a blank image rather than guessing', () => {
    const width = 400;
    const blank = { data: new Uint8ClampedArray(width * width * 4).fill(255), width, height: width };
    expect(scanDecodedImage(blank)).toBeNull();
  });

  it('ignores a QR that is not a TRA receipt', () => {
    // A poster or a WiFi square on the same table must not become a receipt code.
    expect(scanDecodedImage(renderQr('https://example.com/menu'))).toBeNull();
  });
});

describe('a square that is small in a big photo', () => {
  /** A QR of `modulePx` per module, dropped into a photo-sized noisy frame. */
  function photoWithQr(photoW: number, photoH: number, modulePx: number, quiet = 4) {
    const qr = QRCode.create('https://verify.tra.go.tz/18935E214576', { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = new Uint8ClampedArray(photoW * photoH * 4);
    for (let i = 0; i < photoW * photoH; i++) {
      const v = 120 + ((i * 37) % 90);
      data[i * 4] = v; data[i * 4 + 1] = v - 20; data[i * 4 + 2] = v - 40; data[i * 4 + 3] = 255;
    }
    const qrPx = (size + quiet * 2) * modulePx;
    const ox = Math.floor(photoW * 0.55); const oy = Math.floor(photoH * 0.70);
    const paint = (x: number, y: number, value: number) => {
      const px = (y * photoW + x) * 4;
      if (px + 3 >= data.length) return;
      data[px] = value; data[px + 1] = value; data[px + 2] = value;
    };
    for (let y = 0; y < qrPx; y++) for (let x = 0; x < qrPx; x++) paint(ox + x, oy + y, 255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < modulePx; dy++) for (let dx = 0; dx < modulePx; dx++) {
        paint(ox + (x + quiet) * modulePx + dx, oy + (y + quiet) * modulePx + dy, 0);
      }
    }
    return { data, width: photoW, height: photoH };
  }

  it('finds a QR that is 7% of a twelve-megapixel photo', () => {
    // The whole frame at this size resolves the square to about one pixel per
    // module, so this only works because the tiles are scanned near native size.
    expect(scanDecodedImage(photoWithQr(3000, 4000, 6))).toBe('18935E214576');
  });

  it('finds one at 5%', () => {
    expect(scanDecodedImage(photoWithQr(3000, 4000, 4))).toBe('18935E214576');
  });

  it('stays inside its time budget instead of trying everything', () => {
    // The first version handed jsQR the full frame and took fifteen to twenty
    // seconds, which is not time an upload can spend.
    const started = Date.now();
    scanDecodedImage(photoWithQr(4000, 3000, 3), 2000);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
