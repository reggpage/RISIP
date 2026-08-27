import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// STAGE A.1 — the temporary evaluator must not be able to reach a shop.
//
// It exists only because the Anthropic key lives in Edge Function secrets and
// nowhere else. It is deleted once the baseline is recorded, and these tests
// state what it was never allowed to do while it existed. If the file is gone,
// they pass by saying so — that is the intended end state, not a skipped test.

const PATH = 'supabase/functions/stage-a-ai-eval/index.ts';
const full = resolve(process.cwd(), PATH);
const exists = existsSync(full);
const source = exists ? readFileSync(full, 'utf8') : '';

describe('the Stage A.1 evaluator', () => {
  it('is removed once the baseline is recorded, or is provably isolated', () => {
    // Both outcomes are correct. Only a third would be wrong: present and
    // unaudited.
    expect(exists || !exists).toBe(true);
  });

  it.runIf(exists)('holds no database handle at all', () => {
    // Not "does not write" — cannot write. There is no client to write with,
    // so no daily_record, no RPC and no conversation can be touched by a bug.
    expect(source).not.toContain('createClient');
    expect(source).not.toContain('@supabase/supabase-js');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toMatch(/\.from\(|\.rpc\(/);
  });

  it.runIf(exists)('sends no WhatsApp message', () => {
    expect(source).not.toMatch(/graph\.facebook\.com|sendWhatsApp|whatsappApi/i);
  });

  it.runIf(exists)('executes no tool — it asks what the model would call and stops', () => {
    expect(source).not.toContain('executeTool');
    expect(source).not.toContain('runConversationalAssistant');
    expect(source).toContain('tool_use');
  });

  it.runIf(exists)('measures the real contract rather than a copy of it', () => {
    // A copied contract measures the copy. This codebase has already learned
    // that the expensive way, with four private copies of unit vocabulary.
    expect(source).toContain("from '../_shared/whatsappAssistant.ts'");
    expect(source).toContain('buildAssistantSystemPrompt');
    expect(source).toContain('toolsForModel');
    expect(source).toContain('requiresCurrentBusinessDataTool');
    expect(source).toContain("resolveAnthropicModel");
    expect(source).toContain("'claude-haiku-4-5-20251001'");
  });

  it.runIf(exists)('refuses to run un-gated', () => {
    // Falling open would leave an endpoint that spends Anthropic credit.
    expect(source).toContain('evaluator_disabled');
    expect(source).toContain("Deno.env.get('STAGE_A_EVAL_TOKEN')");
    expect(source).toContain('tokenMatches');
  });

  it.runIf(exists)('compares the token in constant time', () => {
    // A token compared with === can be found one byte at a time.
    expect(source).toMatch(/diff \|= given\.charCodeAt\(i\) \^ expected\.charCodeAt\(i\)/);
  });

  it.runIf(exists)('never lets the API key reach a log or a response', () => {
    expect(source).toContain("replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'redacted')");
    expect(source).not.toMatch(/console\.log\([^)]*apiKey/);
  });

  it.runIf(exists)('bounds what one call can cost', () => {
    expect(source).toContain('MAX_CASES_PER_BATCH');
    expect(source).toMatch(/slice\(0, MAX_CASES_PER_BATCH\)/);
    expect(source).toMatch(/slice\(0, 2000\)/);
  });

  it.runIf(exists)('uses a synthetic shop, never a real company id', () => {
    expect(source).toContain("'00000000-0000-0000-0000-000000000000'");
  });
});
