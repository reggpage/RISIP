/**
 * Walk a new shopkeeper from nothing to a recorded sale, without WhatsApp.
 *
 * The owner asked whether Risip can be tested before a message is ever sent.
 * It can, for the half that matters most: which parser claims each message and
 * what it decides. That is where every money defect in this project has lived.
 *
 * What this DOES cover: routing, the reply a deterministic parser produces, and
 * the arithmetic. What it does NOT: the database, conversation state across
 * turns, and anything the model improvises. Those need the real webhook.
 *
 *   npx vite-node scripts/walkthrough.ts
 */

import { route, computedAmount } from './lib/route.ts';
import { advanceOnboarding, startOnboarding } from '../supabase/functions/_shared/whatsappOnboarding.ts';

type Step = { say: string; note: string };

const ONBOARDING: Step[] = [
  { say: 'hi', note: 'first contact — a stranger with no account' },
  { say: '1', note: 'chooses Kiswahili' },
  { say: '1', note: 'chooses "start a new business"' },
  { say: 'Duka la Asha', note: 'the business name' },
  { say: 'Asha Mkwawa', note: 'their own name' },
];

const SHOPKEEPING: Step[] = [
  { say: 'Kamusi @5000 nauza 10000', note: 'register a product, their own shorthand' },
  { say: 'Sukari @2500 nauza 3500 kwa kilo', note: 'a measured product' },
  { say: 'mauzo\nkamusi 2\nsukari 3', note: '"mauzo" header, then the goods' },
  { say: 'kamusi 2', note: 'a sale with no verb at all' },
  { say: 'nimeuza kamusi 2 kwa 20000', note: 'a sale that states its own money' },
  { say: 'store\nkamusi 40\nsukari 90', note: 'counting the shelf' },
  { say: 'nimeuza samaki 5', note: 'a product the shop has never carried' },
  { say: 'mauzo ya leo ni ngapi', note: 'a question, not a record' },
  { say: 'nani ananidai', note: 'a question that contains a debt verb' },
  { say: 'bidhaa gani inauza sana', note: 'a ranking question' },
  { say: 'faida ya mwisho ya kamusi ni ngapi', note: 'a profit question' },
  { say: 'nataka kumualika mtu', note: 'bringing somebody into the business' },
  { say: 'habari za asubuhi', note: 'ordinary conversation' },
];

console.log('\n═══ 1. Signing up ═══\n');
let state = startOnboarding();
console.log(`  Risip: ${state.reply.split('\n')[0]}…`);
let draft: Record<string, string> = {};
let step = 'lang';
for (const item of ONBOARDING) {
  const next = advanceOnboarding(step as never, item.say, 'sw', draft);
  console.log(`\n  you  : ${item.say}   (${item.note})`);
  console.log(`  Risip: ${next.reply.replace(/\n/g, '\n         ')}`);
  console.log(`  → step ${step} → ${next.step}, action ${next.action.kind}`);
  step = next.step;
  draft = next.draft ?? draft;
}

console.log('\n═══ 2. Running the shop ═══\n');
const rows: string[] = [];
for (const item of SHOPKEEPING) {
  const claimed = route(item.say);
  const amount = computedAmount(item.say);
  rows.push([
    item.say.replace(/\n/g, ' ⏎ ').padEnd(34),
    claimed.padEnd(22),
    amount === null ? '' : `TSh ${amount.toLocaleString('en-US')}`,
  ].join(' '));
  console.log(`  ${rows[rows.length - 1]}`);
  console.log(`  ${' '.repeat(34)} ${item.note}`);
}

const improvised = SHOPKEEPING.filter((item) => route(item.say) === 'conversational_ai');
console.log(`\n  ${SHOPKEEPING.length} messages, ${improvised.length} left to the model:`);
for (const item of improvised) console.log(`    · ${item.say}  — ${item.note}`);
console.log('');
