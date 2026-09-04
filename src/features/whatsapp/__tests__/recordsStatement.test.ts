import { describe, expect, it } from 'vitest';
import { DETAIL_CHARS, buildStatement, statementDay, type StatementRecord } from '../../../../supabase/functions/_shared/recordsStatement';

// A STATEMENT IS A CLAIM ABOUT MONEY.
//
// The shopkeeper prints this, files it, and shows it to somebody. If a total on
// it counts a draft that never happened, or a record lands on the wrong day
// because the clock was read in London, the paper contradicts the dashboard and
// the shop stops trusting both. The layout can be ugly; these numbers cannot be
// wrong.

const rec = (over: Partial<StatementRecord> = {}): StatementRecord => ({
  kind: 'sale',
  status: 'confirmed',
  amount: 1000,
  party_name: null,
  description: null,
  occurred_at: '2026-09-01T09:00:00+03:00',
  ...over,
});

describe('what the totals are allowed to count', () => {
  it('adds up the confirmed rows of one kind', () => {
    const st = buildStatement([
      rec({ amount: 1000 }), rec({ amount: 2500 }), rec({ amount: 500 }),
    ], 'sw');
    expect(st.totals).toEqual([{ kind: 'sale', count: 3, amount: 4000 }]);
    expect(st.excluded).toBe(0);
  });

  it('leaves a pending draft out of the total but still shows the row', () => {
    const st = buildStatement([
      rec({ amount: 1000 }),
      rec({ amount: 9_000_000, status: 'pending' }),
    ], 'sw');
    expect(st.totals).toEqual([{ kind: 'sale', count: 1, amount: 1000 }]);
    expect(st.rows).toHaveLength(2);
    expect(st.rows[1].counted).toBe(false);
    expect(st.rows[1].note).toBe('inasubiri');
    expect(st.excluded).toBe(1);
  });

  it('leaves a voided record out of the total', () => {
    const st = buildStatement([
      rec({ amount: 1000 }),
      rec({ amount: 4000, status: 'voided' }),
    ], 'sw');
    expect(st.totals).toEqual([{ kind: 'sale', count: 1, amount: 1000 }]);
    expect(st.rows[1].note).toBe('imeghairiwa');
    expect(st.excluded).toBe(1);
  });

  it('keeps each kind on its own line rather than pooling them', () => {
    const st = buildStatement([
      rec({ kind: 'sale', amount: 5000 }),
      rec({ kind: 'expense', amount: 2000 }),
      rec({ kind: 'sale', amount: 1000 }),
    ], 'sw');
    expect(st.totals).toEqual([
      { kind: 'sale', count: 2, amount: 6000 },
      { kind: 'expense', count: 1, amount: 2000 },
    ]);
  });

  it('puts the biggest kind first, because that is where the eye stops', () => {
    const st = buildStatement([
      rec({ kind: 'expense', amount: 100 }),
      rec({ kind: 'sale', amount: 90_000 }),
      rec({ kind: 'stock_purchase', amount: 5000 }),
    ], 'sw');
    expect(st.totals.map((t) => t.kind)).toEqual(['sale', 'stock_purchase', 'expense']);
  });

  it('treats a broken amount as zero instead of poisoning the total with NaN', () => {
    const st = buildStatement([
      rec({ amount: 1000 }),
      rec({ amount: Number.NaN }),
    ], 'sw');
    expect(st.totals[0].amount).toBe(1000);
    expect(Number.isNaN(st.totals[0].amount)).toBe(false);
  });

  it('says nothing at all when there are no records', () => {
    const st = buildStatement([], 'sw');
    expect(st.rows).toEqual([]);
    expect(st.totals).toEqual([]);
    expect(st.excluded).toBe(0);
  });
});

