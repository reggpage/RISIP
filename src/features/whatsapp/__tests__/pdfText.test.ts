import { describe, expect, it } from 'vitest';
import { pdfClip, pdfSafe } from '../../../../supabase/functions/_shared/pdfText';

// ONE SMART QUOTE MUST NOT COST A WHOLE STATEMENT.
//
// pdf-lib's StandardFonts are WinAnsi-encoded and drawText THROWS on anything
// the encoding cannot hold. A shopkeeper does not type ASCII on purpose:
// WhatsApp turns ' into a curly quote by itself, and "ng'ombe" is a product
// half this country sells. Every string that reaches a page goes through here.

/** What pdf-lib's WinAnsi encoder will accept, expressed as a test. */
const winAnsiSafe = (s: string) => [...s].every((ch) => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF);
});

describe('the characters a phone actually inserts', () => {
  it('folds curly quotes to the straight one, keeping the word', () => {
    expect(pdfSafe('ng’ombe')).toBe("ng'ombe");
    expect(pdfSafe('‘nusu’')).toBe("'nusu'");
    expect(pdfSafe('“jumla”')).toBe('"jumla"');
  });

  it('folds the dashes a keyboard autocorrects', () => {
    expect(pdfSafe('mauzo – matumizi')).toBe('mauzo - matumizi');
    expect(pdfSafe('Jana—leo')).toBe('Jana-leo');
  });

  it('spells out an ellipsis rather than dropping it', () => {
    expect(pdfSafe('inaendelea…')).toBe('inaendelea...');
  });

  it('turns a non-breaking space into a real one', () => {
    expect(pdfSafe('TSh\u00A01,000')).toBe('TSh 1,000');
  });

  it('drops a zero-width character instead of drawing a gap', () => {
    expect(pdfSafe('daf\u200Btari')).toBe('daftari');
  });
});

describe('nothing that reaches a page can throw', () => {
  it('drops an emoji rather than killing the document', () => {
    // A product note with an emoji is normal on WhatsApp and fatal to WinAnsi.
    const out = pdfSafe('sukari 🍬 kilo 2');
    expect(winAnsiSafe(out)).toBe(true);
    expect(out).toContain('sukari');
    expect(out).toContain('kilo 2');
  });

  it('drops characters from another script', () => {
    const out = pdfSafe('daftari مرحبا 日本語');
    expect(winAnsiSafe(out)).toBe(true);
    expect(out).toContain('daftari');
  });

  it('turns a newline or tab into a space, so a row cannot break the layout', () => {
    expect(pdfSafe('mstari\nmbili')).toBe('mstari mbili');
    expect(pdfSafe('a\tb')).toBe('a b');
  });

  it('drops control characters entirely', () => {
    expect(winAnsiSafe(pdfSafe('a\u0000b\u001Fc'))).toBe(true);
    expect(pdfSafe('a\u0000b\u001Fc')).toBe('abc');
  });

  it('drops the 0x80-0x9F block where WinAnsi and Latin-1 disagree', () => {
    expect(winAnsiSafe(pdfSafe('a\u0081b\u008Dc'))).toBe(true);
  });

  it('keeps Latin-1 letters, which WinAnsi does hold', () => {
    expect(pdfSafe('café')).toBe('café');
    expect(winAnsiSafe(pdfSafe('café'))).toBe(true);
  });

  it('survives null, undefined and a number', () => {
    expect(pdfSafe(null)).toBe('');
    expect(pdfSafe(undefined)).toBe('');
    expect(pdfSafe(74200)).toBe('74200');
  });

  it('is safe for every character below 0x10000', () => {
    // The real guarantee: whatever a shop types, the encoder accepts the result.
    let sample = '';
    for (let c = 0; c < 0x2FF; c += 1) sample += String.fromCodePoint(c);
    sample += '€™✓→😀';
    expect(winAnsiSafe(pdfSafe(sample))).toBe(true);
  });
});

describe('clipping a column', () => {
  it('leaves a short value alone', () => {
    expect(pdfClip('daftari', 20)).toBe('daftari');
  });

  it('cuts a long one so it cannot run under the next column', () => {
    const out = pdfClip('nguvu ya sala kubwa ya kanisa la mtakatifu', 12);
    expect(out).toHaveLength(12);
  });

  it('cleans before it cuts, so the length is what is drawn', () => {
    const out = pdfClip('ng’ombe mzima wa kuchinja', 10);
    expect(out).toHaveLength(10);
    expect(winAnsiSafe(out)).toBe(true);
  });
});
