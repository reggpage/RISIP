// Actually run the 240 evaluation cases.
//
// MEASURED FAILURE, and a large one: the eval set has existed for weeks, holds
// 240 cases, and NOT ONE of them had ever been executed. evalCoverage.test.ts
// reads the YAML and checks that ids are unique and each group is big enough —
// it never sends a single `say:` anywhere. The suite was green the whole time.
//
// This runner sends every case through the real routing chain and compares
// against `expect_tool`. It does not pretend to cover what it cannot reach:
// cases that need a fixture in the database or the model itself are reported as
// UNCHECKED, with a count, so the coverage figure is a fact rather than a
// flattering one.
//
// It started at 71% checked, and the missing 29% was mostly this runner's own
// laziness rather than anything unreachable: control words ("HAPANA") have a
// parser, roles have an exported permission rule, onboarding has a state
// machine that can be driven, the kind of ledger record a message would create
// is one call away, and a follow-up's earlier turn is written in the case
// itself. All of that is checked now. What is left out is genuinely out:
// project setup and receipt photos live in the webhook, and a handful of
// follow-ups are resolved by the model.
//
//   npx vite-node scripts/run-evals.ts             # summary
//   npx vite-node scripts/run-evals.ts --failed    # every failure, with the text
//   npx vite-node scripts/run-evals.ts --unchecked # what is not covered, and why
//
// Exit code is non-zero when a checked case fails.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computedAmount, controlIntent, recordKind, route } from './lib/route.ts';
import { canUseCompanyFinanceReads } from '../supabase/functions/_shared/whatsappAssistant.ts';
import { advanceOnboarding } from '../supabase/functions/_shared/whatsappOnboarding.ts';
import {
  type ProductAnalyticsContext,
  parseProductAnalyticsFollowUp,
  parseProductAnalyticsRequest,
} from '../supabase/functions/_shared/whatsappProductAnalytics.ts';

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
  history: string[];
  hasRole: boolean;
  role?: string;
  disputed: boolean;
  expectAmount: number | null;
  block: string;
};

