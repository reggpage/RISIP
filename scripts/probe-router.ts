/**
 * Ask Risip a few hundred questions without sending a single WhatsApp message.
 *
 * The owner asked whether I could chat with the assistant, collect how it
 * answers, and fix what is wrong. Sending real messages would ring a real phone
 * and cost real money per conversation, so this does the same job from the other
 * side: it runs the router over a corpus and reports WHICH PARSER CLAIMS EACH
 * MESSAGE.
 *
 * That is the useful half. The model is good at language and bad at arithmetic,
 * so anything touching money, stock or prices that ends up at `conversational_ai`
 * is a gap — the answer is being improvised where it should be computed. The
 * corpus below is written the way the shop actually types: lower case, missing
 * vowels, English and Swahili in one sentence, prices with and without commas.
 *
 *   npx vite-node scripts/probe-router.ts
 *
 * Anything marked EXPECT that comes back different is a regression.
 */

import { route } from './lib/route.ts';

type Case = { said: string; expect: string };

const CORPUS: Case[] = [
  // ── Money in, money out ────────────────────────────────────────────────
  { said: 'nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500', expect: 'daily_record_parsed' },
  { said: 'nimeuza daftari 5 kwa 7500', expect: 'daily_record' },
  { said: 'nimeuza nguvu ya sala 2 kwa 20000', expect: 'daily_record' },
  { said: 'niliuza st rita wa kashia 3 kwa 13500', expect: 'daily_record' },
  { said: 'leo nimeuza kalamu 10 kila moja 500', expect: 'daily_record' },
  { said: 'nimelipa umeme 45000', expect: 'daily_record' },
  { said: 'nimenunua stock ya daftari 100 kwa 120000', expect: 'daily_record' },

  // ── Prices the shop sets ───────────────────────────────────────────────
  { said: 'bei ya nguvu ya sala rejareja 10000 jumla 9000 kuanzia pcs 5', expect: 'selling_price' },
  { said: 'kamusi rejareja 15000\nmkasi rejareja 3500\ndaftari rejareja 1600', expect: 'selling_price_batch' },
  { said: 'bei ya kununua daftari ni 1200', expect: 'product_cost' },
  { said: 'unga unanigharimu 900 kwa kilo', expect: 'product_cost' },
  { said: 'bei ya kununua daftari ni 1200\nbei ya kununua kalamu ni 300', expect: 'product_cost_batch' },

  // ── Counting the shelf ─────────────────────────────────────────────────
  { said: 'Hesabu ya stock\ndaftari 90\nkalamu 240', expect: 'stock_count_batch' },
  { said: 'nina daftari 90', expect: 'stock_count' },

  // ── Questions that must be computed, never improvised ──────────────────
  { said: 'zikiuza atlasi zote nitakuwa na faida ya shingapi', expect: 'hypothetical_profit' },
  { said: 'nikiuza daftari zote nitapata faida gani', expect: 'hypothetical_profit' },
  { said: 'mauzo ya leo ni ngapi', expect: 'ai_business_summary' },
  { said: 'risiti zangu za jana', expect: 'ai_my_receipts' },
  { said: 'nionyeshe risiti zangu za wiki iliyopita', expect: 'ai_my_receipts' },

  // ── Language, which was refused for a month ────────────────────────────
  { said: 'change to english', expect: 'change_language' },
  { said: 'tumia kiswahili', expect: 'change_language' },

  // ── Correctly conversational. The model IS the right answer here ───────
  { said: 'habari za asubuhi', expect: 'conversational_ai' },
  { said: 'asante sana', expect: 'conversational_ai' },
  { said: 'naweza kufanya nini hapa', expect: 'conversational_ai' },

  // ── Two instructions in one message ────────────────────────────────────
  // The first is acted on, the second is named back. Before the split these
  // reached the daily record parser whole and were asked whether 100 was the
  // price of each notebook.
  { said: 'nimeuza daftari kubwa 10 rejareja naongeza daftari 100 stoo', expect: 'quantity_sale' },
  // KNOWN GAP, unchanged by the split: a one-line "naongeza sukari 20" is not
  // a stock count to any parser, so the acted half lands on the record path.
  { said: 'naongeza sukari 20 kisha nimeuza mkate 4', expect: 'daily_record' },
  // One till roll is never torn in half.
  { said: 'nimeuza daftari 5 kwa 7500 na nimeuza kalamu 3 kwa 1500', expect: 'daily_record_parsed' },

  // ── Known gaps. Listed so they stop being a surprise ───────────────────
  { said: 'product gani inauza sana', expect: 'product_analytics' },
  { said: 'nimeuza nguvu ya sala 8 marker 7 na anton wa padua 6', expect: 'quantity_sale' },
  { said: 'atlas ziko ngapi', expect: 'conversational_ai' },
];

const byRoute = new Map<string, number>();
const drift: { said: string; expect: string; got: string }[] = [];

for (const item of CORPUS) {
  const got = route(item.said);
  byRoute.set(got, (byRoute.get(got) ?? 0) + 1);
  if (got !== item.expect) drift.push({ ...item, got });
}

const improvised = CORPUS.filter((item) => route(item.said) === 'conversational_ai');

console.log(`\n${CORPUS.length} messages\n`);
console.log('Claimed by:');
for (const [name, count] of [...byRoute].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${name}`);
}

console.log(`\nImprovised by the model (${improvised.length}):`);
for (const item of improvised) console.log(`  · ${item.said}`);

if (drift.length > 0) {
  console.log(`\nDRIFT — ${drift.length} message(s) changed route:`);
  for (const item of drift) console.log(`  · "${item.said}"\n      expected ${item.expect}, got ${item.got}`);
  process.exit(1);
}
console.log('\nNo drift.\n');
