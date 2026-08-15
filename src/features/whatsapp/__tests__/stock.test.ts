import { describe, expect, it } from 'vitest';
import {
  parseStockCount,
  parseStockQuestion,
  stockCountConfirmation,
  stockListReply,
  stockReply,
  type StockRow,
} from '../../../../supabase/functions/_shared/whatsappStock';

const row = (overrides: Partial<StockRow> = {}): StockRow => ({
  productName: 'Daftari',
  unit: null,
  measured: false,
  onHand: 80,
  hasCount: true,
  countedAt: '2026-08-13T09:00:00Z',
  boughtSince: 30,
  soldSince: 40,
  incompletePurchases: false,
  ...overrides,
});

describe('recording a count', () => {
  it('reads the ways people state what is on the shelf', () => {
    expect(parseStockCount('nina daftari 90')).toEqual({ product: 'daftari', quantity: 90, unit: null });
    expect(parseStockCount('nimehesabu daftari 90')).toEqual({ product: 'daftari', quantity: 90, unit: null });
    expect(parseStockCount('daftari zimebaki 90')).toEqual({ product: 'daftari', quantity: 90, unit: null });
  });

  it('reads a count by weight', () => {
    expect(parseStockCount('nina sukari kilo 12.5')).toEqual({ product: 'sukari', quantity: 12.5, unit: 'kilo' });
    expect(parseStockCount('nimehesabu mafuta 20 lita')).toEqual({ product: 'mafuta', quantity: 20, unit: 'lita' });
  });

  it('accepts zero, because an empty shelf is a real count', () => {
    expect(parseStockCount('nina daftari 0')).toEqual({ product: 'daftari', quantity: 0, unit: null });
  });

  it('refuses a movement, which would wipe the shelf if misread', () => {
    // A count overwrites what Risip believed. "nimeuza daftari 90" is a sale.
    expect(parseStockCount('nimeuza daftari 90')).toBeNull();
    expect(parseStockCount('nimenunua stock ya daftari 100 kila moja 900')).toBeNull();
    expect(parseStockCount('Asha amelipa 10000')).toBeNull();
  });

  it('refuses anything that is not a product and a number', () => {
    expect(parseStockCount('nina 90')).toBeNull();
    expect(parseStockCount('habari')).toBeNull();
    expect(parseStockCount('')).toBeNull();
  });
});

describe('asking what is left', () => {
  it('reads the question that started this', () => {
    // Typed on the live number, and refused at the time.
    expect(parseStockQuestion('Bibilia ndogo ninazo ngapi?')).toEqual({ product: 'Bibilia ndogo' });
  });

  it('reads the other shapes of the same question', () => {
    expect(parseStockQuestion('daftari zimebaki ngapi?')).toEqual({ product: 'daftari' });
    expect(parseStockQuestion('stock ya sukari')).toEqual({ product: 'sukari' });
    expect(parseStockQuestion('how many daftari do i have')).toEqual({ product: 'daftari' });
  });

  it('reads a request for the whole list', () => {
    expect(parseStockQuestion('nionyeshe stock')).toEqual({ product: null });
  });

  it('does not claim an unrelated question', () => {
    expect(parseStockQuestion('faida yangu ni ngapi')).toBeNull();
    expect(parseStockQuestion('nani anadaiwa')).toBeNull();
  });
});

describe('answering honestly', () => {
  it('states the figure once a count anchors it', () => {
    const reply = stockReply(row(), 'daftari', 'sw');
    expect(reply).toContain('zimebaki 80');
    expect(reply).toMatch(/Tangu ulipohesabu/);
  });

  it('never states a stock figure when nobody ever counted', () => {
    // A number presented as stock when the shelf was never counted is worse
    // than no number: it will be believed, and it will be wrong.
    const reply = stockReply(row({ hasCount: false, onHand: -48, soldSince: 48, boughtSince: 0 }), 'daftari', 'sw');
    expect(reply).not.toContain('-48');
    expect(reply).not.toMatch(/zimebaki/);
    expect(reply).toMatch(/Sijawahi kuhesabu/);
    expect(reply).toContain('nina Daftari 90');   // tells them how to fix it
  });

  it('admits a purchase that named no quantity', () => {
    expect(stockReply(row({ incompletePurchases: true }), 'daftari', 'sw'))
      .toMatch(/hayakutaja idadi/);
  });

  it('says so plainly when the product is unknown', () => {
    expect(stockReply(null, 'sukari', 'sw')).toContain('sukari');
    expect(stockReply(null, 'sukari', 'sw')).toMatch(/Sina rekodi/);
  });

  it('shows the unit for measured goods', () => {
    expect(stockReply(row({ unit: 'kilo', measured: true, onHand: 12.5 }), 'sukari', 'sw'))
      .toContain('12.5 kilo');
  });
});

describe('the whole list', () => {
  it('lists only what has actually been counted', () => {
    const reply = stockListReply([row(), row({ productName: 'Kalamu', hasCount: false })], 'sw');
    expect(reply).toContain('Daftari — 80');
    expect(reply).not.toContain('Kalamu —');
    expect(reply).toMatch(/1 bidhaa|Bidhaa 1/);
  });

  it('says nothing has been counted rather than showing zeros', () => {
    expect(stockListReply([row({ hasCount: false })], 'sw')).toMatch(/Sijawahi kuhesabu/);
    expect(stockListReply([], 'sw')).toMatch(/Sijahesabu/);
  });
});

describe('confirming a count', () => {
  it('names the difference from what Risip believed', () => {
    const reply = stockCountConfirmation({ product: 'Daftari', quantity: 90, unit: null }, 80, 'sw');
    expect(reply).toContain('90');
    expect(reply).toContain('80');
    expect(reply).toMatch(/Hesabu yako ndiyo sahihi/);
  });

  it('says nothing about a difference when there is none', () => {
    expect(stockCountConfirmation({ product: 'Daftari', quantity: 80, unit: null }, 80, 'sw'))
      .not.toMatch(/Nilikuwa nadhani/);
    expect(stockCountConfirmation({ product: 'Daftari', quantity: 90, unit: null }, null, 'sw'))
      .not.toMatch(/Nilikuwa nadhani/);
  });
});
