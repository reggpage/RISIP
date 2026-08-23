import { describe, expect, it } from 'vitest';
import {
  parseStockCount,
  parseOutOfStockQuestion,
  parseStockQuestion,
  outOfStockReply,
  stockShortfall,
  stockCountConfirmation,
  stockListReply,
  stockReply,
  type StockRow,
} from '../../../../supabase/functions/_shared/whatsappStock';
import { productCostErrorMessage } from '../../../../supabase/functions/_shared/whatsappProductCosts';

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

  it('reads an explicit store count in a declared purchase unit', () => {
    expect(parseStockCount('store mafuta ndoo 2'))
      .toEqual({ product: 'mafuta', quantity: 2, unit: 'ndoo' });
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

describe('asking what has run out', () => {
  it('recognises natural Swahili and English questions', () => {
    expect(parseOutOfStockQuestion('Bidhaa gani zimeisha?')).toBe(true);
    expect(parseOutOfStockQuestion('nionyeshe bidhaa zenye stock 0')).toBe(true);
    expect(parseOutOfStockQuestion('products out of stock')).toBe(true);
    expect(parseOutOfStockQuestion('bidhaa ziko ngapi')).toBe(false);
  });

  it('answers concisely without the robotic reminder paragraph', () => {
    const said = outOfStockReply([
      row({ productName: 'Birika', onHand: 0 }),
      row({ productName: 'Daftari', onHand: -4 }),
      row({ productName: 'Kalamu', onHand: 8 }),
      row({ productName: 'Sabuni', hasCount: false }),
    ], 'sw');
    expect(said).toContain('• Birika');
    expect(said).toContain('• Daftari');
    expect(said).not.toContain('• Kalamu');
    expect(said).toContain('Bidhaa 1 bado hazijahesabiwa');
    expect(said).not.toMatch(/Kumbuka|si lazima ziwe zimeisha/);
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
    expect(reply).toMatch(/Bidhaa 1/);
    expect(reply).toContain('Kalamu');
  });

  it('does not silently stop after fifteen counted products', () => {
    const rows = Array.from({ length: 40 }, (_, index) => row({ productName: `Bidhaa ${index + 1}` }));
    const reply = stockListReply(rows, 'sw');
    expect(reply).toContain('Bidhaa 16 — 80');
    expect(reply).toContain('Bidhaa 40 — 80');
    expect(reply).toContain('40 zilizohesabiwa');
  });

  it('says nothing has been counted rather than showing zeros', () => {
    const reply = stockListReply([row({ productName: 'Daftari', hasCount: false })], 'sw');
    expect(reply).toMatch(/Sijawahi kuhesabu/);
    expect(reply).toMatch(/Bidhaa zilizosajiliwa: Daftari/);
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

describe('the unit-mismatch message keeps the useful half', () => {
  it('names both units instead of collapsing to "try again"', () => {
    // The server says which unit the product uses and which was offered. That
    // is exactly what the trader needs to convert; a generic retry is not.
    const error = {
      hint: 'unit_mismatch',
      message: 'this product is measured in kilo — a buying price must be per kilo, not per gunia',
    };
    expect(productCostErrorMessage(error, 'sw')).toBe('Bidhaa hii inapimwa kwa kilo, si gunia. Tumia kilo.');
    expect(productCostErrorMessage(error, 'en')).toBe('This product is measured in kilo, not gunia. Use kilo.');
  });

  it('falls back safely when the message is not the shape it expects', () => {
    const reply = productCostErrorMessage({ hint: 'unit_mismatch', message: 'something else' }, 'sw');
    expect(reply).toMatch(/kipimo/);
    expect(reply).not.toMatch(/undefined/);
  });

  it('still handles the codes it already knew', () => {
    expect(productCostErrorMessage({ hint: 'not_authorized' }, 'sw')).toMatch(/owner au accountant/);
    expect(productCostErrorMessage(null, 'sw')).toMatch(/jaribu tena/);
  });
});

describe('the words the welcome teaches, on one line', () => {
  it('reads "naongeza sukari 20" as a count, like the bulk form does', () => {
    // The welcome now teaches "naongeza bidhaa" for adding goods, and the bulk
    // form anchors the shelf. One line of the same words used to fall through
    // to "is this a sale or a purchase?", which nobody had asked.
    expect(parseStockCount('naongeza sukari 20')).toEqual({
      product: 'sukari', quantity: 20, unit: null, stated: 'add',
    });
    expect(parseStockCount('nimeongeza sukari kilo 20')).toEqual({
      product: 'sukari', quantity: 20, unit: 'kilo', stated: 'add',
    });
    expect(parseStockCount('naongeza bidhaa sukari 20')).toMatchObject({ product: 'sukari', quantity: 20 });
  });

  it('says plainly that twenty added is not twenty more', () => {
    const count = parseStockCount('naongeza sukari 20')!;
    const said = stockCountConfirmation(count, 30, 'sw');
    expect(said).toContain('sasa nimeweka 20');
    expect(said).toContain('nina sukari 50');
  });

  it('keeps the plain wording when the words were unambiguous', () => {
    const said = stockCountConfirmation(parseStockCount('nina sukari 20')!, 30, 'sw');
    expect(said).toContain('Hesabu yako ndiyo sahihi');
    expect(said).not.toContain('nina sukari 50');
  });

  it('still refuses a sale', () => {
    expect(parseStockCount('nimeuza sukari 20')).toBeNull();
  });
});

describe('the way the question is actually typed', () => {
  it('reads "ziko/zipo/kuna ngapi", which used to reach the model', () => {
    expect(parseStockQuestion('atlas ziko ngapi')).toEqual({ product: 'atlas' });
    expect(parseStockQuestion('daftari zipo ngapi?')).toEqual({ product: 'daftari' });
    expect(parseStockQuestion('kuna daftari ngapi')).toEqual({ product: 'daftari' });
  });

  it('ignores the place and keeps the goods', () => {
    expect(parseStockQuestion('daftari ziko ngapi stoo')).toEqual({ product: 'daftari' });
    expect(parseStockQuestion('sukari zimebaki ngapi dukani')).toEqual({ product: 'sukari' });
  });

  it('treats "bidhaa" as the whole shelf, not a product called bidhaa', () => {
    expect(parseStockQuestion('bidhaa ziko ngapi store')).toEqual({ product: null });
    expect(parseStockQuestion('nina bidhaa ngapi')).toEqual({ product: null });
    expect(parseStockQuestion('vitu ziko ngapi')).toEqual({ product: null });
  });

  it('never claims a question that belongs to another tool', () => {
    for (const other of [
      'mauzo ya leo ni ngapi', 'faida yangu ni ngapi', 'madeni ngapi',
      'wateja wangu ni wangapi', 'risiti ngapi zipo', 'matumizi ni ngapi',
    ]) {
      expect(parseStockQuestion(other), other).toBeNull();
    }
  });
});

describe('a shelf cannot hold minus eight', () => {
  const short = (over: Partial<StockRow> = {}): StockRow => ({
    productName: 'daftari', unit: null, measured: false, onHand: -8, hasCount: true,
    countedAt: '2026-08-15T16:23:10Z', boughtSince: 0, soldSince: 248,
    incompletePurchases: false, ...over,
  });

  it('shows zero and names the shortfall instead', () => {
    // PRODUCTION: daftari, counted 240, sold 248, bought 0 → the answer was
    // "zimebaki -8", which reads as stock and cannot be.
    const said = stockReply(short(), 'daftari', 'sw');
    expect(said).toContain('zimebaki 0');
    expect(said).not.toContain('-8');
    expect(said).toContain('Mauzo yamezidi kwa 8');
    expect(said).toContain('nina daftari 20');
  });

  it('says nothing extra when the count is healthy', () => {
    const said = stockReply(short({ onHand: 12, soldSince: 228 }), 'daftari', 'sw');
    expect(said).toContain('zimebaki 12');
    expect(said).not.toContain('⚠️ Mauzo yamezidi');
  });

  it('never prints a negative in the whole-shelf list, and names which ones', () => {
    const list = stockListReply([short(), short({ productName: 'kalamu', onHand: 4 })], 'sw');
    expect(list).not.toMatch(/-8/);
    expect(list).toContain('daftari — 0');
    expect(list).toContain('kalamu — 4');
    expect(list).toContain('mauzo yamezidi hesabu');
  });

  it('reports the shortfall as a positive number', () => {
    expect(stockShortfall(short())).toBe(8);
    expect(stockShortfall(short({ onHand: 3 }))).toBe(0);
  });
});

describe('setting the shelf, however the message arrived', () => {
  it('reads "jaza X ziwe N" as a count, not a sale or a purchase', () => {
    // The owner sent three of these and was asked "mauzo au manunuzi ya stock?"
    // "Ziwe" is neither: it is "let them be", which is what a count says.
    expect(parseStockCount('Daftari ziwe 400')).toEqual({ product: 'Daftari', quantity: 400, unit: null });
    expect(parseStockCount('jaza birika ziwe 100')).toEqual({ product: 'birika', quantity: 100, unit: null });
    expect(parseStockCount('sukari iwe kilo 12')).toEqual({ product: 'sukari', quantity: 12, unit: 'kilo' });
  });

  it('still refuses a movement', () => {
    expect(parseStockCount('nimeuza daftari 5')).toBeNull();
  });
});