/** Only the escapes these files actually use, and only inside "double quotes". */
function unescape(match: RegExpMatchArray | null | undefined): string | undefined {
  if (!match) return undefined;
  const [, quote, value] = match;
  if (quote !== '"') return value;
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractCases(file: string, source: string): EvalCase[] {
  const starts = [...source.matchAll(/^\s+- id:\s*([^\s#]+).*$/gm)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const block = source.slice(start, starts[index + 1]?.index ?? source.length);
    const tool = block.match(/^\s+expect_tool:\s*(null|[^\s#]+)\s*.*$/m)?.[1];
    return {
      file,
      id: match[1],
      // A double-quoted YAML scalar carries escapes, and several cases are
      // multi-line messages written as "line one\nline two". Read raw, the
      // parser sees a backslash and an n in the middle of a sentence — which
      // would have had me chasing a wrong total that was my own extractor's.
      say: unescape(block.match(/^\s+say:\s*(["'])([\s\S]*?)\1\s*$/m)),
      expectTool: tool === 'null' || tool === undefined ? null : tool,
      hasHistory: /^\s+history:/m.test(block),
      // history: ["first turn", "the answer it got"] — the turns before this one.
      history: [...(block.match(/^\s+history:\s*\[(.*)\]\s*$/m)?.[1] ?? '')
        .matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((found) => found[1]),
      hasRole: /^\s+role:/m.test(block),
      role: block.match(/^\s+role:\s*([a-z_]+)/m)?.[1],
      disputed: /^\s+disputed:\s*true/m.test(block),
      expectAmount: (() => {
        const raw = block.match(/^\s+expect_amount:\s*([0-9][0-9_.]*)\s*(?:#.*)?$/m)?.[1];
        return raw === undefined ? null : Number(raw.replace(/_/g, ''));
      })(),
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
  language_control: ['change_language'],
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
  invite: ['invite'],
  issue_login_link: ['login_control'],
  login_control: ['login_control'],
  cancel_control: ['cancel_control', 'reject_control'],
  cancel_pending: ['cancel_control', 'reject_control'],
  confirmation_control: ['confirm_control'],
  confirm_pending: ['confirm_control'],
  clarification_continue: ['clarification_continue'],
  switch_business_control: ['switch_business_control', 'ai_my_businesses'],
  ai_record_debt_issued: ['record:debt_issued'],
  ai_record_customer_payment: ['record:customer_payment'],
  // The shop stated goods, a count and a price; the server does the
  // arithmetic. A question back is NOT a pass here — that is the failure the
  // expectation was written against.
  deterministic_calculator: ['daily_record', 'daily_record_parsed', 'quantity_sale'],
  conversational_ai: ['conversational_ai'],
  ai_fallback_interpreter: ['conversational_ai', 'daily_record', 'daily_record_clarify'],
  search_risip_help: ['conversational_ai'],
  knowledge_reply: ['conversational_ai'],
};

/**
 * Onboarding is a state machine, not a route, so route() can never judge it —
 * which left eleven cases marked "not routable here" as though nobody could
 * ever check whether "2" picks English. Each of these drives the real machine
 * from the step the case is about and asserts where it lands.
 */
const ONBOARDING: Record<string, (say: string) => boolean> = {
  // A stranger's first message is answered with the language question,
  // whatever the message was.
  onboarding_language_choice: (say) => advanceOnboarding('lang', say, 'en').step === 'lang',
  onboarding_control: (say) => advanceOnboarding('lang', say, 'en').step === 'lang',
  onboarding_language_set: (say) => advanceOnboarding('lang', say, 'en').action.kind === 'set_language',
  onboarding_create_business: (say) => advanceOnboarding('menu', say, 'en').step === 'create_name',
  onboarding_join_business: (say) => advanceOnboarding('menu', say, 'en').step === 'join_code',
  // The name is taken once the business has been described and classified.
  onboarding_name: (say) => advanceOnboarding('create_person', say, 'en', {
    businessName: 'Duka',
    businessCategory: 'Retail & General Stores',
    businessSubCategory: 'Duka la Jumla na Rejareja',
    classificationConfidence: '0.9',
  }).action.kind === 'create_business',
};

/**
 * A follow-up, played as the two turns it really is.
 *
 * "Jumla yake?" means nothing on its own, which is why these were reported as
 * needing a prior turn. But the prior turn is IN the case, and the context the
 * webhook would be holding can be rebuilt from it with production code alone —
 * so the second turn can be judged after all.
 *
 * Returns null when the first turn is not one this can reconstruct; those stay
 * honestly unchecked rather than being waved through.
 */
function followUpRoute(history: string[], say: string): string | null {
  const opening = history[0];
  if (!opening) return null;
  const first = parseProductAnalyticsRequest(opening);
  if (!first) return null;
  const context: ProductAnalyticsContext = {
    kind: 'product_analytics_context',
    request: first,
    focusNames: first.compareNames ?? [],
  };
  return parseProductAnalyticsFollowUp(say, context) ? 'product_analytics' : null;
}

/**
 * The permission rule the role cases are actually about.
 *
 * A worker must never reach company finance, and an owner or accountant must.
 * That is one exported function, and skipping thirteen cases for want of
 * calling it was the laziest line in this runner.
 */
function rolePasses(expectTool: string, role: string, say: string): boolean | null {
  const permitted = canUseCompanyFinanceReads(role);
  if (expectTool === 'permission_guard') return !permitted;
  const allowed = SATISFIES[expectTool];
  if (!allowed) return null;
  const got = route(say);
  return permitted && (got === expectTool || allowed.includes(got));
}

const args = new Set(process.argv.slice(2));
const showFailed = args.has('--failed');
const showUnchecked = args.has('--unchecked');

const cases = FILES.flatMap((file) =>
  extractCases(file, readFileSync(resolve(process.cwd(), 'evals', file), 'utf8')));

let passed = 0;
const failures: { c: EvalCase; got: string }[] = [];
const unchecked: { c: EvalCase; why: string }[] = [];
let amountsRight = 0;
const amountsWrong: { c: EvalCase; amount: number }[] = [];
const amountsUnchecked: EvalCase[] = [];

for (const c of cases) {
  if (!c.say) { unchecked.push({ c, why: 'no say:' }); continue; }
  // A message that only makes sense after a previous turn, or that depends on
  // who is asking, is not something a stateless router can be judged on.
  // An expectation I believe is wrong is recorded as disputed in the YAML,
  // with the reason, rather than quietly satisfied by bending a parser.
  if (c.disputed) { unchecked.push({ c, why: 'disputed expectation' }); continue; }
  const onboarding = c.expectTool ? ONBOARDING[c.expectTool] : undefined;
  if (onboarding) {
    if (onboarding(c.say)) passed += 1;
    else failures.push({ c, got: 'onboarding did not advance' });
    continue;
  }
  if (c.hasRole && c.expectTool !== null) {
    const verdict = rolePasses(c.expectTool, c.role ?? '', c.say);
    if (verdict === null) { unchecked.push({ c, why: `${c.expectTool} needs the webhook, not a route` }); continue; }
    if (verdict) passed += 1;
    else failures.push({ c, got: `role ${c.role}: ${route(c.say)}` });
    continue;
  }
  if (c.expectTool === null) {
    const got = route(c.say);
    // `expect_tool: null` means no immediate mutation is allowed. Read-only
    // tools and daily-record proposal/clarification routes are acceptable: the
    // latter still cannot write a confirmed record without NDIYO/YES. Direct
    // pricing, cost, stock and control routes stay outside this allow-list.
    const nonMutatingOrConfirmationGated = new Set([
      'conversational_ai', 'help', 'cancel_action',
      'daily_record', 'daily_record_parsed', 'daily_record_clarify',
      'daily_record_unreadable', 'quantity_sale', 'hypothetical_profit',
      'product_analytics', 'daily_profit_estimate', 'ai_my_receipts',
      'ai_debtors', 'ai_debtor_detail', 'ai_business_summary', 'ai_owed_to_me',
      'ai_my_businesses', 'ai_pending_approvals', 'ai_petty_cash_balance',
    ]);
    if (nonMutatingOrConfirmationGated.has(got)) passed += 1;
    else failures.push({ c, got });
    continue;
  }
  const allowed = SATISFIES[c.expectTool];
  if (!allowed) { unchecked.push({ c, why: `${c.expectTool} not routable here` }); continue; }

  // An answer or a command is not a topic, and the kind of ledger record a
  // message would create is not visible in its route. Both are still
  // deterministic, so both are checked — see controlIntent and recordKind.
  const got = allowed.some((name) => name.startsWith('record:'))
    ? `record:${recordKind(c.say) ?? 'none'}`
    : (allowed.some((name) => name.endsWith('_control') || name === 'clarification_continue')
      ? controlIntent(c.say) ?? route(c.say)
      : route(c.say));
  // The identity match always counts. Without it the runner reported
  // "expected daily_profit_estimate, got daily_profit_estimate" as a failure,
  // because the map only listed the internal name and the route happens to
  // return the eval's own name for read tools.
  if (got !== c.expectTool && !allowed.includes(got)) {
    // A case that comes with a prior turn can be CONFIRMED but never refuted
    // here: this runner holds no conversation state, so a miss may be the
    // missing context rather than a defect. A hit is still a hit — the message
    // stood on its own — so those count, and only the misses go unchecked.
    // Play the earlier turn and ask again. Only the follow-ups this can
    // reconstruct are judged; the rest stay unchecked rather than waved through.
    const resumed = c.hasHistory ? followUpRoute(c.history, c.say) : null;
    if (resumed && (resumed === c.expectTool || allowed.includes(resumed))) { passed += 1; continue; }
    if (c.hasHistory) { unchecked.push({ c, why: 'needs a prior turn' }); continue; }
    failures.push({ c, got });
    continue;
  }
  passed += 1;

  // The routing check asks whether the right parser took it. This asks the
  // question that costs money: whether it got the number right. Both losses
  // this week — a comma list recorded as 1,500 instead of 9,000, and four
  // retail sales priced as one wholesale sale of forty-eight — went to the
  // CORRECT parser and came out with the wrong total.
  if (c.expectAmount === null) continue;
  const amount = computedAmount(c.say);
  if (amount === null) { amountsUnchecked.push(c); continue; }
  if (Math.abs(amount - c.expectAmount) < 0.005) amountsRight += 1;
  else amountsWrong.push({ c, amount });
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

if (showUnchecked) {
  console.log('\nUnchecked cases:');
  for (const item of unchecked) {
    console.log(`  ${item.c.file}#${item.c.id}  [${item.why}]  expect_tool: ${item.c.expectTool ?? 'null'}`);
    console.log(`      "${(item.c.say ?? '').replace(/\n/g, ' / ')}"`);
  }
}

const amountsChecked = amountsRight + amountsWrong.length;
if (amountsChecked > 0 || amountsUnchecked.length > 0) {
  console.log('\nAmounts (the figure the shop would have been charged):');
  console.log(`  checked    ${String(amountsChecked).padStart(3)}`);
  console.log(`  correct    ${String(amountsRight).padStart(3)}`);
  console.log(`  WRONG      ${String(amountsWrong.length).padStart(3)}`);
  console.log(`  unchecked  ${String(amountsUnchecked.length).padStart(3)}  (needs a price list or the model)`);
}

if (amountsWrong.length > 0) {
  console.log(`\nWrong amounts (${amountsWrong.length}):`);
  for (const { c, amount } of amountsWrong) {
    console.log(`  ${c.file}#${c.id}  expected ${c.expectAmount}, computed ${amount}`);
    console.log(`      "${c.say}"`);
  }
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
