import { describe, expect, it } from 'vitest';
import {
  type PriceBandChoice,
  applyPriceBands,
  type Band,
  needsBandChoice,
  parsePriceBandAnswer,
  priceBandQuestion,
} from '../../../../supabase/functions/_shared/whatsappPriceBand';
import { parseQuantityOnlySale, priceLine } from '../../../../supabase/functions/_shared/whatsappQuantitySale';

const choice = (over: Partial<PriceBandChoice> = {}): PriceBandChoice => ({
  index: 0, product: 'Viberiti', quantity: 2, retail: 500, wholesale: 400, ...over,
});

describe('when the question is worth asking', () => {
  const both = { retail: 500, wholesale: 400, wholesaleMinQty: null };

  it('asks when both prices exist and the line named neither', () => {
    expect(needsBandChoice(null, both, 2)).toBe(true);
  });

  it('never asks when the line already said which', () => {
    expect(needsBandChoice('retail', both, 2)).toBe(false);
    expect(needsBandChoice('wholesale', both, 200)).toBe(false);
  });

  it('never asks when the shop registered one price', () => {
    expect(needsBandChoice(null, { retail: 500, wholesale: null, wholesaleMinQty: null }, 2)).toBe(false);
    expect(needsBandChoice(null, { retail: null, wholesale: 400, wholesaleMinQty: null }, 2)).toBe(false);
  });

  it('never asks when both prices are the same number', () => {
    expect(needsBandChoice(null, { retail: 500, wholesale: 500, wholesaleMinQty: 5 }, 9)).toBe(false);
  });

  it('asks at every quantity, threshold or no threshold', () => {
    // The owner's own example is "viberiti 2" — under every threshold in their
    // price list — and they want the question there. Above the threshold it
    // matters more, not less: that is where a silent wholesale price quietly
    // shrinks the day's takings.
    const banded = { retail: 500, wholesale: 400, wholesaleMinQty: 5 };
    expect(needsBandChoice(null, banded, 2)).toBe(true);
    expect(needsBandChoice(null, banded, 5)).toBe(true);
    expect(needsBandChoice(null, banded, 40)).toBe(true);
  });

  it('still never asks about a one-price product, at any quantity', () => {
    // "its insane to ask if this is reja reja or jumla for ugali."
    const ugali = { retail: 1000, wholesale: null, wholesaleMinQty: null };
    expect(needsBandChoice(null, ugali, 1)).toBe(false);
    expect(needsBandChoice(null, ugali, 50)).toBe(false);
  });
});

describe('reading the answer', () => {
  const two = [choice(), choice({ index: 1, product: 'Daftari', quantity: 10, retail: 1000, wholesale: 800 })];

  it('takes one word for the whole question', () => {
    expect(parsePriceBandAnswer('jumla', two)).toEqual(['wholesale', 'wholesale']);
    expect(parsePriceBandAnswer('rejareja', two)).toEqual(['retail', 'retail']);
    expect(parsePriceBandAnswer('REJA REJA', two)).toEqual(['retail', 'retail']);
    expect(parsePriceBandAnswer('wholesale', two)).toEqual(['wholesale', 'wholesale']);
  });

  it('takes the row numbers when the sale was mixed', () => {
    expect(parsePriceBandAnswer('1 rejareja, 2 jumla', two)).toEqual(['retail', 'wholesale']);
    expect(parsePriceBandAnswer('1 rejareja 2 jumla', two)).toEqual(['retail', 'wholesale']);
    expect(parsePriceBandAnswer('1. jumla\n2. rejareja', two)).toEqual(['wholesale', 'retail']);
  });

  it('takes product names, and reads them before row numbers', () => {
    expect(parsePriceBandAnswer('daftari jumla', two)).toEqual([null, 'wholesale']);
    // The 2 here is the quantity being repeated, not row two.
    expect(parsePriceBandAnswer('viberiti 2 jumla', two)).toEqual(['wholesale', null]);
  });

  it('answers half the question without losing the half it was given', () => {
    expect(parsePriceBandAnswer('viberiti rejareja', two)).toEqual(['retail', null]);
  });

  it('is not an answer at all when no band word is in it', () => {
    expect(parsePriceBandAnswer('ndiyo', two)).toBeNull();
    expect(parsePriceBandAnswer('daftari ziko ngapi', two)).toBeNull();
    expect(parsePriceBandAnswer('', two)).toBeNull();
  });

  it('ignores a row number nobody was asked about', () => {
    expect(parsePriceBandAnswer('7 jumla', two)).toEqual(['wholesale', 'wholesale']);
  });
});

