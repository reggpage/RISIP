import { describe, expect, it } from 'vitest';
import { lowStock, lowStockNotice } from '../../../../supabase/functions/_shared/whatsappLowStock';

const level = (productName: string, onHand: number, unit: string | null = null, hasCount = true) =>
  ({ productName, onHand, unit, hasCount });

describe('noticing that something is nearly gone', () => {
  it('flags a counted product at or below five pieces', () => {
    expect(lowStock([level('gundi', 4)]).map((row) => row.productName)).toEqual(['gundi']);
    expect(lowStock([level('gundi', 5)]).map((row) => row.productName)).toEqual(['gundi']);
    expect(lowStock([level('gundi', 6)])).toEqual([]);
  });

  it('uses a smaller threshold for goods sold by measure', () => {
    // Five pens left is a nuisance; five kilos of sugar is most of a sack.
    expect(lowStock([level('sukari', 5, 'kilo')])).toEqual([]);
    expect(lowStock([level('sukari', 2, 'kilo')]).map((row) => row.productName)).toEqual(['sukari']);
  });

  it('says nothing about a product nobody has counted', () => {
    // Never counted means unknown, not zero. Guessing would cry wolf on every
    // product the shop has not got round to counting.
    expect(lowStock([level('mafuta', 0, null, false)])).toEqual([]);
  });
});

describe('the line at the foot of the reply', () => {
  it('separates gone from nearly gone', () => {
    const notice = lowStockNotice([level('mayai', 0), level('soda', 4)], 'sw');
    expect(notice).toContain('*Zimeisha:* mayai');
    expect(notice).toContain('*Zinakaribia kuisha:* soda (4)');
  });

  it('carries the unit, so two kilos does not read as two sacks', () => {
    expect(lowStockNotice([level('sukari', 1.5, 'kilo')], 'sw')).toContain('sukari (1.5 kilo)');
  });

  it('is empty when nothing is low, so a quiet day stays quiet', () => {
    expect(lowStockNotice([level('daftari', 200)], 'sw')).toBe('');
    expect(lowStockNotice([], 'sw')).toBe('');
  });
});
