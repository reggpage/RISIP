import { describe, expect, it } from 'vitest';
import {
  DAILY_RECORD_CHART_COLORS,
  DAILY_RECORD_RANGES,
  isSameLocalDay,
  moveDailyRecordsDate,
  startOfLocalDay,
} from '@/features/dailyRecords/uiRules';

describe('Daily Records UI rules', () => {
  it('supports the four chart ranges used by the underline switch', () => {
    expect(DAILY_RECORD_RANGES).toEqual(['day', 'week', 'month', 'year']);
  });

  it('moves backward one day and blocks future dates', () => {
    const now = new Date(2026, 0, 12, 15, 30);
    const selected = new Date(2026, 0, 12, 9, 0);

    expect(moveDailyRecordsDate(selected, -1, now)).toEqual(new Date(2026, 0, 11));
    expect(moveDailyRecordsDate(selected, 1, now)).toBeNull();
  });

  it('normalizes date comparisons to the local calendar day', () => {
    const selected = new Date(2026, 0, 12, 0, 0);
    expect(isSameLocalDay(new Date(2026, 0, 12, 23, 59), selected)).toBe(true);
    expect(isSameLocalDay(new Date(2026, 0, 13, 0, 0), selected)).toBe(false);
    expect(startOfLocalDay(selected).getHours()).toBe(0);
  });

  it('keeps chart series visually distinct', () => {
    const colors = Object.values(DAILY_RECORD_CHART_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
    expect(DAILY_RECORD_CHART_COLORS.expense).toBe('#f97316');
    expect(DAILY_RECORD_CHART_COLORS.debt).toBe('#7c3aed');
    expect(DAILY_RECORD_CHART_COLORS.customerPayment).not.toBe(DAILY_RECORD_CHART_COLORS.cashMovement);
  });
});
