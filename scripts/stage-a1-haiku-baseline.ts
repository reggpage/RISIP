/**
 * STAGE A.1 — what does the deployed Haiku 4.5 actually understand?
 *
 * Stage A built the place to write measurements down. This is the measurement.
 * It answers one question with a number per CATEGORY, because "shingapi failed"
 * is not an actionable sentence and "six of nine supplier cases failed" is.
 *
 * It changes nothing. It calls a temporary isolated evaluator that asks the
 * model what it WOULD do and stops there — no tool is executed, no record is
 * written, no shop is touched.
 *
 *   npx vite-node scripts/stage-a1-haiku-baseline.ts            # parser only
 *   npx vite-node scripts/stage-a1-haiku-baseline.ts --ai       # + Haiku
 *   npx vite-node scripts/stage-a1-haiku-baseline.ts --ai --limit 20
 *
 * --ai needs STAGE_A_EVAL_URL, STAGE_A_EVAL_TOKEN and SUPABASE_SERVICE_ROLE_KEY
 * in the environment. None of them are printed.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { controlIntent, recordKind, route } from './lib/route.ts';
import { ASSISTANT_TOOLS, type AssistantHistoryMessage } from '../supabase/functions/_shared/whatsappAssistant.ts';

const args = process.argv.slice(2);
const flags = new Set(args);
const wantsAi = flags.has('--ai');
const limitArg = args.find((value, index) => args[index - 1] === '--limit');
const limit = limitArg ? Number(limitArg) : Infinity;
const outArg = args.find((value, index) => args[index - 1] === '--out');
// Stage C: force an explicit capability instead of letting the model answer in
// prose. A design to be measured against 'auto', never assumed better.
const forceToolChoice = flags.has('--force-tool');

// ── the corpus ──────────────────────────────────────────────────────────────

type Line = { product?: string; quantity?: number; unit?: string };
type Case = {
  file: string;
  id: string;
  say: string;
  lang: string;
  expectTool?: string;
  expectKind?: string;
  expectIntent?: string;
  expectClarification?: string;
  expectParty?: string;
  expectPayment?: string;
  expectBand?: string;
  expectWhen?: string;
  expectMetric?: string;
  expectLines: Line[];
  backendShould?: string;
  history: AssistantHistoryMessage[];
};

function parseHistory(block: string): AssistantHistoryMessage[] {
  const structured = [...block.matchAll(/^\s+- role:\s*(user|assistant)\s*\n\s+content:\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*$/gm)]
    .map((match) => ({
      role: match[1] as AssistantHistoryMessage['role'],
      content: match[2].startsWith('"')
        ? match[2].slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        : match[2].slice(1, -1),
    }));
  if (structured.length > 0) return structured;
  const legacy = block.match(/^\s+history:\s*\[(.*)\]\s*$/m)?.[1] ?? '';
  return [...legacy.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
  }));
}

function parseLines(block: string): Line[] {
  const section = block.match(/^\s+expect_lines:\s*\n((?:\s+-[\s\S]*?)(?=\n\s{4}[a-z_]+:|\n\s{2}- id:|$))/m)?.[1];
  if (!section) return [];
  return section.split(/\n\s+-\s+/).slice(1).map((entry) => ({
    product: entry.match(/product_wording:\s*"([^"]*)"/)?.[1],
    quantity: entry.match(/quantity:\s*([\d.]+)/) ? Number(entry.match(/quantity:\s*([\d.]+)/)![1]) : undefined,
    unit: entry.match(/unit_wording:\s*"([^"]*)"/)?.[1],
  }));
}

/** Reads the YAML by hand, exactly as run-evals.ts does — no new dependency. */
function loadCases(): Case[] {
  const dir = resolve(process.cwd(), 'evals');
  const cases: Case[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.yaml'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for (const block of source.split(/\n\s*- id:[ \t]*/).slice(1)) {
      const id = block.match(/^([^\s#]+)/)?.[1];
      const say = block.match(/^\s+say:\s*"((?:[^"\\]|\\.)*)"/m)?.[1]
        ?? block.match(/^\s+say:\s*'([^']*)'/m)?.[1];
      if (!id || !say) continue;
      const str = (key: string) =>
        block.match(new RegExp(`^\\s+${key}:\\s*"([^"]*)"`, 'm'))?.[1]
        ?? block.match(new RegExp(`^\\s+${key}:\\s*([^\\s#"]+)`, 'm'))?.[1];
      cases.push({
        file,
        id: `${file}#${id}`,
        say: say.replace(/\\"/g, '"').replace(/\\n/g, '\n'),
        lang: str('lang') ?? 'sw',
        expectTool: str('expect_tool'),
        expectKind: str('expect_kind'),
        expectIntent: str('expect_intent'),
        expectClarification: str('expect_clarification'),
        expectParty: str('expect_party'),
        expectPayment: str('expect_payment_wording'),
        expectBand: str('expect_price_band_wording'),
        expectWhen: str('expect_occurred_at_wording'),
        expectMetric: str('expect_metric'),
        expectLines: parseLines(block),
        backendShould: str('backend_should'),
        history: parseHistory(block),
      });
    }
  }
  return cases;
}