describe('the question itself', () => {
  it('shows one product both totals, so the choice is money not jargon', () => {
    const asked = priceBandQuestion([choice()], 'sw');
    expect(asked).toContain('Viberiti');
    expect(asked).toContain('TSh 1,000');  // 2 x 500 retail
    expect(asked).toContain('TSh 800');    // 2 x 400 wholesale
    expect(asked).toContain('REJAREJA');
  });

  it('numbers the rows when there are several, and asks once', () => {
    const two = [choice(), choice({ index: 1, product: 'Daftari', quantity: 10, retail: 1000, wholesale: 800 })];
    const asked = priceBandQuestion(two, 'sw');
    expect(asked).toMatch(/1\..*Viberiti/);
    expect(asked).toMatch(/2\..*Daftari/);
    expect((asked.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('says nothing when nothing is open', () => {
    expect(priceBandQuestion([], 'sw')).toBe('');
  });
});

describe('the answer put back on the sale', () => {
  const sale = [
    { product: 'viberiti', quantity: 2, band: null as Band | null },
    { product: 'ugali', quantity: 3, band: null as Band | null },
    { product: 'daftari', quantity: 10, band: 'retail' as Band | null },
  ];
  // Only rows 0 and 2 were open; ugali has one price, so it was never asked
  // about and its index is not in the list.
  const choices = [
    choice({ index: 0 }),
    choice({ index: 2, product: 'Daftari', quantity: 10, retail: 1000, wholesale: 800 }),
  ];

  it('lands each answer on the line it was asked about', () => {
    const applied = applyPriceBands(sale, choices, ['wholesale', 'retail']);
    expect(applied.map((item) => item.band)).toEqual(['wholesale', null, 'retail']);
  });

  it('leaves untouched every line the question skipped', () => {
    const applied = applyPriceBands(sale, choices, [null, null]);
    expect(applied).toEqual(sale);
  });

  it('prices the whole sale from the answer, and the total moves with it', () => {
    const answered = parsePriceBandAnswer('jumla', choices)!;
    const applied = applyPriceBands(sale, choices, answered);
    const pricing = { retail: 500, wholesale: 400, wholesaleMinQty: null };
    const first = priceLine(applied[0], pricing)!;
    expect(first.band).toBe('wholesale');
    expect(first.quantity * first.unitPrice).toBe(800);
    // The same sale answered the other way is 200 shillings more, which is the
    // entire reason this is a question and not a guess.
    const retail = applyPriceBands(sale, choices, parsePriceBandAnswer('rejareja', choices)!);
    const other = priceLine(retail[0], pricing)!;
    expect(other.quantity * other.unitPrice).toBe(1000);
  });
});

describe('the way out of the question', () => {
  it('teaches the header that stops it being asked again', () => {
    const two = [choice(), choice({ index: 1, product: 'Daftari', quantity: 10, retail: 1000, wholesale: 800 })];
    expect(priceBandQuestion(two, 'sw')).toContain('Mauzo ya leo rejareja');
  });

  it('is answered by the header itself, before the question is ever asked', () => {
    // The header's band reaches every line, so a list written this way has no
    // open rows at all.
    const sale = parseQuantityOnlySale('Mauzo ya leo jumla\ndaftari 10\nkalamu 4')!;
    expect(sale.items.map((item) => item.band)).toEqual(['wholesale', 'wholesale']);
    expect(sale.items.every((item) => !needsBandChoice(item.band, { retail: 1000, wholesale: 800 }))).toBe(true);
  });
});
