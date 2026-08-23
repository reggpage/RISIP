import { describe, expect, it } from 'vitest';
import { correctControlWords, correctWord, withinOneEdit } from '../../../../supabase/functions/_shared/whatsappSpelling';
import {
  isDailyRecordCandidate,
  isDailyRecordConfirmation,
  isDailyRecordRejection,
  parseDailyRecord,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parseQuantityOnlySale } from '../../../../supabase/functions/_shared/whatsappQuantitySale';

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