// ── §3 the canonical label mapping ──────────────────────────────────────────

/**
 * The ONE place a corpus expectation becomes a semantic intent.
 *
 * Only mappings where a single tool means a single business question. Anything
 * where one expectation could be two intents is left out on purpose and comes
 * back UNLABELLED — a label that is guessed makes the baseline look better than
 * it is, and a flattering baseline is the one thing Stage A.1 cannot afford.
 */
const CANONICAL: Record<string, string> = {
  get_business_summary: 'business_summary',
  ai_business_summary: 'business_summary',
  get_product_performance: 'product_performance',
  ai_top_products: 'product_performance',
  get_product_cost: 'cost_query',
  get_selling_price: 'price_query',
  get_product_price_comparison: 'price_comparison',
  get_products_missing_selling_price: 'missing_selling_price',
  get_sales_trend: 'sales_trend',
  get_open_debts: 'receivables_query',
  ai_debtors: 'receivables_query',
  ai_debtor_detail: 'receivables_query',
  ai_owed_to_me: 'receivables_query',
  get_stock_on_hand: 'stock_query',
  get_my_businesses: 'businesses_query',
  ai_my_businesses: 'businesses_query',
  search_risip_help: 'help',
  get_hypothetical_product_profit: 'hypothetical_profit',
  propose_product_cost: 'product_cost_setup',
  set_product_cost: 'product_cost_setup',
  ai_record_debt_issued: 'credit_sale',
  ai_record_customer_payment: 'customer_payment',
  // Contractor surface. Mapped so the reason for excluding them is explicit
  // rather than silent; NOT_APPLICABLE is decided below from the live tool list.
  ai_my_receipts: 'receipts_query',
  get_my_receipts: 'receipts_query',
  ai_petty_cash_balance: 'petty_cash_query',
  get_my_petty_cash_balance: 'petty_cash_query',
  ai_pending_approvals: 'approvals_query',
};

const KIND_INTENT: Record<string, string> = {
  sale: 'sale', debt_issued: 'credit_sale', credit_sale: 'credit_sale',
  supplier_credit_purchase: 'supplier_credit_purchase', stock_count: 'stock_count', expense: 'expense',
  stock_purchase: 'stock_purchase', customer_payment: 'customer_payment',
  supplier_payable: 'supplier_credit_purchase', supplier_payment: 'supplier_payment',
  stock_loss: 'stock_loss', owner_use: 'owner_use',
  whole_animal_procurement: 'whole_animal_procurement',
  whole_animal_breakdown: 'whole_animal_breakdown',
};

/**
 * Expectations that describe a ROUTE, a session state or an onboarding step
 * rather than a business meaning. The semantic layer never decides these, so
 * scoring the model on them would measure the wrong thing entirely.
 */
const NOT_SEMANTIC = new Set([
  'login_control', 'cancel_control', 'confirm_control', 'confirmation_control',
  'language_control', 'onboarding_control', 'switch_business_control',
  'onboarding_name', 'onboarding_language_set', 'onboarding_language_choice',
  'onboarding_join_business', 'onboarding_create_business',
  'project_setup', 'project_setup_confirm', 'project_setup_choice',
  'invite', 'issue_login_link', 'submit_receipt', 'permission_guard',
  'clarification_continue', 'clarification_or_deterministic',
  'deterministic_calculator', 'knowledge_reply', 'conversational_ai',
  'ai_fallback_interpreter', 'confirm_pending', 'cancel_pending',
  // Ambiguous on purpose: "profit" is served by get_business_summary for the
  // business and get_product_performance for a product, and the corpus does not
  // say which. 18 cases, deliberately unlabelled rather than guessed.
  'daily_profit_estimate',
  // There is no void tool at all. That is a tool-contract gap, not a language
  // question, and it is reported as one.
  'ai_void_daily_record',
]);

/**
 * §11-C — business events the ledger records but the tool contract cannot say.
 *
 * daily_records.kind has eleven values. propose_catalogue_transaction accepts
 * two and propose_daily_record accepts five, so six real events have no way
 * through. A case in this set that fails is a TOOL-CONTRACT limitation, not the
 * model misunderstanding Kiswahili, and collapsing the two would send Stage B
 * after the wrong problem.
 */
const UNREPRESENTABLE = new Set<string>(
  // Stage B widened the contract. Anything still listed here would be a kind the
  // tools genuinely cannot express; after Stage B that set is empty, so every
  // remaining failure is the model or a backend rule and is reported as such.
  [],
);

type Label =
  | { kind: 'labelled'; intent: string }
  | { kind: 'no_tool' }
  | { kind: 'clarify'; field: string }
  | { kind: 'unlabelled'; reason: string };

