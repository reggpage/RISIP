// Actually run the 240 evaluation cases.
//
// MEASURED FAILURE, and a large one: the eval set has existed for weeks, holds
// 240 cases, and NOT ONE of them had ever been executed. evalCoverage.test.ts
// reads the YAML and checks that ids are unique and each group is big enough —
// it never sends a single `say:` anywhere. The suite was green the whole time.
//
// This runner sends every case through the real routing chain and compares
// against `expect_tool`. It does not pretend to cover what it cannot reach:
// cases that need a prior turn, a role, a fixture in the database or the model
// itself are reported as UNCHECKED, with a count, so the coverage figure is a
// fact rather than a flattering one.
//
//   npx vite-node scripts/run-evals.ts          # summary
//   npx vite-node scripts/run-evals.ts --failed # every failure, with the text
//
// Exit code is non-zero when a checked case fails.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { route } from './lib/route.ts';

const FILES = [
  'a0_whatsapp.yaml',
  'conversation_quality.yaml',
  'debtors.yaml',
  'products.yaml',
  'profit.yaml',
];

type EvalCase = {
  file: string;
  id: string;
  say?: string;
  expectTool: string | null;
  hasHistory: boolean;
  hasRole: boolean;
  block: string;
};

function extractCases(file: string, source: string): EvalCase[] {
  const starts = [...source.matchAll(/^\s+- id:\s*([^\s#]+).*$/gm)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const block = source.slice(start, starts[index + 1]?.index ?? source.length);
    const tool = block.match(/^\s+expect_tool:\s*(null|[^\s#]+)\s*.*$/m)?.[1];
    return {
      file,
      id: match[1],
      say: block.match(/^\s+say:\s*["']([\s\S]*?)["']\s*$/m)?.[1],
      expectTool: tool === 'null' || tool === undefined ? null : tool,
      hasHistory: /^\s+history:/m.test(block),
      hasRole: /^\s+role:/m.test(block),
      block,
    };
  });
}

/**
 * Which routes satisfy which expectation.
 *
 * Deliberately narrow. An expectation this map does not mention is reported
 * UNCHECKED rather than quietly passed — the point of the exercise is to learn
 * what is actually verified, and a generous mapping would destroy that.
 */
const SATISFIES: Record<string, string[]> = {
  deterministic_daily_record: [
    'daily_record', 'daily_record_parsed', 'daily_record_clarify',
    'daily_record_unreadable', 'quantity_sale',
  ],
  clarification_or_deterministic: [
    'daily_record', 'daily_record_clarify', 'daily_record_parsed', 'quantity_sale',
  ],
  daily_profit_estimate: ['hypothetical_profit'],
  ai_top_products: ['product_analytics'],
  get_product_performance: ['product_analytics'],
  set_product_cost: ['product_cost', 'product_cost_batch', 'new_product'],
  propose_product_cost: ['product_cost', 'product_cost_batch'],
  get_product_cost: ['product_cost', 'ai_product_cost'],
  language_control: ['change_language'],
  onboarding_language_set: ['change_language'],
  ai_debtors: ['ai_debtors'],
  ai_debtor_detail: ['ai_debtor_detail'],
  get_open_debts: ['ai_debtors'],
  ai_my_receipts: ['ai_my_receipts'],
  get_my_receipts: ['ai_my_receipts'],
  ai_business_summary: ['ai_business_summary'],
  get_business_summary: ['ai_business_summary'],
  ai_owed_to_me: ['ai_owed_to_me'],
  ai_my_businesses: ['ai_my_businesses'],
  ai_pending_approvals: ['ai_pending_approvals'],
  ai_petty_cash_balance: ['ai_petty_cash_balance'],
  get_my_petty_cash_balance: ['ai_petty_cash_balance'],
  conversational_ai: ['conversational_ai'],
  ai_fallback_interpreter: ['conversational_ai', 'daily_record', 'daily_record_clarify'],
  search_risip_help: ['conversational_ai'],
  knowledge_reply: ['conversational_ai'],
};

const args = new Set(process.argv.slice(2));
const showFailed = args.has('--failed');

const cases = FILES.flatMap((file) =>
  extractCases(file, readFileSync(resolve(process.cwd(), 'evals', file), 'utf8')));

let passed = 0;
const failures: { c: EvalCase; got: string }[] = [];
const unchecked: { c: EvalCase; why: string }[] = [];

for (const c of cases) {
  if (!c.say) { unchecked.push({ c, why: 'no say:' }); continue; }
  // A message that only makes sense after a previous turn, or that depends on
  // who is asking, is not something a stateless router can be judged on.
  if (c.hasHistory) { unchecked.push({ c, why: 'needs a prior turn' }); continue; }
  if (c.hasRole) { unchecked.push({ c, why: 'needs a role' }); continue; }
  if (c.expectTool === null) { unchecked.push({ c, why: 'expects no tool' }); continue; }
  const allowed = SATISFIES[c.expectTool];
  if (!allowed) { unchecked.push({ c, why: `${c.expectTool} not routable here` }); continue; }

  const got = route(c.say);
  // The identity match always counts. Without it the runner reported
  // "expected daily_profit_estimate, got daily_profit_estimate" as a failure,
  // because the map only listed the internal name and the route happens to
  // return the eval's own name for read tools.
  if (got === c.expectTool || allowed.includes(got)) passed += 1;
  else failures.push({ c, got });
}

const checked = passed + failures.length;
const pct = (n: number) => `${Math.round((n / cases.length) * 100)}%`;

console.log(`\n${cases.length} eval cases\n`);
console.log(`  checked    ${String(checked).padStart(3)}  (${pct(checked)})`);
console.log(`  passed     ${String(passed).padStart(3)}`);
console.log(`  FAILED     ${String(failures.length).padStart(3)}`);
console.log(`  unchecked  ${String(unchecked.length).padStart(3)}  (${pct(unchecked.length)})`);

const why = new Map<string, number>();
for (const item of unchecked) why.set(item.why, (why.get(item.why) ?? 0) + 1);
console.log('\nUnchecked, by reason:');
for (const [reason, count] of [...why].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${reason}`);
}

if (failures.length > 0) {
  console.log(`\nFailures (${failures.length}):`);
  const shown = showFailed ? failures : failures.slice(0, 15);
  for (const { c, got } of shown) {
    console.log(`  ${c.file}#${c.id}  expected ${c.expectTool}, got ${got}`);
    if (showFailed) console.log(`      "${c.say}"`);
  }
  if (!showFailed && failures.length > shown.length) {
    console.log(`  … and ${failures.length - shown.length} more (run with --failed)`);
  }
  process.exit(1);
}
console.log('\nEvery checked case passed.\n');
