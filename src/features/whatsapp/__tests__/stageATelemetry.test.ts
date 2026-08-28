import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROMPT_VERSION,
  TOOL_SCHEMA_VERSION,
  buildInterpretation,
  providerFailureCode,
  semanticIntentOf,
} from '../../../../supabase/functions/_shared/whatsappTelemetry';
import { ASSISTANT_TOOL_NAMES, ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';

// STAGE A — measure the brain before changing what it is allowed to do.
//
// Every fix this month started with one message failing, so one phrase was
// added. That is how a language engine becomes a list. This telemetry exists so
// the next change is to a CATEGORY: "six of nine failures are supplier
// language" is an actionable sentence; "shingapi failed" is not.
//
// It records what the assistant DID. Never what the trader wrote.

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = src('supabase/migrations/0140_ai_interpretation_telemetry.sql');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');
const telemetry = src('supabase/functions/_shared/whatsappTelemetry.ts');

describe('intent comes from the tool call, not from the model’s opinion', () => {
  it('reads a proposing tool through its kind', () => {
    expect(semanticIntentOf('propose_catalogue_transaction', { kind: 'sale' })).toBe('sale');
    expect(semanticIntentOf('propose_catalogue_transaction', { kind: 'debt_issued' })).toBe('credit_sale');
    expect(semanticIntentOf('propose_daily_record', { kind: 'expense' })).toBe('expense');
    expect(semanticIntentOf('propose_daily_record', { kind: 'supplier_payment' })).toBe('supplier_payment');
  });

  it('maps every read tool to a question', () => {
    expect(semanticIntentOf('get_stock_on_hand')).toBe('stock_query');
    expect(semanticIntentOf('get_business_summary')).toBe('business_summary');
    expect(semanticIntentOf('get_open_debts')).toBe('receivables_query');
    expect(semanticIntentOf('get_business_advice')).toBe('advice');
    expect(semanticIntentOf('get_product_price_comparison')).toBe('price_comparison');
    expect(semanticIntentOf('get_products_missing_selling_price')).toBe('missing_selling_price');
  });

  it('says unknown rather than guessing', () => {
    // A wrong label is worse than a missing one: it makes the baseline look
    // better than it is, which is the one thing Stage A cannot afford.
    expect(semanticIntentOf('some_future_tool')).toBe('unknown');
    expect(semanticIntentOf('propose_catalogue_transaction', { kind: 'nonsense' })).toBe('unknown');
    expect(semanticIntentOf(null)).toBe('no_tool');
    expect(semanticIntentOf('')).toBe('no_tool');
  });

  it('covers every tool the assistant actually ships', () => {
    const unmapped = (ASSISTANT_TOOL_NAMES as readonly string[])
      .filter((name) => !name.startsWith('propose_'))
      .filter((name) => semanticIntentOf(name) === 'unknown');
    expect(unmapped).toEqual([]);
  });
});

describe('what the telemetry may contain', () => {
  it('carries no message text, names, prices or prose', () => {
    const row = buildInterpretation({
      waMessageId: 'wamid.abc',
      toolNames: ['get_stock_on_hand'],
      lastToolInput: { product: 'Nyama ya ng’ombe', quantity: 3 },
      latencyMs: 900,
      backendOutcome: 'answered',
      fallbackReason: 'model_success',
    });
    const json = JSON.stringify(row);
    // The tool input went in; nothing from it may come out.
    expect(json).not.toContain('Nyama');
    expect(json).not.toContain('quantity');
    expect(Object.keys(row).sort()).toEqual([
      'backendOutcome', 'chosenTool', 'clarificationField', 'fallbackReason',
      'fallbackUsed', 'latencyMs', 'providerFailureCode', 'rejectionCode',
      'semanticIntent', 'toolRounds', 'waMessageId',
    ]);
  });

  it('has no column for message text, party or money', () => {
    for (const forbidden of [
      'message_text', 'body', 'party_name', 'product_name', 'product_wording',
      'phone', 'amount', 'price', 'total', 'balance', 'reply',
    ]) {
      expect(migration, forbidden).not.toMatch(new RegExp(`^\\s+${forbidden}\\s`, 'm'));
    }
  });

  it('caps every free-text column so a sentence cannot arrive later', () => {
    expect(migration).toContain('ai_interp_short_codes_check');
    expect(migration).toContain('length(chosen_tool), 0) <= 64');
    expect(migration).toContain('length(clarification_field), 0) <= 48');
  });

  it('bounds the outcome and the fallback reason', () => {
    for (const outcome of ['answered', 'drafted', 'clarified', 'rejected',
      'fallback', 'provider_failed', 'budget_blocked']) {
      expect(migration, outcome).toContain(`'${outcome}'`);
    }
    for (const reason of ['model_success', 'model_empty', 'provider_error',
      'provider_timeout', 'budget_block', 'invalid_tool_schema',
      'model_reply_deferred_for_safety']) {
      expect(migration, reason).toContain(`'${reason}'`);
    }
  });

  it('reduces a provider error to a code, not a quoted request', () => {
    const code = providerFailureCode(
      'provider_400_invalid_request_error_tools.12.custom_Invalid_schema_Enum_value_cash');
    expect(code).toContain('400');
    expect(code).toContain('invalid_request_error');
    expect(code).toContain('tools.12');
    expect(code!.length).toBeLessThanOrEqual(200);
    expect(providerFailureCode(null)).toBeNull();
  });
});

describe('privacy and retention', () => {
  it('is denied to every ordinary client', () => {
    expect(migration).toContain('alter table public.whatsapp_ai_interpretations enable row level security');
    // No policy at all. No policy means deny; service_role bypasses RLS.
    expect(migration).not.toMatch(/create policy .* on public\.whatsapp_ai_interpretations/);
  });

  it('goes when the company goes', () => {
    // The permanent-delete function ends with `delete from public.companies`,
    // so the cascade removes these rows without reopening that 34-table list.
    expect(migration).toContain('references public.companies(id) on delete cascade');
  });

  it('expires after 30 days, cleaned the way this repo already cleans', () => {
    expect(migration).toContain("now() + interval '30 days'");
    // Opportunistic deletion inside the write, exactly as wa_store_ai_exchange
    // prunes whatsapp_ai_messages. No cron extension is installed here.
    expect(migration).toContain('delete from public.whatsapp_ai_interpretations');
    expect(migration).toContain('expires_at < now()');
  });

  it('is service-role only', () => {
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });
});

describe('telemetry never costs a shop its answer', () => {
  it('swallows its own failure in SQL', () => {
    expect(migration).toContain('exception when others then');
  });

  it('swallows its own failure in the webhook', () => {
    expect(webhook).toContain('catch { /* telemetry is never allowed to break a message */ }');
  });

  it('is one insert, and counts a redelivery once', () => {
    expect(migration).toContain('on conflict (wa_message_id) do update set');
    expect(migration).toContain('ai_interp_message_idx');
  });

  it('records a version so a later regression can be attributed', () => {
    expect(PROMPT_VERSION).toBe('risip-agent-v2-tool-discipline');
    expect(TOOL_SCHEMA_VERSION).toBe('tools-stage-c');
    expect(webhook).toContain('p_prompt_version: PROMPT_VERSION');
    expect(webhook).toContain('p_tool_schema_version: TOOL_SCHEMA_VERSION');
  });
});

describe('the four outcomes are distinguishable', () => {
  it('separates an empty model from a provider failure from a budget block', () => {
    // MEASURED: an adviser answer refused for quoting a figure no tool returned
    // was landing in this row as 'model_empty' — a different fault with a
    // different fix, hidden behind the same word. The class decides it now.
    expect(webhook).toContain("? 'model_reply_deferred_for_safety'");
    expect(webhook).toContain(": 'model_empty');");
    expect(webhook).toContain("await recordInterpretation('provider_failed',");
    expect(webhook).toContain("p_backend_outcome: 'budget_blocked'");
    // "Fallback" on its own is the answer that hid a dead API for a day.
    expect(telemetry).toContain("'provider_timeout'");
    expect(telemetry).toContain("'invalid_tool_schema'");
  });

  it('separates a draft from an answer', () => {
    // A proposing tool leaves something pending; a read tool answered a
    // question. Measuring outcome separately from tool choice is the point.
    expect(webhook).toContain("assistant.toolNames.some((tool) => tool.startsWith('propose_')) ? 'drafted' : 'answered'");
  });
});

describe('Stage A changed no behaviour', () => {
  it('left the AI-first gate where the routing correction put it', () => {
    // Stage A froze this line because Stage A changed nothing. The routing
    // correction moved it deliberately: the parked-conversation blanket became
    // a narrow "does this answer the question we just asked?".
    // The eligibility test is one call now — messageGoesToModel, named once in
    // the router so every branch asks the same question and gets the same
    // answer. It used to be an inline chain here.
    expect(webhook).toContain('const aiEligible = messageGoesToModel(convo, body, systemCommand)');
    expect(webhook).toContain("&& !isDailyRecordConfirmation(body ?? '')");
  });

  it('kept the surface bounded when Stage B widened it', () => {
    // Stage A froze this at twenty because Stage A changed nothing. Stage B
    // widened the LANGUAGE contract deliberately: three tools added, and the
    // two they supersede hidden from the model but kept as executors.
    // Stage C added one more, and it is the one that can do nothing.
    // 29 since the closing pair. propose_day_close carries ONE field — the
    // trader's own closing word — and get_day_records carries one date word.
    // Neither reads a price, neither writes, and neither can close anything on
    // its own: the server gathers the day, shows it back, and waits for NDIYO.
    // The surface grew; the authority did not.
    expect(ASSISTANT_TOOL_NAMES.length).toBe(29);
    const shown = ASSISTANT_TOOLS.map((tool) => tool.name);
    expect(shown).toContain('propose_business_event');
    expect(shown).toContain('propose_money_event');
    expect(shown).toContain('get_supplier_payables');
    expect(shown).not.toContain('propose_catalogue_transaction');
    expect(shown).not.toContain('propose_daily_record');
  });

  it('added no financial authority to any tool', () => {
    // Stage B added amount_wording and amount_candidate, which are the trader's
    // words and the model's reading of them. Neither is authority: the server
    // normalizes the wording itself and a disagreement becomes a question.
    // Stage A is instrumentation. If a proposing tool grew a price field here,
    // that would be Stage B arriving by accident.
    const json = JSON.stringify(ASSISTANT_TOOLS);
    expect(json).not.toContain('"product_key"');
    expect(json).not.toContain('"company_id"');
    expect(json).not.toContain('"profile_id"');
  });
});