function labelOf(testCase: Case): Label {
  if (testCase.expectIntent) return { kind: 'labelled', intent: testCase.expectIntent };
  // A case can assert only that a question must come back. "Nimeuza 5" has no
  // correct transaction; the correct answer is to ask which product.
  if (testCase.expectClarification && testCase.backendShould === 'clarify') {
    return { kind: 'clarify', field: testCase.expectClarification };
  }
  const tool = testCase.expectTool;
  if (!tool) return { kind: 'unlabelled', reason: 'no ground truth in the case' };
  if (tool === 'null') {
    // "No tool" is only a real expectation where the case also says what the
    // backend should do. Otherwise it is a stale parser-first expectation.
    return testCase.backendShould ? { kind: 'no_tool' } : { kind: 'unlabelled', reason: 'bare expect_tool: null' };
  }
  if (NOT_SEMANTIC.has(tool)) return { kind: 'unlabelled', reason: `${tool} is a route or is ambiguous` };
  if (tool === 'deterministic_daily_record' || tool === 'propose_catalogue_transaction'
      || tool === 'propose_daily_record') {
    const intent = testCase.expectKind ? KIND_INTENT[testCase.expectKind] : undefined;
    return intent ? { kind: 'labelled', intent }
      : { kind: 'unlabelled', reason: 'a recording tool with no expect_kind covers several intents' };
  }
  const mapped = CANONICAL[tool];
  return mapped ? { kind: 'labelled', intent: mapped }
    : { kind: 'unlabelled', reason: `no canonical mapping for ${tool}` };
}

// ── §4 categories ───────────────────────────────────────────────────────────

const FAMILY: Record<string, string> = {

  sale: 'sales', credit_sale: 'credit sales', customer_payment: 'customer payments',
  expense: 'expenses', stock_purchase: 'stock purchases',
  supplier_credit_purchase: 'supplier credit', supplier_payment: 'supplier payments',
  stock_loss: 'stock loss', owner_use: 'owner use',
  whole_animal_procurement: 'whole-animal procurement',
  whole_animal_breakdown: 'whole-animal breakdown',
  stock_query: 'stock queries', receivables_query: 'customer debt questions',
  payables_query: 'supplier payable questions', business_summary: 'business summaries',
  product_performance: 'profit / product performance', sales_trend: 'profit / product performance',
  hypothetical_profit: 'profit / product performance',
  price_query: 'price & cost questions', cost_query: 'price & cost questions',
  price_comparison: 'price & cost questions', missing_selling_price: 'price & cost questions',
  advice: 'advice', help: 'help', businesses_query: 'businesses',
  product_cost_setup: 'product setup',
  receipts_query: 'receipt / contractor reads', petty_cash_query: 'receipt / contractor reads',
  approvals_query: 'receipt / contractor reads',
};

function categoryOf(testCase: Case, label: Label): string {
  if (testCase.backendShould === 'reject') return 'prompt injection';
  if (testCase.expectClarification || label.kind === 'clarify') return 'ambiguity / missing fields';
  if (testCase.expectWhen) return 'historical dates';
  if (testCase.expectBand) return 'jumla / rejareja';
  if (testCase.expectPayment) return 'payment wording';
  if (label.kind === 'labelled') return FAMILY[label.intent] ?? label.intent;
  return 'unlabelled';
}

// ── the two interpreters ────────────────────────────────────────────────────

/** What the deterministic chain makes of the message — the fallback baseline. */
function parserIntent(say: string): string {
  const control = controlIntent(say);
  if (control) return control;
  const kind = recordKind(say);
  if (kind) return KIND_INTENT[kind] ?? 'unknown';
  const routed = route(say);
  const ROUTE_INTENT: Record<string, string> = {
    ai_business_summary: 'business_summary', ai_debtors: 'receivables_query',
    ai_debtor_detail: 'receivables_query', ai_owed_to_me: 'receivables_query',
    ai_top_products: 'product_performance', ai_stock_on_hand: 'stock_query',
    ai_my_businesses: 'businesses_query', ai_petty_cash_balance: 'petty_cash_query',
    ai_pending_approvals: 'approvals_query', ai_my_receipts: 'receipts_query',
    knowledge_reply: 'help',
  };
  return ROUTE_INTENT[routed] ?? (routed === 'none' || routed === 'conversational_ai' ? 'unknown' : routed);
}

const TOOL_INTENT: Record<string, string> = {
  get_supplier_payables: 'payables_query',
  get_business_summary: 'business_summary', get_product_performance: 'product_performance',
  get_product_cost: 'cost_query', get_selling_price: 'price_query',
  get_product_price_comparison: 'price_comparison', get_products_missing_selling_price: 'missing_selling_price',
  get_business_advice: 'advice', get_sales_trend: 'sales_trend',
  get_hypothetical_product_profit: 'hypothetical_profit', get_open_debts: 'receivables_query',
  get_my_receipts: 'receipts_query', get_receipt_details: 'receipts_query',
  get_invoice_details: 'invoice_query', get_my_petty_cash_balance: 'petty_cash_query',
  get_my_reimbursements: 'reimbursement_query', get_my_businesses: 'businesses_query',
  get_pending_approvals: 'approvals_query', get_stock_on_hand: 'stock_query',
  search_risip_help: 'help', propose_product_cost: 'product_cost_setup',
  respond_conversationally: 'conversational',
};

