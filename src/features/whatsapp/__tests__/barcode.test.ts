import { describe, expect, it } from 'vitest';
import {
  checkDigit,
  formatBarcode,
  isScanRequest,
  parseBarcodeMessage,
  readBarcode,
} from '../../../../supabase/functions/_shared/barcode';

// Numbers that carry a correct check digit, in the four shapes a shop scans.
// Coca-Cola's is the real published one; the others are constructed so the
// checksum is genuine rather than copied from a packet I have not seen.
const EAN13 = '6011040121093';
const COCA_COLA = '5449000000996';
const EAN8 = '96385074';
const UPCA = '036000291452';

describe('reading a scanned number', () => {
  it('accepts codes that pass their own check digit', () => {
    for (const code of [EAN13, COCA_COLA, EAN8, UPCA]) {
      expect(readBarcode(code), code).toMatchObject({ code, verified: true });
    }
  });

  it('names the kind, because a shop can tell them apart on the packet', () => {
    expect(readBarcode(EAN13)?.kind).toBe('ean13');
    expect(readBarcode(EAN8)?.kind).toBe('ean8');
    expect(readBarcode(UPCA)?.kind).toBe('upca');
  });

  it('refuses a code whose check digit disagrees', () => {
    // A scanner that half-read a packet produces a number that looks perfectly
    // plausible and belongs to a different product. This is the whole reason
    // the checksum is here.
    expect(readBarcode('6011040121094')).toBeNull();
    expect(readBarcode('5449000000995')).toBeNull();
  });

  it('accepts a shop-printed code of a non-standard length, and says it is unverified', () => {
    expect(readBarcode('123456')).toEqual({ code: '123456', kind: 'other', verified: false });
  });

  it('reads through the spaces and hyphens people type', () => {
    expect(readBarcode('6011 0401 21093')?.code).toBe(EAN13);
    expect(readBarcode('5449-0000-00996')?.code).toBe(COCA_COLA);
  });

  it('refuses what cannot be a code at all', () => {
    expect(readBarcode('')).toBeNull();
    expect(readBarcode('12345')).toBeNull();
    expect(readBarcode('1234567890123456789')).toBeNull();
    expect(readBarcode('daftari')).toBeNull();
  });

  it('computes the check digit the way the packet does', () => {
    expect(checkDigit('601104012109')).toBe(3);
    expect(checkDigit('544900000099')).toBe(6);
  });
});

describe('a barcode inside a WhatsApp message', () => {
  it('reads a message that is nothing but the number', () => {
    expect(parseBarcodeMessage(EAN13)?.code).toBe(EAN13);
    expect(parseBarcodeMessage(` ${COCA_COLA} `)?.code).toBe(COCA_COLA);
  });

  it('reads one the person introduced by name', () => {
    expect(parseBarcodeMessage(`barcode ${EAN13}`)?.code).toBe(EAN13);
    expect(parseBarcodeMessage(`bar code ya bidhaa ${EAN8}`)?.code).toBe(EAN8);
  });

  it('never swallows a sale that happens to hold a number', () => {
    // "nimeuza 12345678" is money. Reading it as a product lookup would lose it.
    expect(parseBarcodeMessage('nimeuza 12345678')).toBeNull();
    expect(parseBarcodeMessage(`nimeuza daftari ${EAN13}`)).toBeNull();
    expect(parseBarcodeMessage('nimelipa umeme 45000')).toBeNull();
  });

  it('refuses a bare number that fails its checksum', () => {
    expect(parseBarcodeMessage('6011040121094')).toBeNull();
  });
});

describe('showing it back', () => {
  it('groups the digits the way they are printed', () => {
    expect(formatBarcode(EAN13)).toBe('6 011040 121093');
    expect(formatBarcode(EAN8)).toBe('9638 5074');
  });
});

describe('asking for the scanner', () => {
  it('takes the bare word, and the sentences around it', () => {
    for (const said of ['scan', 'Scan', 'skani', 'nataka ku-scan bar code', 'scan bidhaa', 'scan products']) {
      expect(isScanRequest(said), said).toBe(true);
    }
  });

  it('is not every message with the word in it', () => {
    for (const other of ['nimeuza scanner 2', 'bei ya scanner ni 45000', '']) {
      expect(isScanRequest(other), other).toBe(false);
    }
  });
});
