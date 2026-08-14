import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  marginPercent,
  needsCost,
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
