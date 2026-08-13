import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_RECORD_AMOUNT,
  buildDailyRecordConfirmation,
  buildDailyRecordConfirmed,
  isDailyRecordConfirmation,
  isDailyRecordRejection,
  parseDailyRecord,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';

describe('deterministic WhatsApp daily-record parser', () => {
  it('parses a Swahili sale with a total', () => {
    expect(parseDailyRecord('nimeuza madaftari 10 kwa 3000', 'sw')).toEqual({
      kind: 'parsed',
      record: {
        kind: 'sale',
        amount: 3000,
        partyName: null,
        description: 'madaftari 10',
        lines: [],
      },
    });
  });

  it('parses a Swahili unit-price sale and recomputes the total', () => {
    const parsed = parseDailyRecord('leo nimeuza kalamu 5 kila moja 500', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      expect(parsed.record.amount).toBe(2500);
      expect(parsed.record.lines).toEqual([{ description: 'kalamu', quantity: 5, unit_amount: 500 }]);
    }
  });

  it('calculates the exact live phrase as 70 times 9000', () => {
    const parsed = parseDailyRecord('Nimeuza nguvu ya sala 70 kila moja ni 9000', 'sw');
    expect(parsed).toMatchObject({ kind: 'parsed', record: { amount: 630000 } });
    if (parsed.kind === 'parsed') {
      expect(parsed.record.lines).toEqual([{ description: 'nguvu ya sala', quantity: 70, unit_amount: 9000 }]);
    }
  });

  it('sums multiple sale lines', () => {
    const parsed = parseDailyRecord('nimeuza madaftari 10 kila moja 3000 na kalamu 5 kila moja 500', 'sw');
    expect(parsed).toMatchObject({ kind: 'parsed', record: { amount: 32500 } });
    if (parsed.kind === 'parsed') expect(parsed.record.lines).toHaveLength(2);
  });

  it('parses an English sale and an expense', () => {
    expect(parseDailyRecord('sold 5 notebooks each 3000', 'en')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'sale', amount: 15000 },
    });
    expect(parseDailyRecord('expense ya umeme 12000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'expense', amount: 12000, description: 'umeme' },
    });
    expect(parseDailyRecord('spent on transport 8000', 'en')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'expense', amount: 8000 },
    });
  });

  it('sums multiple expenses and supports mixed money notation', () => {
    expect(parseDailyRecord('nimelipa transport 8000 na chakula 5000', 'sw')).toMatchObject({
      kind: 'parsed', record: { kind: 'expense', amount: 13000 },
    });
    expect(parseDailyRecord('nimeuza bidhaa kwa TSh 3k', 'sw')).toMatchObject({
      kind: 'parsed', record: { amount: 3000 },
    });
    expect(parseDailyRecord('nimeuza madaftari 10 kila moja Tshs 3,000/=', 'sw')).toMatchObject({
      kind: 'parsed', record: { amount: 30000 },
    });
    expect(parseDailyRecord('sold goods for 3,000', 'en')).toMatchObject({
      kind: 'parsed', record: { amount: 3000 },
    });
  });

  it('parses debts and customer payments with the named party', () => {
    expect(parseDailyRecord('Asha amechukua madaftari kwa mkopo 24000 atalipa Ijumaa', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'debt_issued', amount: 24000, partyName: 'Asha' },
    });
    expect(parseDailyRecord('Juma ananidai 15000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'debt_issued', amount: 15000, partyName: 'Juma' },
    });
    expect(parseDailyRecord('Asha amelipa 10000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'customer_payment', amount: 10000, partyName: 'Asha' },
    });
    expect(parseDailyRecord('Juma kalipa deni 5000', 'sw')).toMatchObject({
      kind: 'parsed',
      record: { kind: 'customer_payment', amount: 5000, partyName: 'Juma' },
    });
    expect(parseDailyRecord('Asha amechukua vitabu 2 kila moja 12000 kwa mkopo', 'sw')).toMatchObject({
      kind: 'parsed', record: { kind: 'debt_issued', amount: 24000 },
    });
    expect(parseDailyRecord('Asha amelipa 10000 kati ya 24000', 'sw')).toMatchObject({
      kind: 'parsed', record: { kind: 'customer_payment', amount: 10000, referenceAmount: 24000 },
    });
  });

  it('asks for clarification when the amount or message is unclear', () => {
    expect(parseDailyRecord('nimeuza bidhaa', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('expense ya umeme 12000 jana kwa mradi', 'sw')).toMatchObject({ kind: 'clarify', reason: 'message' });
    expect(parseDailyRecord('nimeuza bidhaa 10 3000', 'sw')).toEqual({
      kind: 'clarify', reason: 'ambiguity', question: 'Bei hii ni jumla au bei ya kila moja?',
    });
    expect(parseDailyRecord('nimeuza nguvu ya sala 70 kila moja', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('nimeuza bidhaa kwa 0', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('nimeuza bidhaa kwa -5000', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('nimeuza bidhaa kwa 100000001', 'sw')).toMatchObject({ kind: 'clarify', reason: 'limit' });
  });

  it('uses the requested language for confirmation copy', () => {
    const parsed = parseDailyRecord('nimeuza bidhaa kwa TSh 15000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      const reply = buildDailyRecordConfirmation(parsed.record, 'sw');
      expect(reply).toContain('TSh 15,000');
      expect(reply).toContain('NDIYO');
      expect(reply).not.toContain('Confirm');
    }
  });

  it('shows formula lines and total in the confirmation summary', () => {
    const parsed = parseDailyRecord('nimeuza nguvu ya sala 70 kila moja ni 9000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      const reply = buildDailyRecordConfirmation(parsed.record, 'sw');
      expect(reply).toContain('nguvu ya sala: 70 × TSh 9,000 = TSh 630,000');
      expect(reply).toContain('Jumla: *TSh 630,000*');
    }
  });

  it('adds a records link and bold total after confirmation', () => {
    const parsed = parseDailyRecord('nimeuza madaftari 10 kila moja 3000', 'sw');
    expect(parsed.kind).toBe('parsed');
    if (parsed.kind === 'parsed') {
      const reply = buildDailyRecordConfirmed(parsed.record, 'sw');
      expect(reply).toContain('*TSh 30,000*');
      expect(reply).toContain('https://risip.online/daily-records');
    }
  });

  it('does not exceed the declared safety limit', () => {
    expect(MAX_DAILY_RECORD_AMOUNT).toBe(100_000_000);
    expect(parseDailyRecord('nimeuza bidhaa kwa 100000000', 'sw')).toMatchObject({ kind: 'parsed' });
    expect(parseDailyRecord('nimeuza bidhaa kwa 100000001', 'sw')).toMatchObject({ kind: 'clarify', reason: 'limit' });
  });

  it('recognises explicit confirmation and rejection only', () => {
    expect(isDailyRecordConfirmation('NDIYO')).toBe(true);
    expect(isDailyRecordConfirmation('yes, confirm')).toBe(true);
    expect(isDailyRecordRejection('HAPANA')).toBe(true);
    expect(isDailyRecordRejection('cancel')).toBe(true);
    expect(isDailyRecordConfirmation('nimeuza 5000')).toBe(false);
  });
});