describe('which day a record belongs to', () => {
  it('keeps a late-evening sale on the day the shop traded it', () => {
    // 21:30 in Dar es Salaam on the 1st is 18:30 UTC the same day.
    expect(statementDay('2026-09-01T21:30:00+03:00')).toBe('2026-09-01');
  });

  it('does not push a midnight sale back into the day before', () => {
    // The trap: 00:30 EAT on the 2nd is 21:30 UTC on the 1st. Read in UTC this
    // row files itself under yesterday and every daily figure shifts.
    expect(statementDay('2026-09-01T21:30:00Z')).toBe('2026-09-02');
  });

  it('reads a plain UTC stamp in Dar es Salaam time, not in London', () => {
    expect(statementDay('2026-09-01T22:00:00Z')).toBe('2026-09-02');
  });

  it('returns an empty day rather than the word Invalid on a bad stamp', () => {
    expect(statementDay('not a date')).toBe('');
  });
});

describe('how a row that is not counted is marked', () => {
  it('carries its status inside the detail, not on top of it', () => {
    // Drawn as a separate piece of text the note landed on the same baseline
    // as the detail and printed over the words. It belongs in the string.
    const st = buildStatement([rec({ status: 'pending', description: 'shuka 2' })], 'sw');
    expect(st.rows[0].detail).toBe('(inasubiri) shuka 2');
  });

  it('marks a voided row the same way', () => {
    const st = buildStatement([rec({ status: 'voided', description: 'shuka 2' })], 'sw');
    expect(st.rows[0].detail).toBe('(imeghairiwa) shuka 2');
  });

  it('says nothing extra on a confirmed row', () => {
    expect(buildStatement([rec({ description: 'shuka 2' })], 'sw').rows[0].detail).toBe('shuka 2');
  });

  it('still fits the column once the status is prefixed', () => {
    const st = buildStatement([rec({ status: 'pending', description: 'x'.repeat(200) })], 'sw');
    expect(st.rows[0].detail.length).toBeLessThanOrEqual(DETAIL_CHARS);
    expect(st.rows[0].detail.startsWith('(inasubiri)')).toBe(true);
  });
});

describe('what each row says', () => {
  it('joins the party and the note into one readable detail', () => {
    const st = buildStatement([rec({ party_name: 'Mama Asha', description: 'vikoi 3' })], 'sw');
    expect(st.rows[0].detail).toBe('Mama Asha - vikoi 3');
  });

  it('does not leave a dangling separator when only one half is there', () => {
    expect(buildStatement([rec({ party_name: 'Mama Asha' })], 'sw').rows[0].detail).toBe('Mama Asha');
    expect(buildStatement([rec({ description: 'vikoi 3' })], 'sw').rows[0].detail).toBe('vikoi 3');
    expect(buildStatement([rec()], 'sw').rows[0].detail).toBe('');
  });

  it('drops a name that is only invisible characters instead of joining it', () => {
    // A pasted name can be nothing but a zero-width space. trim() does not
    // remove it, so a raw join would print " - vikoi 3" with a separator
    // hanging off the front and nothing before it. The text has to be cleaned
    // BEFORE the empty halves are dropped, not after.
    const st = buildStatement([rec({ party_name: '​', description: 'vikoi 3' })], 'sw');
    expect(st.rows[0].detail).toBe('vikoi 3');
  });

  it('cleans a curly quote out of a shop name before it can throw', () => {
    const st = buildStatement([rec({ party_name: 'Ng’ombe Stores' })], 'sw');
    expect(st.rows[0].detail).toBe("Ng'ombe Stores");
  });

  it('clips a long detail so it cannot run under the amount column', () => {
    const st = buildStatement([rec({ description: 'x'.repeat(200) })], 'sw');
    expect(st.rows[0].detail.length).toBeLessThanOrEqual(DETAIL_CHARS);
  });

  it('names the kind in the language asked for', () => {
    expect(buildStatement([rec({ kind: 'stock_purchase' })], 'sw').rows[0].kind).toBe('Ununuzi wa bidhaa');
    expect(buildStatement([rec({ kind: 'stock_purchase' })], 'en').rows[0].kind).toBe('Stock purchase');
    expect(buildStatement([rec({ status: 'pending' })], 'en').rows[0].note).toBe('pending');
  });

  it('prints an unknown kind rather than an empty column', () => {
    const st = buildStatement([rec({ kind: 'something_new' })], 'sw');
    expect(st.rows[0].kind).toBe('something_new');
    expect(st.totals[0].kind).toBe('something_new');
  });
});
