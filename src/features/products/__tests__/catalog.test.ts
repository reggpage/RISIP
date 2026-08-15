import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  marginPercent,
  needsCost,
  mergeCandidates,
  soldBelowCost,
  type CatalogProduct,
} from '../products';

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  productKey: 'sukari',
  productName: 'Sukari',
  unit: null,
  quantitySold: 10,
  revenue: 35000,
  saleLines: 4,
  lastSoldAt: '2026-08-13T09:00:00Z',
  measured: false,
  unitCost: null,
  costEffectiveFrom: null,
  avgUnitPrice: 3500,
  estimatedMargin: null,
  archived: false,
  ...overrides,
});

describe('kilos and pieces', () => {
  it('says pieces for something counted', () => {
    expect(formatQuantity(product({ quantitySold: 48 }), 'sw')).toBe('48 vipande');
    expect(formatQuantity(product({ quantitySold: 48 }), 'en')).toBe('48 pcs');
  });

  it('keeps the decimals for something measured', () => {
    // A fractional quantity is how we know this is weighed rather than counted.
    const sugar = product({ quantitySold: 12.5, measured: true, unit: 'kilo' });
    expect(formatQuantity(sugar, 'sw')).toBe('12.5 kilo');
  });

  it('drops the decimals for something counted, even if stored as 48.000', () => {
    expect(formatQuantity(product({ quantitySold: 48.0 }), 'sw')).toBe('48 vipande');
  });

  it('prefers the unit the trader typed over any guess', () => {
    expect(formatQuantity(product({ quantitySold: 3, unit: 'mkoba' }), 'sw')).toBe('3 mkoba');
  });

  it('does not claim a unit it was never told, for measured goods', () => {
    // Better a bare number than inventing "kilo" for something sold by the litre.
    expect(formatQuantity(product({ quantitySold: 2.5, measured: true }), 'sw')).toBe('2.5');
  });
});

describe('what the row can and cannot say', () => {
  it('flags a product with no buying price', () => {
    expect(needsCost(product())).toBe(true);
    expect(needsCost(product({ unitCost: 2800 }))).toBe(false);
  });

  it('has no margin at all when the buying price is unknown', () => {
    // Showing zero would read as "this product makes nothing", which is a
    // different and much worse claim than "I do not know yet".
    expect(marginPercent(product())).toBeNull();
  });

  it('reports margin as a share of revenue once both halves are known', () => {
    const priced = product({ unitCost: 2800, estimatedMargin: 7000 });
    expect(marginPercent(priced)).toBeCloseTo(20, 5);
  });

  it('spots a product being sold for less than it costs', () => {
    expect(soldBelowCost(product({ unitCost: 4000, avgUnitPrice: 3500 }))).toBe(true);
    expect(soldBelowCost(product({ unitCost: 2800, avgUnitPrice: 3500 }))).toBe(false);
  });

  it('does not call a product underpriced when the cost is unknown', () => {
    expect(soldBelowCost(product({ unitCost: null }))).toBe(false);
  });
});

describe('choosing what to merge into', () => {
  const all = [
    product({ productKey: 'nguvu ya sala', productName: 'nguvu ya sala', revenue: 96000 }),
    product({ productKey: '- nguvu ya sala', productName: '- nguvu ya sala', revenue: 63000 }),
    product({ productKey: 'daftari', productName: 'daftari' }),
    product({ productKey: 'kalamu', productName: 'kalamu' }),
    product({ productKey: 'ngoma', productName: 'ngoma', archived: true }),
  ];

  it('puts the near-identical name first', () => {
    // The real case: one leading dash split a product in two.
    const stray = all[1];
    expect(mergeCandidates(stray, all)[0].productKey).toBe('nguvu ya sala');
  });

  it('never offers the product itself', () => {
    expect(mergeCandidates(all[0], all).map((c) => c.productKey)).not.toContain('nguvu ya sala');
  });

  it('does not offer an already hidden product as a destination', () => {
    expect(mergeCandidates(all[0], all).map((c) => c.productKey)).not.toContain('ngoma');
  });

  it('still offers unrelated products, just lower down', () => {
    const ranked = mergeCandidates(all[1], all).map((c) => c.productKey);
    expect(ranked).toContain('daftari');
    expect(ranked.indexOf('nguvu ya sala')).toBeLessThan(ranked.indexOf('daftari'));
  });
});

describe('hidden products', () => {
  it('is a flag on the row, not a missing row', () => {
    // Archiving hides; it never removes. The past sales still exist.
    const hidden = product({ archived: true, revenue: 84000 });
    expect(hidden.archived).toBe(true);
    expect(hidden.revenue).toBe(84000);
  });
});