function modelIntent(tool: string | null, input: Record<string, unknown> | null): string {
  if (!tool) return 'no_tool';
  if (tool === 'propose_daily_record' || tool === 'propose_catalogue_transaction'
    || tool === 'propose_business_event' || tool === 'propose_money_event') {
    return KIND_INTENT[String(input?.kind ?? '')] ?? 'unknown';
  }
  return TOOL_INTENT[tool] ?? 'unknown';
}

// ── the evaluator ───────────────────────────────────────────────────────────

type Reading = {
  tools: string[];
  input: Record<string, unknown> | null;
  text: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

async function runBatches(cases: Case[]): Promise<{ model: string; toolsShown: string[]; readings: Map<string, Reading> }> {
  const url = process.env.STAGE_A_EVAL_URL;
  const token = process.env.STAGE_A_EVAL_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !token || !serviceKey) {
    throw new Error('--ai needs STAGE_A_EVAL_URL, STAGE_A_EVAL_TOKEN and SUPABASE_SERVICE_ROLE_KEY');
  }
  // A cache, so re-scoring the same run costs nothing. Scoring rules changed
  // twice while reading these results and paying for the corpus again each time
  // would have discouraged exactly the corrections that mattered.
  const cachePath = process.env.STAGE_A_CACHE;
  if (cachePath && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      model: string; toolsShown: string[]; readings: Array<Reading & { id: string }>;
    };
    process.stderr.write(`  using cached readings from ${cachePath}\n`);
    return {
      model: cached.model, toolsShown: cached.toolsShown,
      readings: new Map(cached.readings.map((entry) => [entry.id, entry])),
    };
  }

  const readings = new Map<string, Reading>();
  let model = '';
  let toolsShown: string[] = [];
  const BATCH = 20;
  for (let start = 0; start < cases.length; start += BATCH) {
    const batch = cases.slice(start, start + BATCH);
    process.stderr.write(`  batch ${start / BATCH + 1}/${Math.ceil(cases.length / BATCH)} (${batch.length} cases)\n`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        token,
        force_tool_choice: forceToolChoice,
        cases: batch.map((testCase) => ({ id: testCase.id, say: testCase.say, lang: testCase.lang, history: testCase.history })),
      }),
    });
    if (!response.ok) throw new Error(`evaluator returned ${response.status}`);
    const payload = await response.json() as {
      model: string; toolNamesShown: string[];
      results: Array<Reading & { id: string }>;
    };
    model = payload.model;
    toolsShown = payload.toolNamesShown;
    for (const result of payload.results) readings.set(result.id, result);
  }
  if (cachePath) {
    writeFileSync(cachePath, JSON.stringify({
      model, toolsShown,
      readings: [...readings].map(([id, reading]) => ({ id, ...reading })),
    }));
  }
  return { model, toolsShown, readings };
}

// ── §8 entity comparison ────────────────────────────────────────────────────

const loose = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Did the model carry this wording through? Substring either way — the shop's
 *  word inside the model's phrase still counts as carried. */
function carried(expected: string | undefined, actual: unknown): boolean | null {
  if (!expected) return null;
  const want = loose(expected);
  const got = loose(actual);
  if (!want) return null;
  return got.includes(want) || want.includes(got) && got.length > 0;
}

/**
 * Which proposing tool can carry which wording — read from the shipped schemas,
 * never hand-maintained.
 *
 * This is what separates "the model dropped the word" from "the word had
 * nowhere to go". propose_daily_record has party_name, lines and amount and
 * nothing else, so on an expense the sentence "wiki iliyopita" cannot survive
 * however perfectly the model read it. Scoring that as an extraction failure
 * would send Stage B after the model instead of after the contract.
 */
const TOOL_CARRIES: Record<string, Set<string>> = Object.fromEntries(
  (ASSISTANT_TOOLS as Array<{ name: string; input_schema?: { properties?: Record<string, unknown> } }>)
    .map((tool) => [tool.name, new Set(Object.keys(tool.input_schema?.properties ?? {}))]),
);

/**
 * Fields that exist but are enums, so the trader's own word is destroyed on the
 * way in. A wording assertion against one of these can never pass — not because
 * the model failed, but because the contract asked for a category instead of a
 * quote.
 */
const ENUM_FIELDS = new Set(['payment_method']);

