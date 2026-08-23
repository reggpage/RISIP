import { describe, expect, it } from 'vitest';
import { computedAmount, recordKind, route } from '../../../../scripts/lib/route';
import { normalizeNumberWords } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parseStockCount } from '../../../../supabase/functions/_shared/whatsappStock';
import { parseSellingPrice } from '../../../../supabase/functions/_shared/whatsappSellingPrice';
import { parseSellingPriceBatch } from '../../../../supabase/functions/_shared/whatsappSellingPriceBatch';
import { cataloguePrefixResolution, nearestCatalogueName } from '../../../../supabase/functions/_shared/whatsappProductResolver';

// The chaos tier of scripts/interrogate.ts: money said out loud, a second
// person behind the counter, a payment method on the end of a line, and a
// customer taking goods without a price. None of these are edge cases in a
// Tanzanian duka — several are the default way the sentence gets typed.

describe('money said the way it is spoken', () => {
  // MEASURED FAILURE: "nimelipa umeme elfu ishirini" — twenty thousand
  // shillings — was recorded as TSh 20. It parsed, it confirmed, and nobody
  // was ever asked to look at it. A failure that parses is worse than one that
  // does not.
  it('multiplies by the word that makes it big', () => {
    expect(normalizeNumberWords('elfu tano')).toBe('5000');
    expect(normalizeNumberWords('elfu ishirini')).toBe('20000');
    expect(normalizeNumberWords('laki mbili')).toBe('200000');
    expect(normalizeNumberWords('milioni moja')).toBe('1000000');
    expect(normalizeNumberWords('mia tano')).toBe('500');
    expect(normalizeNumberWords('hamsini elfu')).toBe('50000');
  });

  it('adds the parts of a compound amount', () => {
    // "Elfu saba na mia tano" is seven thousand five hundred: the second
    // multiplier starts a new part.
    expect(normalizeNumberWords('elfu saba na mia tano')).toBe('7500');
    expect(normalizeNumberWords('laki moja na elfu hamsini')).toBe('150000');
    // "Elfu ishirini na tano" is twenty-five thousand: with no second
    // multiplier the compound belongs to the first one.
    expect(normalizeNumberWords('elfu ishirini na tano')).toBe('25000');
  });

  it('leaves ordinary numbers standing next to each other alone', () => {
    expect(normalizeNumberWords('daftari 5 na kalamu 2')).toBe('daftari 5 na kalamu 2');
    expect(normalizeNumberWords('nyama kilo moja na nusu')).toBe('nyama kilo 1.5');
  });

  it('records the amount that was actually meant', () => {
    expect(computedAmount('nimelipa umeme elfu ishirini')).toBe(20000);
    expect(computedAmount('nimelipa kodi laki mbili')).toBe(200000);
    expect(computedAmount('nimeuza daftari 5 kwa elfu saba na mia tano')).toBe(7500);
  });

  it('reads both shilling suffixes, not one of them', () => {
    expect(computedAmount('nimelipa umeme 20,000/=')).toBe(20000);
    expect(computedAmount('nimelipa umeme 20000/-')).toBe(20000);
  });
});

describe('a shop with two people in it', () => {
  // "Tumeuza" is not a variant. It is what gets typed the moment somebody is
  // employed, and it reached no parser at all.
  it('records what WE sold, bought and paid', () => {
    expect(recordKind('tumeuza daftari 5 kwa 7500')).toBe('sale');
    expect(computedAmount('tumeuza daftari 5 kwa 7500')).toBe(7500);
    expect(recordKind('tumenunua daftari 5 kwa 5000')).toBe('stock_purchase');
    expect(recordKind('tumelipa umeme 20000')).toBe('expense');
    expect(route('tumeuza daftari 5')).toBe('quantity_sale');
  });
});

describe('how it was paid is not what was sold', () => {
  it('reads a sale with the payment method on the end', () => {
    for (const said of [
      'nimeuza marker 5 cash',
      'nimeuza daftari 3 mpesa',
      'nimeuza daftari 3 taslimu',
    ]) {
      expect(route(said), said).toBe('quantity_sale');
    }
  });

  // "Mkopo" and "deni" are not payment methods. They say the goods left
  // without money, which is a different record entirely.
  it('never sweeps credit off the end of a line', () => {
    expect(route('nimeuza daftari 3 mkopo')).not.toBe('quantity_sale');
  });
});

describe('a number that is a quantity is not an amount', () => {
  // MEASURED FAILURE: "nimeuza daftari 3 mkopo" was recorded as a DEBT OF
  // THREE SHILLINGS. The first-person verb was read as a customer's name, and
  // the quantity was the only number left to be the money.
  it('refuses to invent a debt from a count', () => {
    expect(recordKind('nimeuza daftari 3 mkopo')).toBeNull();
    expect(recordKind('Juma amechukua daftari 3')).toBeNull();
  });

  it('still records a debt that names its money', () => {
    expect(recordKind('Juma amechukua sukari 12000')).toBe('debt_issued');
    expect(computedAmount('Juma amechukua sukari 12000')).toBe(12000);
    expect(recordKind('Mama Asha amechukua daftari 3 kwa 4500')).toBe('debt_issued');
    expect(computedAmount('Mama Asha amechukua daftari 3 kwa 4500')).toBe(4500);
  });
});

