/**
 * STAGE A — measure the brain before changing what it is allowed to do.
 *
 *   npx vite-node scripts/stage-a-baseline.ts              parser chain only
 *   npx vite-node scripts/stage-a-baseline.ts --ai         also ask Claude
 *   npx vite-node scripts/stage-a-baseline.ts --ai --limit 40
 *   npx vite-node scripts/stage-a-baseline.ts --ai --json  machine-readable
 *
 * WHY THIS EXISTS
 *
 * Every fix this month started with one message failing. "Shingapi" failed, so
 * "shingapi" was added. "Mambo yakoje" failed, so that was added too. That is
 * how a language engine becomes a list, and the list never ends.
 *
 * This runner asks a different question. Not "did this sentence work" but
 * "which CATEGORY of understanding is weak" — so the next change is to a
 * capability, a tool contract or a prompt, and it fixes twenty messages at
 * once instead of one.
 *
 * It changes nothing about production. It calls the same deterministic routing
 * table the existing eval runner uses, and — with --ai — the same tool
 * definitions the assistant ships, against the same pinned Haiku model. It
 * never writes to the database and never sends a WhatsApp message.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not turn a failure into a parser rule. A red row here is evidence,
 * not a to-do item for a regex.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { route, recordKind, controlIntent } from './lib/route.ts';
import { ASSISTANT_TOOLS, ASSISTANT_TOOL_NAMES } from '../supabase/functions/_shared/whatsappAssistant.ts';
import { semanticIntentOf, PROMPT_VERSION, TOOL_SCHEMA_VERSION } from '../supabase/functions/_shared/whatsappTelemetry.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

type Case = {
  file: string;
  id: string;
  say: string;
  expectTool?: string;
  expectKind?: string;
  expectIntent?: string;
  expectClarification?: string;
  backendShould?: string;
};

const args = new Set(process.argv.slice(2));
const wantsAi = args.has('--ai');
const wantsJson = args.has('--json');
const limitArg = process.argv.find((value, index) => process.argv[index - 1] === '--limit');
const limit = limitArg ? Number(limitArg) : Infinity;

/** Reads the YAML by hand, exactly as run-evals.ts does — no new dependency. */
function loadCases(): Case[] {
  const dir = resolve(process.cwd(), 'evals');
  const cases: Case[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.yaml'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for (const block of source.split(/\n\s+- id:\s*/).slice(1)) {
      const id = block.match(/^([^\s#]+)/)?.[1];
      const say = block.match(/^\s+say:\s*"((?:[^"\\]|\\.)*)"/m)?.[1]
        ?? block.match(/^\s+say:\s*'([^']*)'/m)?.[1];
      if (!id || !say) continue;
      cases.push({
        file,
        id,
        say: say.replace(/\\"/g, '"').replace(/\\n/g, '\n'),
        expectTool: block.match(/^\s+expect_tool:\s*(null|[^\s#]+)/m)?.[1],
        expectKind: block.match(/^\s+expect_kind:\s*([^\s#]+)/m)?.[1],
        expectIntent: block.match(/^\s+expect_intent:\s*([^\s#]+)/m)?.[1],
        expectClarification: block.match(/^\s+expect_clarification:\s*([^\s#]+)/m)?.[1],
        backendShould: block.match(/^\s+backend_should:\s*([^\s#]+)/m)?.[1],
      });
    }
  }
  return cases;
}

/**
 * What the deterministic chain makes of the message.
 *
 * The comparison baseline: whatever the parsers do today is what a trader
 * currently gets when the model is unavailable.
 */
function parserInterpretation(say: string): { route: string; intent: string } {
  const control = controlIntent(say);
  if (control) return { route: control, intent: control };
  const routed = route(say);
  const kind = recordKind(say);
  return {
    route: routed,
    intent: kind
      ? ({ sale: 'sale', debt_issued: 'credit_sale', expense: 'expense',
           stock_purchase: 'stock_purchase', customer_payment: 'customer_payment',
           stock_loss: 'stock_loss', owner_use: 'owner_use',
           supplier_payable: 'supplier_credit_purchase',
           supplier_payment: 'supplier_payment' } as Record<string, string>)[kind] ?? 'unknown'
      : routed === 'none' ? 'unknown' : routed,
  };
}

type AiReading = {
  tool: string | null;
  intent: string;
  latencyMs: number;
  raw: Record<string, unknown> | null;
  error: string | null;
};

/**
 * One interpretation call, with the SHIPPED tool definitions.
 *
 * Deliberately not the shipped system prompt: this measures tool choice and
 * entity extraction, and a prompt that also carries voice, greetings and
 * advisor formatting would make a failure impossible to attribute.
 */
async function askModel(apiKey: string, say: string): Promise<AiReading> {
  const started = Date.now();
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0,
        system: 'You are Risip, a bookkeeping assistant for Tanzanian shopkeepers on WhatsApp. '
          + 'Read the message and call exactly one tool. You never calculate money, never invent a '
          + 'product, and never confirm anything. Copy the trader’s own wording for products, '
          + 'quantities, units, parties, credit, payment, dates and price bands. If a fact you need '
          + 'is missing, call the tool anyway with that field null and list it in missing_fields.',
        tools: ASSISTANT_TOOLS,
        messages: [{ role: 'user', content: say }],
      }),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const body = await response.text();
      return { tool: null, intent: 'unknown', latencyMs, raw: null, error: `${response.status} ${body.slice(0, 160)}` };
    }
    const payload = await response.json() as { content?: Array<Record<string, unknown>> };
    const call = (payload.content ?? []).find((part) => part.type === 'tool_use');
    const tool = call ? String(call.name) : null;
    const input = call ? (call.input as Record<string, unknown>) : null;
    return { tool, intent: semanticIntentOf(tool, input), latencyMs, raw: input, error: null };
  } catch (err) {
    return {
      tool: null, intent: 'unknown', latencyMs: Date.now() - started, raw: null,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

/**
 * Hallucination counters, per §14 of the brief.
 *
 * These are the failures that matter more than accuracy: an invented product
 * or a model-supplied price is a wrong LEDGER, not a wrong answer.
 */
function safetyFlags(reading: AiReading): string[] {
  const flags: string[] = [];
  if (!reading.raw) return flags;
  const json = JSON.stringify(reading.raw).toLowerCase();
  // A price, total or cost anywhere in a proposing tool's arguments.
  if (reading.tool?.startsWith('propose_')
    && /"(price|total|unit_price|amount_total|cost|retail|wholesale)"\s*:/.test(json)
    && reading.tool !== 'propose_daily_record'
    && reading.tool !== 'propose_product_cost') {
    flags.push('financial_field');
  }
  // A canonical key is the server's to decide, never the model's.
  if (/"product_key"|"company_id"|"profile_id"|"daily_record_id"/.test(json)) {
    flags.push('authority_field');
  }
  // Claiming something is already recorded.
  if (/"(confirmed|status)"\s*:\s*"?(true|confirmed)"?/.test(json)) {
    flags.push('confirmation_claim');
  }
  if (reading.tool && !(ASSISTANT_TOOL_NAMES as readonly string[]).includes(reading.tool)) {
    flags.push('unknown_tool');
  }
  return flags;
}

const percent = (part: number, whole: number) =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;

function quantiles(values: number[]) {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

async function main() {
  const cases = loadCases().slice(0, limit);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (wantsAi && !apiKey) {
    console.error('--ai needs ANTHROPIC_API_KEY in the environment.');
    console.error('The key lives in Supabase edge secrets and is deliberately not readable from here.');
    console.error('Export it in a shell you control, then re-run. Nothing is fabricated without it.');
    process.exit(2);
  }

  const rows: Array<Record<string, unknown>> = [];
  const latencies: number[] = [];
  let aiErrors = 0;
  const flagCounts = new Map<string, number>();
  const intentAgreement = { agree: 0, differ: 0, bothUnknown: 0 };
  const byFile = new Map<string, { total: number; parserKnew: number; aiKnew: number }>();

  for (const item of cases) {
    const parser = parserInterpretation(item.say);
    const ai = wantsAi ? await askModel(apiKey!, item.say) : null;
    if (ai) {
      latencies.push(ai.latencyMs);
      if (ai.error) aiErrors += 1;
      for (const flag of safetyFlags(ai)) {
        flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
      }
      const parserKnows = parser.intent !== 'unknown';
      const aiKnows = ai.intent !== 'unknown' && ai.intent !== 'no_tool';
      if (parserKnows && aiKnows) {
        parser.intent === ai.intent ? intentAgreement.agree++ : intentAgreement.differ++;
      } else if (!parserKnows && !aiKnows) {
        intentAgreement.bothUnknown++;
      } else {
        intentAgreement.differ++;
      }
      const bucket = byFile.get(item.file) ?? { total: 0, parserKnew: 0, aiKnew: 0 };
      bucket.total += 1;
      if (parserKnows) bucket.parserKnew += 1;
      if (aiKnows) bucket.aiKnew += 1;
      byFile.set(item.file, bucket);
    }

    rows.push({
      id: `${item.file}#${item.id}`,
      say: item.say.slice(0, 48),
      expect_intent: item.expectIntent ?? null,
      expect_tool: item.expectTool ?? null,
      parser_route: parser.route,
      parser_intent: parser.intent,
      ai_tool: ai?.tool ?? null,
      ai_intent: ai?.intent ?? null,
      ai_latency_ms: ai?.latencyMs ?? null,
      ai_error: ai?.error ?? null,
      flags: ai ? safetyFlags(ai) : [],
    });
  }

  if (wantsJson) {
    console.log(JSON.stringify({
      model: MODEL, prompt_version: PROMPT_VERSION, tool_schema_version: TOOL_SCHEMA_VERSION,
      cases: cases.length, ai_run: wantsAi, rows,
    }, null, 2));
    return;
  }

  console.log(`\nStage A baseline — ${cases.length} cases`);
  console.log(`model ${MODEL} · prompt ${PROMPT_VERSION} · tools ${TOOL_SCHEMA_VERSION}\n`);

  const disagreements = rows.filter((row) => row.ai_intent && row.ai_intent !== row.parser_intent);
  for (const row of (wantsAi ? disagreements : rows).slice(0, 40)) {
    const flags = (row.flags as string[]).length > 0 ? `  !! ${(row.flags as string[]).join(',')}` : '';
    console.log(
      `${String(row.id).padEnd(28)} ${String(row.say).padEnd(50)}`
      + ` parser=${String(row.parser_intent).padEnd(22)}`
      + (wantsAi ? ` ai=${String(row.ai_intent ?? '-').padEnd(22)}${flags}` : ''),
    );
  }
  if (wantsAi && disagreements.length > 40) {
    console.log(`  … and ${disagreements.length - 40} more disagreements`);
  }

  const parserKnew = rows.filter((row) => row.parser_intent !== 'unknown').length;
  console.log(`\nPARSER CHAIN`);
  console.log(`  produced an intent      ${parserKnew}/${rows.length}  ${percent(parserKnew, rows.length)}`);

  if (!wantsAi) {
    console.log('\nRun again with --ai for the model side. It needs ANTHROPIC_API_KEY.\n');
    return;
  }

  const aiKnew = rows.filter((row) => row.ai_intent && row.ai_intent !== 'unknown' && row.ai_intent !== 'no_tool').length;
  const { p50, p95, p99 } = quantiles(latencies);
  console.log(`\nMODEL`);
  console.log(`  produced an intent      ${aiKnew}/${rows.length}  ${percent(aiKnew, rows.length)}`);
  console.log(`  provider failures       ${aiErrors}`);
  console.log(`  latency  p50 ${p50}ms · p95 ${p95}ms · p99 ${p99}ms`);
  console.log(`\nAGREEMENT WITH PARSER CHAIN`);
  console.log(`  agree                   ${intentAgreement.agree}`);
  console.log(`  differ                  ${intentAgreement.differ}`);
  console.log(`  neither understood      ${intentAgreement.bothUnknown}`);
  console.log(`\nSAFETY  (any non-zero is a blocker, not a metric)`);
  for (const flag of ['financial_field', 'authority_field', 'confirmation_claim', 'unknown_tool']) {
    console.log(`  ${flag.padEnd(22)}${flagCounts.get(flag) ?? 0}`);
  }
  console.log(`\nWHERE THE GAP IS  (by corpus file — this is the number that decides Stage B)`);
  for (const [file, bucket] of [...byFile.entries()].sort()) {
    console.log(`  ${file.padEnd(28)} parser ${percent(bucket.parserKnew, bucket.total).padStart(6)}`
      + `   model ${percent(bucket.aiKnew, bucket.total).padStart(6)}   (${bucket.total} cases)`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
