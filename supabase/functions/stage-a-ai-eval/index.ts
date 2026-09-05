/**
 * STAGE A.1 — a temporary, isolated way to ask the deployed brain what it
 * understands, without going anywhere near a shop.
 *
 * The Anthropic key lives only in Edge Function secrets, so the corpus cannot be
 * run from a laptop. This function exists to close that gap and NOTHING else.
 *
 * WHAT IT DELIBERATELY CANNOT DO:
 *   - It creates no Supabase client. There is no database handle in this file,
 *     so no daily_record, no RPC and no WhatsApp conversation can be touched
 *     even by mistake.
 *   - It sends no WhatsApp message. There is no Meta call here.
 *   - It executes no tool. It asks the model what it WOULD call and stops. That
 *     is the whole measurement: what did the model understand from the
 *     sentence, before any data came back.
 *   - It reads no merchant message. Input is synthetic eval text, posted in.
 *
 * WHAT IT USES, UNCHANGED, so the number means something:
 *   the same model resolution, the same buildAssistantSystemPrompt, the same
 *   toolsForModel, the same tool_choice rule. Imported from the shared module
 *   rather than copied — a copied contract measures the copy. That mistake has
 *   already been made in this codebase four times with unit vocabulary.
 *
 * DELETE THIS FUNCTION WHEN THE BASELINE IS RECORDED. It is gated by JWT and by
 * a one-time secret, but an endpoint that can spend Anthropic credit should not
 * outlive its reason to exist.
 */

import {
  ASSISTANT_TOOLS,
  assistantClockLine,
  buildAssistantSystemPrompt,
  requiresCurrentBusinessDataTool,
  toolsForModel,
  type AssistantIdentityContext,
  type AssistantHistoryMessage,
  normalizeAssistantHistory,
} from '../_shared/whatsappAssistant.ts';
import { resolveAnthropicModel } from '../_shared/anthropicModel.ts';
import { validateToolRound } from '../_shared/whatsappToolBoundary.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_CASES_PER_BATCH = 40;

/** Constant-time compare, so the token cannot be discovered a byte at a time. */
function tokenMatches(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

type EvalCase = { id: string; say: string; lang?: 'sw' | 'en'; history?: AssistantHistoryMessage[]; pendingClarification?: string };

type EvalResult = {
  id: string;
  tools: string[];
  input: Record<string, unknown> | null;
  text: string | null;
  stopReason: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  schemaError?: string | null;
};

async function askModel(
  apiKey: string,
  model: string,
  context: AssistantIdentityContext,
  say: string,
  history: AssistantHistoryMessage[],
  // Stage C compares 'auto' against 'any'. Forced tool choice is a design to be
  // measured, not assumed: it can also turn a correct silence into a wrong call.
  force: boolean,
): Promise<Omit<EvalResult, 'id'>> {
  const startedAt = Date.now();
  const base = {
    tools: [] as string[],
    input: null as Record<string, unknown> | null,
    text: null as string | null,
    stopReason: null as string | null,
    inputTokens: null as number | null,
    outputTokens: null as number | null,
  };

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        // Identical to production's round zero.
        // FIVE MINUTES HERE ON PURPOSE, unlike the live WhatsApp path.
        //
        // The evaluator fires its cases seconds apart, and a read refreshes the
        // timer for free, so the five-minute entry stays warm for a whole run
        // and costs 1.25x to write instead of the hour's 2x. The live path
        // buys the hour because a trader pauses between messages; an eval run
        // never pauses, so paying for the hour here would be pure surcharge.
        system: [{ type: 'text', text: buildAssistantSystemPrompt(context), cache_control: { type: 'ephemeral' } }],
        tools: toolsForModel(model),
        tool_choice: {
          type: force || requiresCurrentBusinessDataTool(say) ? 'any' : 'auto',
          disable_parallel_tool_use: false,
        },
        messages: [...normalizeAssistantHistory(history), { role: 'user', content: `${assistantClockLine()}\n\n${say}` }],
      }),
    });
  } catch (error) {
    return { ...base, latencyMs: Date.now() - startedAt,
      error: error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'provider_timeout' : 'provider_network_error' };
  }

  const latencyMs = Date.now() - startedAt;
  if (!response.ok) {
    let code = `provider_${response.status}`;
    try {
      const payload = await response.json() as { error?: { type?: string; message?: string } };
      // The key can appear in an echoed request. Strip it before it can be
      // written anywhere, including this function's own logs.
      const detail = String(payload.error?.message ?? '')
        .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'redacted')
        .slice(0, 160);
      code = `${code}_${payload.error?.type ?? 'unknown'}_${detail}`.slice(0, 220);
    } catch { /* the status alone is still a usable code */ }
    return { ...base, latencyMs, error: code };
  }

  let payload: {
    content?: Array<{ id?: string; type: string; name?: string; input?: Record<string, unknown>; text?: string }>;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  try {
    payload = await response.json();
  } catch {
    return { ...base, latencyMs, error: 'provider_unparseable_response' };
  }

  const blocks = payload.content ?? [];
  const toolBlocks = blocks.filter((block) => block.type === 'tool_use');
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const schemaError = validateToolRound(toolBlocks.map((block) => ({
    id: block.id ?? '', name: block.name ?? '', input: block.input ?? {},
  })), toolsForModel(model));
  return {
    schemaError: schemaError ? `${schemaError.code}:${schemaError.path}` : null,
    tools: toolBlocks.map((block) => String(block.name ?? '')),
    // The FIRST tool call is the interpretation. Later ones in the same reply
    // are parallel calls, kept in `tools` so parallel use is visible.
    input: (toolBlocks[0]?.input ?? null) as Record<string, unknown> | null,
    text: textBlocks.map((block) => block.text ?? '').join(' ').trim() || null,
    stopReason: payload.stop_reason ?? null,
    inputTokens: payload.usage?.input_tokens ?? null,
    outputTokens: payload.usage?.output_tokens ?? null,
    latencyMs,
    error: null,
  };
}