describe('the shortest way to ask what is on the shelf', () => {
  it('answers "zipo?" with the count, not the model', () => {
    for (const said of ['Vestline zipo?', 'daftari zipo', 'punch ziko']) {
      expect(route(said), said).toBe('stock_question');
    }
  });
});

describe('messages that must never become a record', () => {
  it('leaves a sentence that says nothing happened alone', () => {
    for (const said of ['sijauza chochote leo', 'hakuna kilichouzwa leo', 'leo hakuna mauzo']) {
      expect(recordKind(said), said).toBeNull();
    }
  });

  it('leaves noise alone', () => {
    for (const said of ['😀😀😀', '?????', '.....', '12345']) {
      expect(recordKind(said), said).toBeNull();
      expect(route(said), said).toBe('conversational_ai');
    }
  });
});

describe('a price change is never a stock count', () => {
  // MEASURED FAILURE, the owner's own thread. They asked to raise two selling
  // prices and Risip wrote it to the ledger as a STOCK COUNT — four thousand of
  // a product it invented called "ya velvet selling price", two thousand of one
  // called "na soda". It even asked NDIYO/HAPANA first, so the owner confirmed
  // damage that read like an ordinary confirmation.
  it('refuses to count a sentence that is about money', () => {
    for (const said of [
      'Unaweza kuongeza prices ya velvet selling price iwe 4000 na soda iwe 2000',
      'bei ya velvet napkin iwe 4000 na sodaa iwe 2000',
      'badilisha bei ya Velvet napkin iwe 4000',
    ]) {
      expect(parseStockCount(said), said).toBeNull();
      expect(route(said), said).not.toBe('stock_count');
      expect(route(said), said).not.toBe('stock_count_batch');
    }
  });

  it('reads it as the price change it is', () => {
    expect(parseSellingPrice('badilisha bei ya Velvet napkin iwe 4000'))
      .toEqual({ product: 'Velvet napkin', retail: 4000, wholesale: null, minQty: null });
    expect(parseSellingPrice('weka bei ya velvet napkin 4000'))
      .toEqual({ product: 'velvet napkin', retail: 4000, wholesale: null, minQty: null });
  });

  it('reads two prices set in one sentence', () => {
    const batch = parseSellingPriceBatch('bei ya velvet napkin iwe 4000 na sodaa iwe 2000');
    expect(batch?.prices).toEqual([
      { product: 'velvet napkin', retail: 4000, wholesale: null, minQty: null },
      { product: 'sodaa', retail: 2000, wholesale: null, minQty: null },
    ]);
    // The conjunction joins the sentence; it is not part of the name. "na soda"
    // was written into this shop's catalogue and stayed there.
    expect(batch?.prices.some((price) => /^na /i.test(price.product))).toBe(false);
  });

  it('still counts the shelf when the shelf is what was meant', () => {
    expect(parseStockCount('daftari ziwe 400')).toEqual({ product: 'daftari', quantity: 400, unit: null });
    expect(route('daftari ziwe 400 na kalamu ziwe 200')).toBe('stock_count_batch');
    expect(route('nina daftari 90')).toBe('stock_count');
  });
});

describe('a price written against a name nobody sells', () => {
  // MEASURED FAILURE, the owner's own thread: "Bei ya velvet badilisha iwe
  // 4500" created a PRODUCT called "velvet badilisha" at 4,500, sitting beside
  // the real Velvet napkin. The verb had been welded to the name, and no write
  // path had ever checked the catalogue before saving.
  it('peels the verb off either end of the name', () => {
    expect(parseSellingPrice('Bei ya velvet badilisha iwe 4500')?.product).toBe('velvet');
    expect(parseSellingPrice('badilisha bei ya velvet iwe 4500')?.product).toBe('velvet');
    expect(parseSellingPrice('weka bei ya velvet 4500')?.product).toBe('velvet');
  });

  // The name that survives has to reach a real product. One word of it is
  // enough when only one product starts that way.
  it('finds the shop’s own product from a fragment of its name', () => {
    const catalogue = ['Velvet napkin', 'Sodaa', 'daftari', 'nguvu ya sala'];
    expect(cataloguePrefixResolution('velvet', catalogue)).toMatchObject({
      kind: 'matched', match: { productName: 'Velvet napkin' },
    });
    expect(nearestCatalogueName('velvt', catalogue)).toBeNull();
    expect(nearestCatalogueName('sodaaa', catalogue)).toBe('Sodaa');
  });

  it('asks rather than guessing when a fragment fits two products', () => {
    const catalogue = ['kalamu za rangi', 'kalamu za wino'];
    expect(cataloguePrefixResolution('kalamu', catalogue)).toMatchObject({ kind: 'ambiguous' });
  });
});
