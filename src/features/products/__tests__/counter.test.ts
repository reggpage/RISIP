import { describe, expect, it } from 'vitest';
import {
  bandForQuantity,
  basketTotal,
  lineTotal,
  lineUnitPrice,
  type CounterLine,
} from '../products';

// The till's arithmetic. Every number a customer is asked to hand over comes
// through these four functions.

const line = (over: Partial<CounterLine> = {}): CounterLine => ({
  productKey: 'sukari', productName: 'Sukari kilo 1', barcode: '6011040121093',
  quantity: 1, retail: 3500, wholesale: 3200, wholesaleMinQty: 6, band: 'retail', ...over,
});

describe('which price a line is charged at', () => {
  it('is retail until the shop\'s own threshold is reached', () => {
    expect(bandForQuantity(1, 3200, 6)).toBe('retail');
    expect(bandForQuantity(5, 3200, 6)).toBe('retail');
    expect(bandForQuantity(6, 3200, 6)).toBe('wholesale');
    expect(bandForQuantity(20, 3200, 6)).toBe('wholesale');
  });

  it('is retail where the shop never set a wholesale price', () => {
    expect(bandForQuantity(50, null, null)).toBe('retail');
  });

  it('is retail where a wholesale price exists but no threshold does', () => {
    // Without a threshold the shop has not said when wholesale starts, and
    // charging it because somebody bought two would give money away.
    expect(bandForQuantity(50, 3200, null)).toBe('retail');
  });
});

describe('what the customer pays', () => {
  it('multiplies at the band the line is set to', () => {
    expect(lineUnitPrice(line({ quantity: 2 }))).toBe(3500);
    expect(lineTotal(line({ quantity: 2 }))).toBe(7000);
    expect(lineUnitPrice(line({ quantity: 6, band: 'wholesale' }))).toBe(3200);
    expect(lineTotal(line({ quantity: 6, band: 'wholesale' }))).toBe(19200);
  });

  it('falls back to retail when a line is set to wholesale it does not have', () => {
    // A tap cannot conjure a price the shop never registered.
    expect(lineUnitPrice(line({ wholesale: null, band: 'wholesale' }))).toBe(3500);
  });

  it('adds the basket the way the receipt reads', () => {
    const basket = [
      line({ quantity: 2 }),
      line({ barcode: '5449000000996', productKey: 'soda', productName: 'Soda', quantity: 12, retail: 1000, wholesale: 900, wholesaleMinQty: 12, band: 'wholesale' }),
    ];
    // 2 × 3,500 + 12 × 900
    expect(basketTotal(basket)).toBe(17800);
  });

  it('is zero for an empty basket, not NaN', () => {
    expect(basketTotal([])).toBe(0);
  });

  it('keeps shilling arithmetic exact', () => {
    const basket = [line({ quantity: 3, retail: 333.33, band: 'retail', wholesale: null })];
    expect(basketTotal(basket)).toBe(999.99);
  });
});