Deno.serve(async (request) => {
  const expectedToken = Deno.env.get('STAGE_A_EVAL_TOKEN') ?? '';
  // Separate temporary release-evaluation credential; never replace another
  // operator's existing token. Both paths retain the gateway JWT requirement.
  const foundationToken = Deno.env.get('RISIP_FOUNDATION_EVAL_TOKEN') ?? '';
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!expectedToken && !foundationToken) {
    // Refuse to run un-gated rather than falling open.
    return new Response(JSON.stringify({ error: 'evaluator_disabled' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'content-type': 'application/json' },
    });
  }

  let body: { token?: string; context?: Partial<AssistantIdentityContext>; cases?: EvalCase[]; force_tool_choice?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  if (!tokenMatches(String(body.token ?? ''), expectedToken)
    && !tokenMatches(String(body.token ?? ''), foundationToken)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing_api_key' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
  }

  const forceToolChoice = body.force_tool_choice === true;
  if (!Array.isArray(body.cases) || body.cases.length > MAX_CASES_PER_BATCH
    || body.cases.some((item) => !item || typeof item.say !== 'string' || !item.say.trim() || item.say.length > 2000)) {
    return new Response(JSON.stringify({ error: 'invalid_cases' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  const cases = (body.cases ?? []).slice(0, MAX_CASES_PER_BATCH);
  if (cases.length === 0) {
    return new Response(JSON.stringify({ error: 'no_cases' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  // A synthetic shop. Nothing here belongs to a real company: the ids are
  // zeroes, and the vocabulary is the butcher wording the corpus is written in.
  const supplied = body.context ?? {};
  const context: AssistantIdentityContext = {
    identityId: '00000000-0000-0000-0000-000000000000',
    profileId: '00000000-0000-0000-0000-000000000000',
    companyId: '00000000-0000-0000-0000-000000000000',
    companyName: supplied.companyName ?? 'Bucha ya Mfano',
    userName: supplied.userName ?? 'Msimamizi',
    role: supplied.role ?? 'owner',
    lang: supplied.lang ?? 'sw',
    approvalFlowEnabled: supplied.approvalFlowEnabled ?? false,
    reversalEnabled: supplied.reversalEnabled ?? true,
    payoutsEnabled: supplied.payoutsEnabled ?? false,
    vocabulary: supplied.vocabulary,
    catalogueContext: supplied.catalogueContext,
  };

  const model = await resolveAnthropicModel(
    apiKey,
    Deno.env.get('ANTHROPIC_ASSISTANT_MODEL') || 'claude-haiku-4-5-20251001',
    true,
  );

  const results: EvalResult[] = [];
  for (const testCase of cases) {
    const say = testCase.say.trim();
    if (!say) continue;
    const history = normalizeAssistantHistory(Array.isArray(testCase.history) ? testCase.history : []);
    const outcome = await askModel(apiKey, model, { ...context, lang: testCase.lang ?? context.lang,
      pendingClarification: testCase.pendingClarification,
    }, say, history, forceToolChoice);
    results.push({ id: String(testCase.id), ...outcome });
  }

  return new Response(JSON.stringify({
    model,
    toolsShown: ASSISTANT_TOOLS.length,
    toolNamesShown: ASSISTANT_TOOLS.map((tool) => tool.name),
    results,
  }), { headers: { 'content-type': 'application/json' } });
});
