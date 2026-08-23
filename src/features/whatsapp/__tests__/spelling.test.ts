import { describe, expect, it } from 'vitest';
import { correctControlWords, correctWord, withinOneEdit } from '../../../../supabase/functions/_shared/whatsappSpelling';
import {
  isDailyRecordCandidate,
  isDailyRecordConfirmation,
  isDailyRecordRejection,
  parseDailyRecord,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parseQuantityOnlySale } from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import { parseStockCount } from '../../../../supabase/functions/_shared/whatsappStock';

// Every case here was typed by the owner on a real phone and got the wrong
// answer. A shopkeeper working one-handed behind a counter transposes letters;
// that must not decide whether money came in or went out.

describe('one slip in a word that carries a decision', () => {
  it('reads a sale whose verb had two letters swapped', () => {
    // "nimueza daftar 8, nguvu ya sala 10, kikombe 6" was not a sale at all.
    // No verb was found, so it fell to "is this a sale or a purchase?", and
    // answering "mauzo" recorded a PRODUCT called "nimueza daftar".
    const said = 'nimueza daftar 8, nguvu ya sala 10, kikombe 6';
    expect(isDailyRecordCandidate(said)).toBe(true);
    const sale = parseQuantityOnlySale(said);
    expect(sale?.items.map((item) => item.product)).toEqual(['daftar', 'nguvu ya sala', 'kikombe']);
    expect(sale?.items.map((item) => item.quantity)).toEqual([8, 10, 6]);
  });

  it('leaves the product name alone for the catalogue to resolve', () => {
    // "daftar" scores 0.67 against "daftari" in the database, well over the
    // 0.45 floor. Guessing at product names here would be guessing without the
    // one thing that can settle it: the shop's own list.
    expect(correctWord('daftar')).toBeNull();
    expect(correctWord('kikombe')).toBeNull();
    expect(correctWord('birika')).toBeNull();
  });

  it('takes a yes that was typed with the wrong first letter', () => {
    // "mdiyo" left a confirmed sale unsaved and re-sent the question.
    expect(isDailyRecordConfirmation('mdiyo')).toBe(true);
    expect(isDailyRecordConfirmation('ndiyo')).toBe(true);
    expect(isDailyRecordRejection('hapan')).toBe(true);
  });

  it('takes the price band and the count words', () => {
    expect(correctControlWords('jumia')).toBe('jumla');
    expect(correctControlWords('rejarej')).toBe('rejareja');
    expect(correctControlWords('nimeuza daftari mbii')).toBe('nimeuza daftari mbili');
  });

  it('refuses to guess when a word could be two things', () => {
    // A verb decides which way money moved. Two candidates is not an answer.
    expect(correctWord('nime')).toBeNull();
    expect(correctWord('ni')).toBeNull();
  });

  it('never rewrites ordinary Swahili that sits one letter from a control word', () => {
    // "tabu" is trouble, not three.
    for (const word of ['tabu', 'kazi', 'leo', 'maji', 'soda', 'sukari', 'sabuni', 'mkate', 'nyama']) {
      expect(correctWord(word), word).toBeNull();
    }
  });

  it('leaves numbers, punctuation and casing exactly as typed', () => {
    expect(correctControlWords('Nimueza daftari 8, kikombe 6'))
      .toBe('Nimeuza daftari 8, kikombe 6');
    expect(correctControlWords('12,500/=')).toBe('12,500/=');
  });

  it('still records the sale it was always meant to record', () => {
    const parsed = parseDailyRecord('nimueza daftari 5 kwa 7500', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.kind).toBe('sale');
    expect(parsed.record.amount).toBe(7500);
  });
});

describe('the edit distance itself', () => {
  it('counts a swap of neighbours as one', () => {
    expect(withinOneEdit('nimueza', 'nimeuza')).toBe(true);
    expect(withinOneEdit('mdiyo', 'ndiyo')).toBe(true);
    expect(withinOneEdit('hapan', 'hapana')).toBe(true);
    expect(withinOneEdit('mbii', 'mbili')).toBe(true);
  });

  it('stops at one', () => {
    expect(withinOneEdit('nimuza', 'nimenunua')).toBe(false);
    expect(withinOneEdit('sukari', 'sukali baridi')).toBe(false);
    expect(withinOneEdit('', 'ndiyo')).toBe(false);
  });
});

