import { describe, expect, it } from 'vitest';
import { computedAmount, recordKind, route } from '../../../../scripts/lib/route';
import { normalizeNumberWords } from '../../../../supabase/functions/_shared/whatsappDailyRecords';

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
