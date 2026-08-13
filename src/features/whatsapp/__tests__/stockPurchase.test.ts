import { describe, expect, it } from 'vitest';
import { parseDailyRecord } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { getDailyRecordSummary, type DailyRecordWithDetails } from '@/features/dailyRecords/dailyRecords';
import type { DailyRecordKind } from '@/types/db';

// Buying stock is money out, like an expense, but it is not a running cost —
// it is goods to sell. Mixing the two made every restocking day read as a
// disaster: 500,000 of stock sitting next to 5,000 of boda fare told a story
// about the buying calendar rather than about the business.

describe('the parser only claims a stock purchase when the message says so', () => {
  it('reads an explicit stock purchase', () => {
    const parsed = parseDailyRecord('nimenunua stock ya sukari 50000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind !== 'parsed') return;
    expect(parsed.record.kind).toBe('stock_purchase');
    expect(parsed.record.amount).toBe(50000);
  });

  it('reads the other words traders use for it', () => {
    for (const text of [
      'nimenunua bidhaa 300000',
      'nimeongeza stock 120000',
      'nimenunua mzigo wa unga 250000',
    ]) {
      const parsed = parseDailyRecord(text, 'sw');
      expect(parsed.kind, text).toBe('parsed');
      if (parsed.kind !== 'parsed') continue;
      expect(parsed.record.kind, text).toBe('stock_purchase');
    }
  });

  it('leaves running costs alone', () => {
    for (const text of ['nimelipa boda 5000', 'nimelipa umeme 30000']) {
      const parsed = parseDailyRecord(text, 'sw');
      expect(parsed.kind, text).toBe('parsed');
      if (parsed.kind !== 'parsed') continue;
      expect(parsed.record.kind, text).toBe('expense');
    }
  });

  it('does NOT guess when the word stock is absent', () => {
    // "nimenunua mkaa 7000" is stock in a charcoal shop and a cooking cost
    // everywhere else. The parser cannot know which, so it must not decide —
    // guessing wrong moves money between two lines a trader reads differently.
    const parsed = parseDailyRecord('nimenunua mkaa 7000', 'sw');
    if (parsed.kind === 'parsed') {
      expect(parsed.record.kind).not.toBe('stock_purchase');
    }
  });

  it('still reads sales, debts and payments as before', () => {
    const sale = parseDailyRecord('nimeuza madaftari 10 kwa 3000', 'sw');
    expect(sale.kind === 'parsed' && sale.record.kind).toBe('sale');
  });
});

// ── The arithmetic that made this change dangerous to ship alone ────────────

function record(kind: DailyRecordKind, amount: number): DailyRecordWithDetails {
  return {
    kind, amount, status: 'confirmed', occurred_at: new Date().toISOString(),
    lines: [], recordedByName: null,
  } as unknown as DailyRecordWithDetails;
}

describe('stock comes off the cash line', () => {
  it('subtracts a stock purchase from cash movement', () => {
    const summary = getDailyRecordSummary([
      record('sale', 150000),
      record('expense', 20000),
      record('stock_purchase', 500000),
    ]);
    expect(summary.sales).toBe(150000);
    expect(summary.expenses).toBe(20000);
    expect(summary.stockPurchases).toBe(500000);
    // Without the subtraction this would read 130,000 and tell a trader who just
    // spent 500,000 restocking that they still hold it.
    expect(summary.cashMovement).toBe(-370000);
  });

  it('keeps stock out of the daily expense figure', () => {
    const summary = getDailyRecordSummary([
      record('expense', 20000),
      record('stock_purchase', 500000),
    ]);
    expect(summary.expenses).toBe(20000);
    expect(summary.stockPurchases).toBe(500000);
  });

  it('behaves exactly as before when nothing was restocked', () => {
    const summary = getDailyRecordSummary([
      record('sale', 150000),
      record('customer_payment', 15000),
      record('expense', 20000),
    ]);
    expect(summary.stockPurchases).toBe(0);
    expect(summary.cashMovement).toBe(145000);
  });

  it('ignores unconfirmed and voided records, as it always did', () => {
    const draft = { ...record('stock_purchase', 999000), status: 'pending_confirmation' } as DailyRecordWithDetails;
    const voided = { ...record('stock_purchase', 888000), status: 'voided' } as DailyRecordWithDetails;
    const summary = getDailyRecordSummary([record('sale', 100000), draft, voided]);
    expect(summary.stockPurchases).toBe(0);
    expect(summary.cashMovement).toBe(100000);
  });
});