describe('what a name is, without a list of names', () => {
  // MEASURED FAILURE, mine: the first version of this file turned "Juma" into
  // "jumla" and "nani" into "nane". A customer's name became a price band and
  // "who owes me" became "eight". A name can be anything, so the protection is
  // the POSITION: a word standing in front of "amechukua" or "amelipa" is a
  // person, whatever it looks like.
  it('never rewrites the word in front of a party verb', () => {
    for (const said of [
      'Juma amechukua sukari 12000',
      'Mzee Juma amelipa deni 5000',
      'Mama Asha amechukua sukari 12000',
      'nani amechukua zaidi',
    ]) {
      expect(correctControlWords(said), said).toBe(said);
    }
  });

  it('never rewrites a question word', () => {
    for (const said of ['nani anadaiwa', 'bidhaa gani zimeisha', 'faida ni ngapi', 'lini']) {
      expect(correctControlWords(said), said).toBe(said);
    }
  });

  it('never guesses at a number, because a wrong number is money', () => {
    // "nane" is one edit from "nani", "tatu" one from "tabu". Only exact,
    // seen-in-the-field misspellings are mapped.
    expect(correctWord('nane')).toBeNull();
    expect(correctWord('tatu')).toBeNull();
    expect(correctWord('tabu')).toBeNull();
    expect(correctWord('mbii')).toBe('mbili');
  });
});

describe('a slip that changes which way the money went', () => {
  // MEASURED, from the database-driven interrogation (scripts/interrogate.ts):
  // "Juma amleipa deni 10000" was recorded as a DEBT ISSUED — ten thousand
  // going OUT to Juma — when he had just walked in and paid it back.
  it('reads a payment whose verb had two letters swapped', () => {
    expect(correctControlWords('Juma amleipa deni 10000')).toBe('Juma amelipa deni 10000');
    const parsed = parseDailyRecord('Juma amleipa deni 10000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.kind).toBe('customer_payment');
    expect(parsed.record.amount).toBe(10000);
  });

  it('still leaves the name in front of the mistyped verb alone', () => {
    expect(correctControlWords('Juma amechkua sukari 12000')).toBe('Juma amechukua sukari 12000');
    expect(correctControlWords('Mama Asha amleipa 5000')).toBe('Mama Asha amelipa 5000');
  });

  // A name can look exactly like a party verb. "Amelia" is one edit from
  // "amelipa", so the position has to decide: at the head of a message, or
  // straight after a title, a word that shape is a person.
  it('never turns a name into a verb', () => {
    expect(correctControlWords('Amelia 5000')).toBe('Amelia 5000');
    expect(correctControlWords('Mama Amelia 5000')).toBe('Mama Amelia 5000');
    expect(correctControlWords('Amelia amechukua sukari')).toBe('Amelia amechukua sukari');
  });
});

describe('a slip in a word that counts the shelf', () => {
  // MEASURED: "kikokotoo zimbeaki 17" was not a count. It fell through to the
  // bare goods list, where "kikokotoo zimbeaki" became a PRODUCT NAME the shop
  // was then offered the chance to register — which is where a catalogue full
  // of names nobody sells comes from.
  it('reads a count whose verb was mistyped', () => {
    expect(parseStockCount('kikokotoo zimbeaki 17')).toEqual({ product: 'kikokotoo', quantity: 17, unit: null });
    expect(parseStockCount('nimehesbau manila 63')).toEqual({ product: 'manila', quantity: 63, unit: null });
    expect(parseStockCount('nna manila 63')).toEqual({ product: 'manila', quantity: 63, unit: null });
  });

  it('reads the same sentence with the verb in front', () => {
    expect(parseStockCount('zimebaki manila 63')).toEqual({ product: 'manila', quantity: 63, unit: null });
  });

  it('still refuses to read a sale as a count', () => {
    expect(parseStockCount('nimeuza daftari 90')).toBeNull();
    expect(parseStockCount('nimueza daftari 90')).toBeNull();
  });
});

describe('the concord letter is grammar, not a typo', () => {
  // MEASURED FAILURE, MINE: "Nini kiliuza zaidi juzi?" — which product sold
  // most the day before yesterday — was rewritten to "Nini niliuza zaidi
  // juzi", and a product ranking became a question about the owner. Swahili
  // agrees its verbs with one letter at the front, so half this vocabulary
  // sits one substitution away from a real word that means something else.
  it('never swaps one subject prefix for another', () => {
    expect(correctControlWords('Nini kiliuza zaidi juzi?')).toBe('Nini kiliuza zaidi juzi?');
    expect(correctControlWords('bidhaa gani zimeisha')).toBe('bidhaa gani zimeisha');
    expect(correctControlWords('kimeuza sana')).toBe('kimeuza sana');
  });

  // A first-letter slip is still a slip when the letter is not a prefix at all.
  it('still takes a yes typed with the wrong first letter', () => {
    expect(correctControlWords('mdiyo')).toBe('ndiyo');
  });

  // MEASURED FAILURE, MINE: "stock" was briefly in the vocabulary and rewrote
  // "Glue stick" to "Glue stock". Product names are an open set.
  it('never touches a product name that resembles a vocabulary word', () => {
    expect(correctControlWords('nimeuza leo Glue stick 1')).toBe('nimeuza leo Glue stick 1');
  });
});
