import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_INTERPRETATION_CHARS } from '../../../../supabase/functions/_shared/whatsappDailyRecordsAi';

describe('A2 AI fallback budget boundary', () => {
  it('caps the model input at the bounded interpretation size', () => {
    expect(MAX_INTERPRETATION_CHARS).toBe(1200);
  });

  it('keeps the fallback opt-in to the uncertain path', () => {
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    expect(webhook).toContain('const budget = await consumeAiBudget(db, identity, body.length);');
    expect(webhook).toContain('if (!budget.allowed)');
    expect(webhook).toContain('const aiRecord = await interpretDailyRecordWithAi(body, lang);');
  });
});
