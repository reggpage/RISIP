import { describe, expect, it } from 'vitest';
import { validateAiCandidate } from '../../../../supabase/functions/_shared/whatsappDailyRecordsAi';

describe('validated daily-record AI fallback', () => {
  it('recomputes a line total and accepts only matching structured JSON', () => {
    expect(validateAiCandidate({
      kind: 'sale',
      description: null,
      party_name: null,
      amount: 630000,
      lines: [{ description: 'nguvu ya sala', quantity: 70, unit_amount: 9000 }],
    })).toMatchObject({ kind: 'sale', amount: 630000, lines: [{ quantity: 70, unit_amount: 9000 }] });
  });

  it('rejects an AI total that does not match its line arithmetic', () => {
    expect(validateAiCandidate({
      kind: 'sale', amount: 9000,
      lines: [{ description: 'nguvu ya sala', quantity: 70, unit_amount: 9000 }],
    })).toBeNull();
  });

  it('rejects invalid kinds, zero values, and negative quantities', () => {
    expect(validateAiCandidate({ kind: 'unknown', amount: 1000, lines: [] })).toBeNull();
    expect(validateAiCandidate({ kind: 'expense', amount: 0, lines: [] })).toBeNull();
    expect(validateAiCandidate({ kind: 'expense', amount: 1000, lines: [{ description: 'food', quantity: -1, unit_amount: 1000 }] })).toBeNull();
  });
});
