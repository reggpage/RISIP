import { describe, expect, it } from 'vitest';
import { receiptFilename, receiptText } from '../receipt';
import type { CounterLine } from '../products';

// The slip a customer keeps. Every figure on it is one they were charged, so it
// is built from the lines that were actually rung up and nothing else.

const line = (over: Partial<CounterLine> = {}): CounterLine => ({
  productKey: 'sukari', productName: 'Sukari kilo 1', barcode: '6011040121093',
  quantity: 2, retail: 3500, wholesale: 3200, wholesaleMinQty: 6, band: 'retail', ...over,
});

const at = new Date('2026-08-21T15:30:00Z');

describe('the receipt as a WhatsApp message', () => {
  const receipt = {
    businessName: 'St. Ritha Bookshop',
    at,
    lines: [
      line(),
      line({ productKey: 'soda', productName: 'Soda', quantity: 12, retail: 1000, wholesale: 900, wholesaleMinQty: 12, band: 'wholesale' }),
    ],
  };

  it('names the shop, every item, and what each came to', () => {
    const text = receiptText(receipt, 'sw');
    expect(text).toContain('St. Ritha Bookshop');
    expect(text).toContain('2 × Sukari kilo 1');
    expect(text).toContain('12 × Soda');
    expect(text).toContain('TSh 7,000');    // 2 × 3,500
    expect(text).toContain('TSh 10,800');   // 12 × 900, the wholesale price used
  });

  it('totals what the lines total, never something else', () => {
    expect(receiptText(receipt, 'sw')).toContain('JUMLA: TSh 17,800');
    expect(receiptText(receipt, 'en')).toContain('TOTAL: TSh 17,800');
  });

  it('is plain text, so it survives being pasted anywhere', () => {
    const text = receiptText(receipt, 'sw');
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text.split('\n').length).toBeGreaterThan(5);
  });

  it('says thank you in the language the shop is using', () => {
    expect(receiptText(receipt, 'sw')).toContain('Asante');
    expect(receiptText(receipt, 'en')).toContain('Thank you');
  });

  it('handles a single item without looking broken', () => {
    const one = { ...receipt, lines: [line({ quantity: 1 })] };
    const text = receiptText(one, 'sw');
    expect(text).toContain('1 × Sukari kilo 1');
    expect(text).toContain('JUMLA: TSh 3,500');
  });
});

describe('the receipt as a saved picture', () => {
  it('is named so a shopkeeper can find it in their gallery', () => {
    const name = receiptFilename({ businessName: 'St. Ritha Bookshop', at, lines: [line()] });
    expect(name).toMatch(/^risiti-st-ritha-bookshop-\d{8}\d{4}\.png$/);
  });

  it('never produces a filename with characters a phone will refuse', () => {
    const name = receiptFilename({ businessName: 'Mama/Asha "Duka" \\ 2', at, lines: [line()] });
    expect(name).not.toMatch(/[/\\"']/);
    expect(name.endsWith('.png')).toBe(true);
  });

  it('still has a name when the business has none we can slug', () => {
    expect(receiptFilename({ businessName: '???', at, lines: [line()] })).toContain('duka');
  });
});
