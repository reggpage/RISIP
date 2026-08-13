import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_INTERPRETATION_CHARS } from '../../../../supabase/functions/_shared/whatsappDailyRecordsAi';
import {
  aiBudgetMessage,
  nextUtcBudgetReset,
  normalizeAiBudgetDecision,
} from '../../../../supabase/functions/_shared/whatsappAiBudget';

describe('A2 AI fallback budget boundary', () => {
  it('caps the model input at the bounded interpretation size', () => {
    expect(MAX_INTERPRETATION_CHARS).toBe(1200);
  });

  it('keeps the fallback opt-in to the uncertain path', () => {
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('const budget = await consumeAiBudget(db, identity, body.length);');
    expect(webhook).toContain('if (!budget.allowed)');
    expect(webhook).toContain('const aiRecord = await interpretDailyRecordWithAi(body, lang);');
    expect(webhook).toContain('&& !isDailyRecordCandidate(body);');
  });

  it('normalizes the server reset timestamp and has an exact UTC-day fallback', () => {
    expect(nextUtcBudgetReset(new Date('2026-08-13T21:45:00.000Z'))).toBe('2026-08-14T00:00:00.000Z');
    expect(normalizeAiBudgetDecision({
      allowed: false,
      reason: 'daily_request_limit',
      reset_at: '2026-08-14T00:00:00.000Z',
    }, null)).toEqual({
      allowed: false,
      reason: 'daily_request_limit',
      resetAt: '2026-08-14T00:00:00.000Z',
    });
  });

  it('states the exact EAT reset time and never says to try tomorrow', () => {
    const sw = aiBudgetMessage('sw', '2026-08-14T00:00:00.000Z', 'daily_request_limit');
    const en = aiBudgetMessage('en', '2026-08-14T00:00:00.000Z', 'daily_request_limit');
    expect(sw).toContain('03:00 EAT');
    expect(sw).not.toContain('kesho');
    expect(en).toContain('03:00 EAT');
    expect(en).not.toContain(' saa ');
    expect(en.toLowerCase()).not.toContain('tomorrow');
  });

  it('keeps provider failures distinct from an exhausted user quota', () => {
    const message = aiBudgetMessage('sw', '2026-08-14T00:00:00.000Z', 'budget_unavailable');
    expect(message).toContain('haupatikani kwa muda mfupi');
    expect(message).not.toContain('kikomo');
  });

  it('keeps the enlarged test allowance bounded in the follow-up migration', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0083_whatsapp_ai_personalization_and_test_budget.sql'), 'utf8');
    expect(migration).toContain('fallback_count < 30');
    expect(migration).toContain('input_chars + v_chars <= 36000');
    expect(migration).toContain('estimated_cost + v_cost <= 0.150000');
    expect(migration).toContain("'reset_at', v_reset_at");
  });
});
