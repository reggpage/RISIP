import { describe, expect, it } from 'vitest';
import { businessDay, groupByDay } from '../groupByDay';

const record = (
  id: string, kind: string, amount: number, occurred_at: string, status = 'confirmed',
) => ({ id, kind, amount, occurred_at, status });

describe('one card per day, per kind', () => {
  it('adds up a day the way a counter fills it', () => {
    // Morning, afternoon, closing. All of it is the same day's takings.
    const groups = groupByDay([
      record('a', 'sale', 100_000, '2026-08-16T06:10:00Z'),
      record('b', 'sale', 250_000, '2026-08-16T11:40:00Z'),
      record('c', 'sale', 685_650, '2026-08-16T15:56:00Z'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(1_035_650);
    expect(groups[0].records).toHaveLength(3);
  });

  it('keeps expenses apart from sales on the same day', () => {
    const groups = groupByDay([
      record('a', 'sale', 1_035_650, '2026-08-16T15:56:00Z'),
      record('b', 'expense', 15_000, '2026-08-16T15:56:00Z'),
      record('c', 'expense', 1_200, '2026-08-16T15:56:00Z'),
      record('d', 'expense', 9_500, '2026-08-16T15:56:00Z'),
    ]);
    expect(groups.map((group) => [group.kind, group.total]))
      .toEqual([['expense', 25_700], ['sale', 1_035_650]]);
  });

  it('starts a new card only when the date changes', () => {
    const groups = groupByDay([
      record('a', 'sale', 5_000, '2026-08-16T09:00:00Z'),
      record('b', 'sale', 7_000, '2026-08-15T09:00:00Z'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.day)).toEqual(['2026-08-16', '2026-08-15']);
  });

  it('files an evening sale on the day the shop had it, not UTC', () => {
    // 22:30 in Dar es Salaam is 19:30 UTC — the same day. But 00:30 local on
    // the 17th is 21:30 UTC on the 16th, and UTC would file it a day early.
    expect(businessDay('2026-08-16T21:30:00Z')).toBe('2026-08-17');
    expect(businessDay('2026-08-16T19:30:00Z')).toBe('2026-08-16');
  });

  it('puts the newest entry at the top inside a card', () => {
    const groups = groupByDay([
      record('early', 'sale', 1, '2026-08-16T06:00:00Z'),
      record('late', 'sale', 2, '2026-08-16T15:00:00Z'),
    ]);
    expect(groups[0].records.map((item) => item.id)).toEqual(['late', 'early']);
  });
});

describe('what the total must never include', () => {
  it('shows a voided record but does not count it', () => {
    const groups = groupByDay([
      record('a', 'sale', 100_000, '2026-08-16T06:00:00Z'),
      record('b', 'sale', 50_000, '2026-08-16T07:00:00Z', 'voided'),
    ]);
    expect(groups[0].records).toHaveLength(2);
    expect(groups[0].total).toBe(100_000);
    expect(groups[0].countedRecords).toBe(1);
  });

  it('flags a card holding something still unconfirmed', () => {
    const groups = groupByDay([
      record('a', 'sale', 100_000, '2026-08-16T06:00:00Z'),
      record('b', 'sale', 50_000, '2026-08-16T07:00:00Z', 'pending'),
    ]);
    expect(groups[0].hasUnconfirmed).toBe(true);
    // Still counted: it is money the shop believes it took, awaiting a yes.
    expect(groups[0].total).toBe(150_000);
  });

  it('does not call a voided-only card unconfirmed', () => {
    const groups = groupByDay([record('a', 'sale', 5, '2026-08-16T06:00:00Z', 'voided')]);
    expect(groups[0].hasUnconfirmed).toBe(false);
    expect(groups[0].total).toBe(0);
  });

  it('survives a record with an unreadable date', () => {
    const groups = groupByDay([record('a', 'sale', 5, 'not a date')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].day).toBe('');
  });
});
