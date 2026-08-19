/**
 * Run the street-Swahili corpus through the router.
 *
 * These are not test fixtures I invented to pass. They are how a chips seller,
 * a mama lishe and a duka la mang'aa actually type on WhatsApp — abbreviations,
 * typos, market units, and a tone nobody uses at school. Every serious defect in
 * Risip this year lived in the gap between that and what a programmer imagines.
 *
 *   npx vite-node scripts/probe-street.ts
 *
 * Anything about money or stock landing on conversational_ai is a gap: the model
 * is good at language and bad at arithmetic, and that answer is being improvised
 * where it should be computed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { route } from './lib/route.ts';

type Row = { trade: string; said: string; intent: string };

const rows: Row[] = readFileSync(resolve(process.cwd(), 'evals/street-swahili.md'), 'utf8')
  .split('\n')
  .filter((line) => /^\|\s*\d+\s*\|/.test(line))
  .map((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    return { trade: cells[2], said: cells[3].replace(/ ⏎ /g, '\n'), intent: cells[4] };
  });

/** Which routes honour which intent. Narrow on purpose. */
const HONOURS: Record<string, string[]> = {
  'Kurekodi Mauzo': [
    'daily_record', 'daily_record_parsed', 'daily_record_clarify',
    'quantity_sale', 'bare_quantity_sale',
  ],
  'Kurekodi Gharama': ['daily_record', 'daily_record_parsed', 'daily_record_clarify', 'bare_expense'],
  'Kuingiza Stoko': ['stock_count_batch', 'stock_count', 'daily_record'],
  'Kuuliza Stoko': ['ai_stock_on_hand', 'conversational_ai', 'product_analytics'],
  'Kuuliza Hesabu': [
    'ai_business_summary', 'ai_debtors', 'product_analytics',
    'daily_profit_estimate', 'hypothetical_profit', 'conversational_ai',
  ],
};

const byTrade = new Map<string, { ok: number; total: number }>();
const misses: { row: Row; got: string }[] = [];

for (const row of rows) {
  const got = route(row.said);
  const honoured = (HONOURS[row.intent] ?? []).includes(got);
  const tally = byTrade.get(row.trade) ?? { ok: 0, total: 0 };
  tally.total += 1;
  if (honoured) tally.ok += 1; else misses.push({ row, got });
  byTrade.set(row.trade, tally);
}

console.log(`\n${rows.length} street messages\n`);
for (const [trade, tally] of byTrade) {
  console.log(`  ${String(tally.ok).padStart(2)}/${tally.total}  ${trade}`);
}

// A write intent answered by the model is the one that costs money.
const money = misses.filter((item) => item.row.intent.startsWith('Kurekodi'));
console.log(`\n  ${misses.length} not honoured, ${money.length} of them about money:\n`);
for (const { row, got } of misses) {
  const flag = row.intent.startsWith('Kurekodi') ? '!!' : '  ';
  console.log(`  ${flag} ${row.said.replace(/\n/g, ' ⏎ ').padEnd(46)} ${row.intent.padEnd(18)} → ${got}`);
}
console.log('');
