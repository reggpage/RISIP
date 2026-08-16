import { describe, expect, it } from 'vitest';
import {
  parseQuantityOnlySale,
  priceLine,
  quantitySaleConfirmation,
} from '../../../../supabase/functions/_shared/whatsappQuantitySale';

describe('a sale that names quantities and no money', () => {
  it('reads the owner’s own message', () => {
    // "Nimuza nguvu ya sala 8 marker 7 na anton wa padua 6" — sent for real,
    // and answered with a request for all three prices.
    expect(parseQuantityOnlySale('Nimuza nguvu ya sala 8, marker 7 na anton wa padua 6')?.items)
      .toEqual([
        { product: 'nguvu ya sala', quantity: 8 },
        { product: 'marker', quantity: 7 },
        { product: 'anton wa padua', quantity: 6 },
      ]);
  });

  it('reads a single product', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 5')?.items)
      .toEqual([{ product: 'daftari', quantity: 5 }]);
  });

  it('keeps three-word names whole', () => {
    expect(parseQuantityOnlySale('nimeuza st rita wa kashia 3')?.items)
      .toEqual([{ product: 'st rita wa kashia', quantity: 3 }]);
  });
});

describe('what it must never take', () => {
  it('leaves a sale that states its own prices alone', () => {
    // This is the comma-list case, and it must keep its money.
    expect(parseQuantityOnlySale('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500')).toBeNull();
    expect(parseQuantityOnlySale('nimeuza daftari 10 kila moja 1500')).toBeNull();
    expect(parseQuantityOnlySale('nimeuza nguvu ya sala 2 kwa 20000')).toBeNull();
    expect(parseQuantityOnlySale('nimeuza daftari 5 jumla 7500')).toBeNull();
  });

  it('leaves anything that is not a sale alone', () => {
    expect(parseQuantityOnlySale('nina daftari 90')).toBeNull();
    expect(parseQuantityOnlySale('hesabu ya stock')).toBeNull();
    expect(parseQuantityOnlySale('bei ya daftari rejareja 1500')).toBeNull();
    expect(parseQuantityOnlySale('')).toBeNull();
  });

  it('refuses a multi-line message, which belongs to the batch parser', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 5\nkalamu 3')).toBeNull();
  });
});

describe('pricing a line from the shop’s own list', () => {
  const pricing = { retail: 10000, wholesale: 9000, wholesaleMinQty: 5 };

  it('uses the trade price once the quantity reaches the threshold', () => {
    expect(priceLine({ product: 'nguvu ya sala', quantity: 8 }, pricing))
      .toEqual({ product: 'nguvu ya sala', quantity: 8, unitPrice: 9000, band: 'wholesale' });
  });

  it('uses retail below the threshold', () => {
    expect(priceLine({ product: 'nguvu ya sala', quantity: 2 }, pricing)?.unitPrice).toBe(10000);
  });

  it('gives the trade price at any quantity when it is by relationship', () => {
    expect(priceLine({ product: 'biblia', quantity: 1 }, { retail: 20000, wholesale: 18000, wholesaleMinQty: null })?.band)
      .toBe('wholesale');
  });

  it('returns nothing when the shop never set a price', () => {
    expect(priceLine({ product: 'marker', quantity: 7 }, { retail: null, wholesale: null, wholesaleMinQty: null }))
      .toBeNull();
  });
});

describe('what the trader is shown', () => {
  it('shows the arithmetic per line and says which price was used', () => {
    const reply = quantitySaleConfirmation([
      { product: 'nguvu ya sala', quantity: 8, unitPrice: 9000, band: 'wholesale' },
      { product: 'daftari', quantity: 2, unitPrice: 1500, band: 'retail' },
    ], 'sw');
    expect(reply).toContain('nguvu ya sala: 8 × TSh 9,000 (jumla) = TSh 72,000');
    expect(reply).toContain('daftari: 2 × TSh 1,500 = TSh 3,000');
    expect(reply).toContain('TSh 75,000');
    expect(reply).toMatch(/NDIYO/);
  });

  it('says the prices came from the trader, not from itself', () => {
    const reply = quantitySaleConfirmation(
      [{ product: 'daftari', quantity: 2, unitPrice: 1500, band: 'retail' }], 'sw');
    expect(reply).toMatch(/ulizoziweka mwenyewe/);
  });
});

describe('a till roll written one product per line', () => {
  it('reads the owner’s real thirty-line paste', () => {
    // The message that failed: quantities only, one per line, after the price
    // list was already set. It was refused outright because it had newlines.
    const sale = parseQuantityOnlySale(
      'nimeuza daftari 10\nnimeuza kalamu 20\nnimeuza penseli 25\nnimeuza rula 8');
    expect(sale?.items).toEqual([
      { product: 'daftari', quantity: 10 },
      { product: 'kalamu', quantity: 20 },
      { product: 'penseli', quantity: 25 },
      { product: 'rula', quantity: 8 },
    ]);
  });

  it('keeps phrase names across lines', () => {
    expect(parseQuantityOnlySale('nimeuza nguvu ya sala 5\nnimeuza kitabu cha hesabu 6')?.items)
      .toEqual([
        { product: 'nguvu ya sala', quantity: 5 },
        { product: 'kitabu cha hesabu', quantity: 6 },
      ]);
  });

  it('adds a product that appears on two lines', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 10\nnimeuza daftari 5')?.items)
      .toEqual([{ product: 'daftari', quantity: 15 }]);
  });

  it('still reads several products joined on one of the lines', () => {
    expect(parseQuantityOnlySale('nimeuza kalamu 12 na daftari 8\nnimeuza chaki 6 na duster 4')?.items)
      .toEqual([
        { product: 'kalamu', quantity: 12 },
        { product: 'daftari', quantity: 8 },
        { product: 'chaki', quantity: 6 },
        { product: 'duster', quantity: 4 },
      ]);
  });

  it('refuses the whole paste when one line states a price', () => {
    // Half a till roll priced from the list and half from the message would be
    // two different kinds of number added together.
    expect(parseQuantityOnlySale('nimeuza daftari 10\nnimeuza kalamu 3 kwa 1500')).toBeNull();
  });

  it('refuses the whole paste when one line is not a sale', () => {
    expect(parseQuantityOnlySale('nimeuza daftari 10\nfaida ya leo ni ngapi')).toBeNull();
  });
});
