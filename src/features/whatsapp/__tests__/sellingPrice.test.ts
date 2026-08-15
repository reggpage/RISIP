import { describe, expect, it } from 'vitest';
import {
  parseSellingPrice,
  priceBandNotice,
  sellingPriceConfirmation,
} from '../../../../supabase/functions/_shared/whatsappSellingPrice';

describe('the way a trader states a price list', () => {
  it('reads the owner’s own Kariakoo example', () => {
    // "kinauzwa 10,000 bei yake ya rejareja lakini … 9,000 kwa jumla kwanzia pcs 5"
    expect(parseSellingPrice('bei ya nguvu ya sala rejareja 10000 jumla 9000 kuanzia pcs 5'))
      .toEqual({ product: 'nguvu ya sala', retail: 10000, wholesale: 9000, minQty: 5 });
  });

  it('reads it however the numbers come out', () => {
    expect(parseSellingPrice('nguvu ya sala: rejareja ni 10000, jumla ni 9000 kuanzia 5'))
      .toEqual({ product: 'nguvu ya sala', retail: 10000, wholesale: 9000, minQty: 5 });
    expect(parseSellingPrice('bei ya daftari rejareja 1500 jumla 1300 kuanzia 12'))
      .toEqual({ product: 'daftari', retail: 1500, wholesale: 1300, minQty: 12 });
  });

  it('takes a trade price with no quantity, for the regular customer', () => {
    // The owner described exactly this: a regular pays less because they come
    // back, not because they bought twenty.
    expect(parseSellingPrice('bei ya biblia rejareja 20000 kwa mteja wa mara kwa mara 18000'))
      .toEqual({ product: 'biblia', retail: 20000, wholesale: 18000, minQty: null });
  });

  it('takes a single price, because most shops have one', () => {
    expect(parseSellingPrice('bei ya kalamu rejareja 500'))
      .toEqual({ product: 'kalamu', retail: 500, wholesale: null, minQty: null });
  });

  it('reads thousands written with a dot', () => {
    expect(parseSellingPrice('bei ya kamusi rejareja 25.000')?.retail).toBe(25000);
  });
});

describe('what it must never claim', () => {
  it('leaves a sale alone', () => {
    // The dangerous confusion: a sale names a product and a price too.
    expect(parseSellingPrice('nimeuza nguvu ya sala 5 kila moja 12000')).toBeNull();
    expect(parseSellingPrice('nimeuza daftari 10 kila moja 1500')).toBeNull();
  });

  it('leaves the buying cost to its own parser', () => {
    expect(parseSellingPrice('bei ya kununua nguvu ya sala ni 8000')).toBeNull();
    expect(parseSellingPrice('unga unanigharimu 900 kwa kilo')).toBeNull();
  });

  it('leaves a stock count alone', () => {
    expect(parseSellingPrice('nina daftari 90')).toBeNull();
    expect(parseSellingPrice('nimehesabu sukari kilo 12.5')).toBeNull();
  });

  it('ignores ordinary conversation', () => {
    expect(parseSellingPrice('faida yangu ni ngapi')).toBeNull();
    expect(parseSellingPrice('habari za asubuhi')).toBeNull();
    expect(parseSellingPrice('')).toBeNull();
  });

  it('refuses a wholesale price above the retail one', () => {
    // A typo every time, never a business model.
    expect(parseSellingPrice('bei ya daftari rejareja 1500 jumla 2000')).toBeNull();
  });

  it('refuses a bulk quantity with no wholesale price to attach it to', () => {
    expect(parseSellingPrice('bei ya daftari rejareja 1500 kuanzia 5')).toBeNull();
  });
});

describe('what the trader is shown', () => {
  it('lays both prices out before saving anything', () => {
    const reply = sellingPriceConfirmation(
      { product: 'Nguvu ya Sala', retail: 10000, wholesale: 9000, minQty: 5 }, 'sw');
    expect(reply).toContain('Rejareja: TSh 10,000');
    expect(reply).toContain('Jumla: TSh 9,000 (kuanzia 5)');
    expect(reply).toMatch(/NDIYO/);
  });

  it('says who the trade price is for when there is no quantity', () => {
    expect(sellingPriceConfirmation(
      { product: 'Biblia', retail: 20000, wholesale: 18000, minQty: null }, 'sw'))
      .toContain('(mteja wa mara kwa mara)');
  });

  it('shows one line for a single-price product', () => {
    const reply = sellingPriceConfirmation(
      { product: 'Kalamu', retail: 500, wholesale: null, minQty: null }, 'sw');
    expect(reply).toContain('Rejareja: TSh 500');
    expect(reply).not.toMatch(/Jumla/);
  });
});

describe('warning on a sale', () => {
  it('says nothing about a wholesale sale, which is the shop working', () => {
    // Warning on every trade sale would teach people to ignore the line, and
    // then the one that mattered would be ignored too.
    expect(priceBandNotice([{ product: 'nguvu ya sala', unitPrice: 9000, band: 'wholesale' }], 'sw'))
      .toBe('');
    expect(priceBandNotice([{ product: 'nguvu ya sala', unitPrice: 10000, band: 'retail' }], 'sw'))
      .toBe('');
  });

  it('speaks up when a sale went under both prices', () => {
    const notice = priceBandNotice([{ product: 'nguvu ya sala', unitPrice: 7000, band: 'below' }], 'sw');
    expect(notice).toContain('nguvu ya sala — TSh 7,000');
    expect(notice).toMatch(/Chini ya bei zako/);
  });

  it('does not tell anybody they were wrong', () => {
    // Only they know whether it was a decision or a slip.
    const notice = priceBandNotice([{ product: 'x', unitPrice: 1, band: 'below' }], 'sw');
    expect(notice).toMatch(/Kama ni punguzo la makusudi, sawa/);
  });

  it('names only the lines that went under, not the whole sale', () => {
    const notice = priceBandNotice([
      { product: 'nguvu ya sala', unitPrice: 7000, band: 'below' },
      { product: 'daftari', unitPrice: 1500, band: 'retail' },
    ], 'sw');
    expect(notice).toContain('nguvu ya sala');
    expect(notice).not.toContain('daftari');
  });

  it('says nothing at all about unpriced products', () => {
    expect(priceBandNotice([{ product: 'kalamu', unitPrice: 500, band: 'unpriced' }], 'sw')).toBe('');
  });
});