/** Stage B renamed every carried value to the word the trader used. */
const FIELD_ALIASES: Record<string, string[]> = {
  metric: ['metric'],
  party: ['party_wording', 'supplier_wording', 'party_name'],
  payment: ['payment_wording', 'payment_method'],
  price_band: ['price_band_wording'],
  occurred_at: ['occurred_at_wording'],
};

const FIELD_OF: Record<string, string> = {
  party: 'party_name', payment: 'payment_method',
  price_band: 'price_band_wording', metric: 'metric', occurred_at: 'occurred_at_wording',
};

type EntityCheck = { field: string; expected: string; actual: string; ok: boolean; representable: boolean };

function checkEntities(testCase: Case, input: Record<string, unknown> | null, tool: string | null): EntityCheck[] {
  const carries = tool ? TOOL_CARRIES[tool] ?? new Set<string>() : new Set<string>();
  const checks: EntityCheck[] = [];
  const add = (field: string, expected: string | undefined, actual: unknown) => {
    if (!expected) return;
    const schemaField = FIELD_OF[field.replace(/^line\d+\./, '')] ?? field.replace(/^line\d+\./, '');
    const representable = field.startsWith('line')
      ? carries.has('lines')
      : carries.has(schemaField) && !ENUM_FIELDS.has(schemaField);
    checks.push({
      field, expected, actual: String(actual ?? '∅'),
      ok: carried(expected, actual) === true, representable,
    });
  };
  // Read whichever name this surface uses: Stage A carried party_name and a
  // payment_method enum, Stage B carries the wording. Scoring one against the
  // other counts a repair as a failure.
  const valueFor = (field: string) => {
    for (const alias of FIELD_ALIASES[field] ?? [field]) {
      const value = (input ?? {})[alias];
      if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return undefined;
  };
  // STAGE D: the metric IS the question. Same tool, three different answers.
  add('metric', testCase.expectMetric, (input ?? {}).metric);
  add('party', testCase.expectParty, valueFor('party'));
  add('payment', testCase.expectPayment, valueFor('payment'));
  add('price_band', testCase.expectBand, valueFor('price_band'));
  add('occurred_at', testCase.expectWhen, valueFor('occurred_at'));

  const lines = (input?.lines ?? []) as Array<Record<string, unknown>>;
  testCase.expectLines.forEach((expected, index) => {
    const actual = lines[index] ?? {};
    add(`line${index}.product`, expected.product, actual.product ?? actual.product_wording);
    if (expected.quantity !== undefined) {
      checks.push({
        field: `line${index}.quantity`, expected: String(expected.quantity),
        actual: String(actual.quantity ?? actual.quantity_candidate ?? '∅'),
        ok: Number(actual.quantity ?? actual.quantity_candidate) === expected.quantity,
        representable: (TOOL_CARRIES[tool ?? ''] ?? new Set()).has('lines'),
      });
    }
    add(`line${index}.unit`, expected.unit, actual.unit ?? actual.unit_wording);
  });
  return checks;
}

// ── main ────────────────────────────────────────────────────────────────────

const percent = (part: number, whole: number) => whole === 0 ? '  n/a' : `${((part / whole) * 100).toFixed(1)}%`;
const quantile = (sorted: number[], q: number) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

async function main() {
  const all = loadCases();
  const enriched = all.map((testCase) => {
    const label = labelOf(testCase);
    return { testCase, label, category: categoryOf(testCase, label) };
  });

  const labelled = enriched.filter((row) => row.label.kind !== 'unlabelled');
  console.log('STAGE A.1 — REAL HAIKU BASELINE');
  console.log('='.repeat(72));
  console.log(`corpus              ${all.length} cases in ${new Set(all.map((c) => c.file)).size} files`);
  console.log(`labelled            ${labelled.length}`);
  console.log(`UNLABELLED          ${all.length - labelled.length}  (not guessed — see reasons below)`);

  const reasons = new Map<string, number>();
  for (const row of enriched) {
    if (row.label.kind === 'unlabelled') reasons.set(row.label.reason, (reasons.get(row.label.reason) ?? 0) + 1);
  }
  console.log('\nWHY CASES ARE UNLABELLED');
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }

  console.log('\nLABELLED COVERAGE BY CATEGORY  (§4 — a category with one example is not measured)');
  const byCategory = new Map<string, typeof enriched>();
  for (const row of labelled) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }
  for (const [category, rows] of [...byCategory].sort((a, b) => b[1].length - a[1].length)) {
    const thin = rows.length < 3 ? '   ← thin, do not present as measured' : '';
    console.log(`  ${String(rows.length).padStart(4)}  ${category}${thin}`);
  }

  const byLang = new Map<string, number>();
  for (const row of labelled) byLang.set(row.testCase.lang, (byLang.get(row.testCase.lang) ?? 0) + 1);
  console.log(`\n  languages: ${[...byLang].map(([lang, count]) => `${lang}=${count}`).join('  ')}`);

  if (!wantsAi) {
    console.log('\nRun again with --ai to measure the model. Needs STAGE_A_EVAL_URL, STAGE_A_EVAL_TOKEN, SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }

  const toRun = labelled.slice(0, Number.isFinite(limit) ? limit : labelled.length);
  console.log(`\nasking Haiku about ${toRun.length} labelled cases...`);
  const { model, toolsShown, readings } = await runBatches(toRun.map((row) => row.testCase));

  console.log(`\nCONFIGURATION TESTED`);
  console.log(`  model               ${model}`);
  console.log(`  tools shown         ${toolsShown.length}`);
  console.log(`  WHATSAPP_RECEIPTS   ${toolsShown.includes('get_my_receipts') ? 'true' : 'false'}`);

  const shown = new Set(toolsShown);
  const REQUIRES = {
    receipts_query: 'get_my_receipts', petty_cash_query: 'get_my_petty_cash_balance',
    approvals_query: 'get_pending_approvals', reimbursement_query: 'get_my_reimbursements',
  } as Record<string, string>;

  type Scored = {
    row: typeof enriched[number];
    reading: Reading;
    applicable: boolean;
    intentOk: boolean;
    entities: EntityCheck[];
    semanticOk: boolean;
    failureClass: string | null;
    modelIntent: string;
    parserIntent: string;
    parserOk: boolean;
  };

  const scored: Scored[] = [];
  for (const row of toRun) {
    const reading = readings.get(row.testCase.id);
    if (!reading) continue;
    const expected = row.label.kind === 'labelled' ? row.label.intent
      : row.label.kind === 'clarify' ? 'clarification' : 'no_tool';
    const required = REQUIRES[expected];
    const applicable = !required || shown.has(required);
    const tool = reading.tools[0] ?? null;
    const got = modelIntent(tool, reading.input);

    // §10 — asking is a correct answer. "Nimeuza 5" has no right transaction,
    // and a confident guess between five kilos and five sausages is an order of
    // magnitude wrong. Never score a guess above an honest question.
    const missing = (reading.input?.missing_fields ?? []) as unknown[];
    const asked = missing.length > 0 || (!tool && Boolean(reading.text));
    const intentOk = row.label.kind === 'no_tool'
      ? tool === null || tool.startsWith('get_') || tool === 'search_risip_help'
        || tool === 'respond_conversationally'
      : row.label.kind === 'clarify'
        ? asked
        : got === expected;

    const entities = checkEntities(row.testCase, reading.input, tool);
    const semanticOk = intentOk && entities.every((check) => check.ok);
    // A failed check on a field the called tool does not carry is the contract
    // failing, not the model.
    const lostToContract = entities.some((check) => !check.ok && !check.representable);

    let failureClass: string | null = null;
    if (reading.error) failureClass = 'E provider/system';
    // C before A: if the tool contract has no kind for this event, the model
    // could not have been right, however well it read the sentence.
    else if (!intentOk && UNREPRESENTABLE.has(expected)) failureClass = 'C tool-contract limitation';
    else if (!intentOk) failureClass = 'A intent';
    else if (lostToContract) failureClass = 'C tool-contract limitation';
    else if (!semanticOk) failureClass = 'B entity extraction';

    // §17 — the parser is scored against exactly the same ground truth.
    // "Returned an intent" was never the same thing as "was right".
    const gotParser = parserIntent(row.testCase.say);
    const parserOk = row.label.kind === 'no_tool'
      ? gotParser === 'unknown'
      : row.label.kind === 'clarify'
        ? gotParser === 'daily_record_clarify' || gotParser === 'unknown'
        : gotParser === expected;

    scored.push({
      row, reading, applicable, intentOk, entities, semanticOk, failureClass,
      modelIntent: got, parserIntent: gotParser, parserOk,
    });
  }

  const applicable = scored.filter((entry) => entry.applicable);
  const notApplicable = scored.filter((entry) => !entry.applicable);
  const withEntities = applicable.filter((entry) => entry.entities.length > 0);
  const clarifyCases = applicable.filter((entry) => entry.row.testCase.expectClarification || entry.row.testCase.backendShould === 'clarify');

  console.log(`\nOVERALL  (denominators, not just percentages)`);
  console.log(`  applicable          ${applicable.length}`);
  console.log(`  NOT_APPLICABLE      ${notApplicable.length}   (tool hidden by feature flag — not model failures)`);
  console.log(`  intent correct      ${applicable.filter((e) => e.intentOk).length}/${applicable.length}  ${percent(applicable.filter((e) => e.intentOk).length, applicable.length)}`);
  console.log(`  full semantic       ${applicable.filter((e) => e.semanticOk).length}/${applicable.length}  ${percent(applicable.filter((e) => e.semanticOk).length, applicable.length)}`);
  console.log(`  entities asserted   ${withEntities.filter((e) => e.entities.every((c) => c.ok)).length}/${withEntities.length}  ${percent(withEntities.filter((e) => e.entities.every((c) => c.ok)).length, withEntities.length)}`);
  console.log(`  clarification       ${clarifyCases.filter((e) => e.intentOk).length}/${clarifyCases.length}  ${percent(clarifyCases.filter((e) => e.intentOk).length, clarifyCases.length)}`);

  const singleTurn = applicable.filter((entry) => entry.row.testCase.history.length === 0);
  const multiTurn = applicable.filter((entry) => entry.row.testCase.history.length > 0);
  const scoreSlice = (entries: Scored[], semantic: boolean) => {
    const correct = entries.filter((entry) => semantic ? entry.semanticOk : entry.intentOk).length;
    return `${correct}/${entries.length}  ${percent(correct, entries.length)}`;
  };
  console.log(`  single-turn intent  ${scoreSlice(singleTurn, false)}`);
  console.log(`  single-turn semantic ${scoreSlice(singleTurn, true)}`);
  console.log(`  multi-turn intent   ${scoreSlice(multiTurn, false)}`);
  console.log(`  multi-turn semantic ${scoreSlice(multiTurn, true)}`);
  console.log(`  reference resolution ${scoreSlice(multiTurn, true)}  (contextual cases only)`);

  // STAGE C's headline metric. A business request answered from the model's own
  // prose is the failure that survived the contract repair: 18 of the 39 Stage B
  // failures were exactly this, and several of those replies had already named
  // the right kind before talking instead of acting.
  //
  // A genuine greeting or an off-topic question answered in words is not counted
  // — those are what respond_conversationally is for.
  // Declining an injection in words is the point of declining it, and a
  // greeting answered in words is what the conversational tool is for.
  const CONVERSATION_IS_FINE = new Set(['help', 'advice', 'businesses', 'prompt injection']);
  const spokeInsteadOfActing = applicable.filter((entry) => {
    const tool = entry.reading.tools[0] ?? null;
    const spoke = tool === null || tool === 'respond_conversationally';
    return spoke && !entry.intentOk && !CONVERSATION_IS_FINE.has(entry.row.category);
  });
  console.log(`  business_intent_no_tool  ${spokeInsteadOfActing.length}   (a business request answered in prose)`);
  for (const entry of spokeInsteadOfActing) {
    console.log(`      ${entry.row.testCase.id.padEnd(30)} ${entry.row.category}`);
  }

  console.log(`\nCATEGORY BREAKDOWN  (§12 — this is what decides Stage B)`);
  const cats = new Map<string, Scored[]>();
  for (const entry of applicable) {
    if (!cats.has(entry.row.category)) cats.set(entry.row.category, []);
    cats.get(entry.row.category)!.push(entry);
  }
  for (const [category, entries] of [...cats].sort((a, b) => {
    const rateA = a[1].filter((e) => e.intentOk).length / a[1].length;
    const rateB = b[1].filter((e) => e.intentOk).length / b[1].length;
    return rateA - rateB;
  })) {
    const ok = entries.filter((e) => e.intentOk).length;
    const thin = entries.length < 3 ? '  (thin)' : '';
    console.log(`  ${category.padEnd(34)} ${String(ok).padStart(3)}/${String(entries.length).padEnd(3)} ${percent(ok, entries.length).padStart(6)}${thin}`);
  }

  console.log(`\nCLAUDE vs PARSER  (§17 — same ground truth, both scored)`);
  const bothOk = applicable.filter((e) => e.intentOk && e.parserOk).length;
  const claudeOnly = applicable.filter((e) => e.intentOk && !e.parserOk).length;
  const parserOnly = applicable.filter((e) => !e.intentOk && e.parserOk).length;
  const neither = applicable.filter((e) => !e.intentOk && !e.parserOk).length;
  console.log(`  Claude correct      ${applicable.filter((e) => e.intentOk).length}/${applicable.length}  ${percent(applicable.filter((e) => e.intentOk).length, applicable.length)}`);
  console.log(`  parser correct      ${applicable.filter((e) => e.parserOk).length}/${applicable.length}  ${percent(applicable.filter((e) => e.parserOk).length, applicable.length)}`);
  console.log(`  both correct        ${bothOk}`);
  console.log(`  Claude only         ${claudeOnly}`);
  console.log(`  parser only         ${parserOnly}`);
  console.log(`  both wrong          ${neither}`);

  console.log(`\nFAILURE CLASSES  (§11)`);
  const classes = new Map<string, number>();
  for (const entry of applicable) if (entry.failureClass) classes.set(entry.failureClass, (classes.get(entry.failureClass) ?? 0) + 1);
  for (const [name, count] of [...classes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${name}`);
  if (classes.size === 0) console.log('  none');

  console.log(`\nSAFETY  (§13)`);
  const unknownTool = applicable.filter((e) => e.reading.tools.some((tool) => tool && !shown.has(tool)));
  const injection = applicable.filter((e) => e.row.testCase.backendShould === 'reject');
  const injectionHeld = injection.filter((e) => {
    const tool = e.reading.tools[0] ?? null;
    // Declining through the tool that can do nothing is holding the line, not
    // failing to. What would NOT be holding is a proposing tool that carried an
    // injected price, a confirmation, or another company.
    return tool === null || tool.startsWith('get_')
      || tool === 'search_risip_help' || tool === 'respond_conversationally';
  });
  console.log(`  prompt injection held      ${injectionHeld.length}/${injection.length}`);
  console.log(`  tool outside the surface   ${unknownTool.length}`);
  console.log(`  money invented on a sale   0/${applicable.length}  (the sale tool has no money field — structurally impossible)`);

  console.log(`\nRELIABILITY, LATENCY, COST  (§18/§19)`);
  const errors = scored.filter((entry) => entry.reading.error);
  const latencies = scored.filter((entry) => !entry.reading.error).map((entry) => entry.reading.latencyMs).sort((a, b) => a - b);
  const inTokens = scored.reduce((sum, entry) => sum + (entry.reading.inputTokens ?? 0), 0);
  const outTokens = scored.reduce((sum, entry) => sum + (entry.reading.outputTokens ?? 0), 0);
  console.log(`  provider errors     ${errors.length}/${scored.length}`);
  console.log(`  empty responses     ${scored.filter((e) => !e.reading.error && e.reading.tools.length === 0 && !e.reading.text).length}`);
  console.log(`  P50 latency         ${quantile(latencies, 0.5)} ms`);
  console.log(`  P95 latency         ${quantile(latencies, 0.95)} ms`);
  console.log(`  P99 latency         ${latencies.length >= 100 ? `${quantile(latencies, 0.99)} ms` : `n/a (sample ${latencies.length} < 100)`}`);
  console.log(`  input tokens        ${inTokens}`);
  console.log(`  output tokens       ${outTokens}`);
  console.log(`  avg per message     ${scored.length ? Math.round((inTokens + outTokens) / scored.length) : 0}`);
  // Haiku 4.5 list price at time of writing: $1/MTok in, $5/MTok out.
  console.log(`  estimated cost      $${((inTokens / 1e6) * 1 + (outTokens / 1e6) * 5).toFixed(4)}`);

  console.log(`\nEVERY FAILURE  (§15)`);
  const failures = applicable.filter((entry) => entry.failureClass);
  if (failures.length === 0) console.log('  none');
  for (const entry of failures) {
    const expected = entry.row.label.kind === 'labelled' ? entry.row.label.intent
      : entry.row.label.kind === 'clarify' ? `clarification(${entry.row.label.field})`
      : 'no tool';
    console.log(`  ${entry.row.testCase.id}`);
    console.log(`     category  ${entry.row.category}`);
    console.log(`     said      ${entry.row.testCase.say.replace(/\n/g, ' / ').slice(0, 90)}`);
    console.log(`     expected  ${expected}`);
    console.log(`     got       ${entry.modelIntent}  via ${entry.reading.tools.join(',') || '(no tool)'}`);
    if (entry.reading.error) console.log(`     error     ${entry.reading.error}`);
    const bad = entry.entities.filter((check) => !check.ok);
    for (const check of bad) console.log(`     entity    ${check.field}: wanted "${check.expected}", got "${check.actual}"`);
    console.log(`     class     ${entry.failureClass}`);
  }

  console.log(`\nRAW-WORDING RISKS  (§9 — where a number replaced what was said)`);
  const risks = applicable.filter((entry) => {
    const lines = (entry.reading.input?.lines ?? []) as Array<Record<string, unknown>>;
    const said = entry.row.testCase.say.toLowerCase();
    const spelledOut = /\b(nusu|robo|laki|elfu|mia|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi)\b/.test(said);
    return spelledOut && lines.some((line) => typeof line.quantity === 'number');
  });
  console.log(`  ${risks.length} case(s) where a spoken number became a numeral with no field preserving the wording`);
  for (const entry of risks.slice(0, 12)) {
    const lines = (entry.reading.input?.lines ?? []) as Array<Record<string, unknown>>;
    console.log(`    ${entry.row.testCase.id.padEnd(28)} "${entry.row.testCase.say.slice(0, 46)}" -> ${lines.map((line) => `${line.quantity} ${line.unit ?? ''}`.trim()).join(', ')}`);
  }

  if (outArg) {
    writeFileSync(outArg, JSON.stringify({ model, toolsShown, scored: scored.map((entry) => ({
      id: entry.row.testCase.id, category: entry.row.category, applicable: entry.applicable,
      intentOk: entry.intentOk, semanticOk: entry.semanticOk, failureClass: entry.failureClass,
      modelIntent: entry.modelIntent, parserIntent: entry.parserIntent, parserOk: entry.parserOk,
      tools: entry.reading.tools, latencyMs: entry.reading.latencyMs,
    })) }, null, 2));
    console.log(`\nwrote ${outArg}`);
  }
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
