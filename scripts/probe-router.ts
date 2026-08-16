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

import { parseDailyRecordBatch } from '../supabase/functions/_shared/whatsappDailyRecordBatch.ts';
import { isDailyRecordCandidate } from '../supabase/functions/_shared/whatsappDailyRecords.ts';
import { parseHypotheticalProfitRequest } from '../supabase/functions/_shared/whatsappHypotheticalProfit.ts';
import { parseLanguageCommand } from '../supabase/functions/_shared/whatsappIntent.ts';
import { parseProductCost } from '../supabase/functions/_shared/whatsappProductCosts.ts';
import { parseProductCostBatch } from '../supabase/functions/_shared/whatsappCostBatch.ts';
import { parseReadRequest } from '../supabase/functions/_shared/whatsappReadTools.ts';
import { parseSellingPrice } from '../supabase/functions/_shared/whatsappSellingPrice.ts';
import { parseSellingPriceBatch } from '../supabase/functions/_shared/whatsappSellingPriceBatch.ts';
import { parseStockCount } from '../supabase/functions/_shared/whatsappStock.ts';
import { parseStockCountBatch } from '../supabase/functions/_shared/whatsappStockBatch.ts';

/** The webhook's own order of precedence, kept in one place so drift is visible. */
function route(text: string): string {
  if (parseLanguageCommand(text)) return 'change_language';
  if (parseSellingPriceBatch(text)) return 'selling_price_batch';
  if (parseStockCountBatch(text)) return 'stock_count_batch';
  if (parseProductCostBatch(text)) return 'product_cost_batch';
  if (parseSellingPrice(text)) return 'selling_price';
  if (parseProductCost(text)) return 'product_cost';
  if (parseStockCount(text)) return 'stock_count';
  if (parseHypotheticalProfitRequest(text)) return 'hypothetical_profit';
  if (isDailyRecordCandidate(text)) {
    const batch = parseDailyRecordBatch(text, 'sw');
    return batch.kind === 'none' ? 'daily_record' : `daily_record_${batch.kind}`;
  }
  if (parseReadRequest(text)) return 'read_tool';
  return 'conversational_ai';
}

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
  { said: 'mauzo ya leo ni ngapi', expect: 'read_tool' },
  { said: 'risiti zangu za jana', expect: 'read_tool' },
  { said: 'nionyeshe risiti zangu za wiki iliyopita', expect: 'read_tool' },

  // ── Language, which was refused for a month ────────────────────────────
  { said: 'change to english', expect: 'change_language' },
  { said: 'tumia kiswahili', expect: 'change_language' },

  // ── Correctly conversational. The model IS the right answer here ───────
  { said: 'habari za asubuhi', expect: 'conversational_ai' },
  { said: 'asante sana', expect: 'conversational_ai' },
  { said: 'naweza kufanya nini hapa', expect: 'conversational_ai' },

  // ── Known gaps. Listed so they stop being a surprise ───────────────────
  { said: 'product gani inauza sana', expect: 'conversational_ai' },
  { said: 'nimeuza nguvu ya sala 8 marker 7 na anton wa padua 6', expect: 'daily_record' },
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
