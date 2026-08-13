import { describe, expect, it } from 'vitest';
import {
  buildDailyRecordConfirmation,
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
  });

  it('asks for clarification when the amount or message is unclear', () => {
    expect(parseDailyRecord('nimeuza bidhaa', 'sw')).toMatchObject({ kind: 'clarify', reason: 'amount' });
    expect(parseDailyRecord('expense ya umeme 12000 jana kwa mradi', 'sw')).toMatchObject({ kind: 'clarify', reason: 'message' });
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

  it('recognises explicit confirmation and rejection only', () => {
    expect(isDailyRecordConfirmation('NDIYO')).toBe(true);
    expect(isDailyRecordConfirmation('yes, confirm')).toBe(true);
    expect(isDailyRecordRejection('HAPANA')).toBe(true);
    expect(isDailyRecordRejection('cancel')).toBe(true);
    expect(isDailyRecordConfirmation('nimeuza 5000')).toBe(false);
  });
});
