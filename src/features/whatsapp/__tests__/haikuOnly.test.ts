import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The owner's instruction: Haiku 4.5 only.
//
// Two ways a costlier model could be reached before this, and both are closed:
//
//   1. extract-receipt and batch-extract-receipts pass `body.model` straight
//      through, so the model came from the REQUEST.
//   2. The fallback took [...available][0] — an ARBITRARY model from the
//      account — whenever no preference matched. On an account with Opus
//      enabled that is the most expensive answer possible, chosen silently.

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/anthropicModel.ts'), 'utf8');

describe('only a Haiku may be chosen', () => {
  it('pins 4.5 and lists nothing that is not a Haiku', () => {
    expect(source).toContain("const PINNED = 'claude-haiku-4-5-20251001';");
    const list = source.slice(source.indexOf('const HAIKU_MODELS'), source.indexOf('/** Only a Haiku'));
    expect(list).not.toMatch(/sonnet|opus|fable/i);
  });

  it('ignores a requested model that is not a Haiku, rather than obeying it', () => {
    expect(source).toContain('function isHaiku(');
    expect(source).toContain('.filter(isHaiku)');
  });

  it('never falls back to an arbitrary model from the account', () => {
    // The comment above the fix quotes the old line, so the check is on what
    // EXECUTES: no indexing into the catalogue, and the pinned id returned
    // instead.
    const code = source.split(String.fromCharCode(10))
      .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .join(String.fromCharCode(10));
    expect(code).not.toContain('[...available]');
    expect(code).toContain('return PINNED;');
  });
});

describe('every caller goes through it', () => {
  it('resolves the model in one place', () => {
    for (const path of [
      'supabase/functions/extract-receipt/index.ts',
      'supabase/functions/batch-extract-receipts/index.ts',
      'supabase/functions/_shared/whatsappAssistant.ts',
      'supabase/functions/_shared/whatsappDailyRecordsAi.ts',
      'supabase/functions/_shared/whatsappReadIntentAi.ts',
    ]) {
      const caller = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(caller, path).toContain('resolveAnthropicModel(');
      // No caller may name a model of its own outside the resolver.
      expect(caller, path).not.toMatch(/['"]claude-(?:sonnet|opus|fable)[^'"]*['"]/);
    }
  });
});
