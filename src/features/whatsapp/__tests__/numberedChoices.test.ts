import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCancel } from '../../../../supabase/functions/_shared/whatsappIntent';
import {
  isDailyRecordConfirmation,
  isDailyRecordRejection,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';

// A DIGIT CANNOT BE MISSPELLED.
//
// The owner's rule: "kwenye commands words ziwe na number mtu achague… ili
// kuepusha kukosea kwa spellings."
//
// He is right about the cost, and this codebase is the evidence. Every control
// word has needed a spelling parser, and those parsers have been a steady
// source of bugs — "mdiyo" was not a yes, so a confirmed sale sat unsaved. And
// before this change the same question wore eight different phrasings across
// thirty-two sites, so what a shopkeeper saw depended on which branch they
// happened to reach.
//
// ORDER MATTERED. The numbers had to be ACCEPTED before they were SHOWN.
// Rendering "*1* Ndiyo" while isDailyRecordConfirmation still rejected "1"
// would have been a trap: tap the number, nothing happens, and there is no way
// to tell that from the service being broken.

const sharedDir = resolve(process.cwd(), 'supabase/functions/_shared');
const sources = readdirSync(sharedDir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, text: readFileSync(resolve(sharedDir, name), 'utf8') }));

describe('the numbers are accepted', () => {
  it('reads a bare 1 as yes and a bare 2 as no', () => {
    expect(isDailyRecordConfirmation('1')).toBe(true);
    expect(isDailyRecordRejection('2')).toBe(true);
  });

  it('still reads the words, for everyone who already types them', () => {
    expect(isDailyRecordConfirmation('ndiyo')).toBe(true);
    expect(isDailyRecordConfirmation('sawa')).toBe(true);
    expect(isDailyRecordRejection('hapana')).toBe(true);
    expect(isDailyRecordRejection('ghairi')).toBe(true);
  });

  it('does NOT make 3 a cancel', () => {
    // isCancel runs in the general intent router with no parked question above
    // it, so a bare "3" there would cancel whatever somebody was doing — and
    // "3" is one of the commonest quantities a shop types.
    expect(isCancel('3')).toBe(false);
    expect(isDailyRecordConfirmation('3')).toBe(false);
    expect(isDailyRecordRejection('3')).toBe(false);
  });

  it('does not turn a quantity into an answer', () => {
    // "1 daftari" is a line of a sale. Only a bare digit is a choice.
    expect(isDailyRecordConfirmation('1 daftari')).toBe(false);
    expect(isDailyRecordConfirmation('2500')).toBe(false);
    expect(isDailyRecordRejection('2 soda')).toBe(false);
  });
});

describe('the numbers are shown', () => {
  /**
   * Replies that offer a yes/no, with comments stripped first.
   *
   * Comment blocks in this codebase quote the old wording while explaining why
   * it went, so scanning raw source finds the very sentences the change
   * removed. Strip them and only real strings remain.
   */
  const withoutComments = sources.map(({ name, text }) => ({
    name,
    // Trailing comments too, not only whole-line ones: `| 'drafted'  // …`
    // leaves the naive quote scan pairing one string's closing quote with the
    // next string's opening one, and capturing the comment in between.
    // Requiring whitespace before the slashes keeps https:// intact.
    text: text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\s)\/\/[^\n]*/g, ' '),
  }));
  const offers = withoutComments.flatMap(({ name, text }) =>
    [...text.matchAll(/'([^']{10,})'|`([^`]{10,})`/g)]
      .map((hit) => ({ name, said: hit[1] ?? hit[2] }))
      .filter((row) => /\bNDIYO\b|\bHAPANA\b/.test(row.said)));

  it('leaves no reply offering the words without a number', () => {
    // whatsappAssistant.ts is excluded on purpose: its NDIYO references are
    // protocol notes addressed to the MODEL, describing what the server waits
    // for. They are not shown to anybody.
    const offenders = offers
      .filter((row) => row.name !== 'whatsappAssistant.ts')
      .map((row) => `${row.name}: ${row.said.slice(0, 64)}`);
    expect(offenders).toEqual([]);
  });

  it('uses one shape everywhere it offers both', () => {
    const canonical = sources
      .flatMap(({ text }) => [...text.matchAll(/\*1\* Ndiyo · \*2\* Hapana/g)])
      .length;
    expect(canonical).toBeGreaterThan(15);
  });

  it('keeps FUTA KABISA a typed phrase', () => {
    // Deleting an account is the one place a number must never do it. A
    // mistaken "1" that wipes a business is not a recoverable mistake.
    const deletion = sources.find((row) => row.name === 'whatsappAccountDeletion.ts')!.text;
    expect(deletion).toContain('FUTA KABISA');
    expect(deletion).not.toMatch(/\*1\* Ndiyo · \*2\* Hapana/);
  });
});
