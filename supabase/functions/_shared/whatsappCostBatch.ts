// Many buying prices in one message.
//
// MEASURED FAILURE. A trader was given 36 prices to enter and told to send them
// one at a time. They pasted all 36 as a single WhatsApp message — which is what
// anybody would do — and NOT ONE was saved. parseProductCost is anchored ^...$,
// so a 36-line message matches nothing at all.
//
// "Send them one at a time" was never a real instruction. Seventy-two messages
// (36 prices, 36 confirmations) is not a thing a person does. Setting up a shop's
// prices is inherently a bulk job, so the bulk case has to work.
//
// One confirmation for the whole block, not one per line. Lines that cannot be
// read are listed back rather than silently dropped: a price that vanishes
// quietly is worse than one that is refused loudly, because every future profit
// figure is built on these numbers.

import type { Lang } from './whatsappIntent.ts';
import { type ProductCost, parseProductCost } from './whatsappProductCosts.ts';

export type ProductCostBatch = {
  kind: 'product_cost_batch';
  costs: ProductCost[];
  /** Lines that looked like they were meant to be prices but could not be read. */
  unreadable: string[];
};

const MAX_LINES = 60;

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

/** A line that is trying to be a buying price, whether or not it parses. */
function looksLikeCostLine(line: string): boolean {
  return /(?:bei\s+ya\s+kununua|nigharimu|ninanunua|nanunua|gharama|buying\s+price|cost\s+price|cost\s+of)/i.test(line);
}

/**
 * Reads a message holding several buying prices, or null when it is not that.
 *
 * Requires at least two readable prices: a single-line price is already handled
 * by the existing path, which asks for confirmation with the previous price
 * shown, and that is a better answer for one product.
 */
export function parseProductCostBatch(text: string | null | undefined): ProductCostBatch | null {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);
  if (lines.length < 2) return null;

  const costs: ProductCost[] = [];
  const unreadable: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseProductCost(line);
    if (parsed) {
      const key = parsed.product.toLowerCase();
      // The same product twice in one paste: the last one wins, because that is
      // how a person correcting themselves mid-list expects it to behave.
      if (seen.has(key)) {
        const index = costs.findIndex((cost) => cost.product.toLowerCase() === key);
        costs[index] = parsed;
      } else {
        seen.add(key);
        costs.push(parsed);
      }
      continue;
    }
    if (looksLikeCostLine(line)) unreadable.push(line);
  }

  if (costs.length < 2) return null;
  return { kind: 'product_cost_batch', costs, unreadable };
}

export function costBatchConfirmation(batch: ProductCostBatch, lang: Lang): string {
  const rows = batch.costs
    .map((cost, index) => `${index + 1}. ${cost.product} — ${money(cost.unitCost)}${cost.unit ? ` kwa ${cost.unit}` : ''}`)
    .join('\n');

  const problem = batch.unreadable.length === 0 ? '' : (lang === 'sw'
    ? `\n\n⚠️ Mistari ${batch.unreadable.length} sikuisoma, haitahifadhiwa:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n')
    : `\n\n⚠️ ${batch.unreadable.length} line(s) I could not read, and will not save:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n'));

  return lang === 'sw'
    ? `Bei za kununua ${batch.costs.length}:\n${rows}${problem}\n\n`
      + 'Hizi zitabadilisha makisio ya faida yanayofuata. Rekodi za nyuma hazitaguswa.\n\n'
      + 'Nihifadhi zote? NDIYO / HAPANA'
    : `${batch.costs.length} buying prices:\n${rows}${problem}\n\n`
      + 'These change the profit estimates that follow. Past records are untouched.\n\n'
      + 'Save them all? YES / NO';
}

export function costBatchSaved(saved: number, businessName: string, lang: Lang): string {
  const where = businessName ? ` kwa ${businessName}` : '';
  const whereEn = businessName ? ` for ${businessName}` : '';
  return lang === 'sw'
    ? `✅ Nimehifadhi bei ${saved} za kununua${where}.\n\n`
      + 'Sasa naweza kukadiria faida yako. Jaribu: "faida yangu ya wiki hii".'
    : `✅ Saved ${saved} buying prices${whereEn}.\n\n`
      + 'I can estimate your profit now. Try: "my profit this week".';
}

export function costBatchCancelled(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa, sijahifadhi bei yoyote.'
    : 'Fine, no prices were saved.';
}

export function costBatchFailed(lang: Lang): string {
  return lang === 'sw'
    ? 'Sikuweza kuhifadhi bei hizi. Hakuna bei iliyobadilishwa; tafadhali jaribu tena.'
    : 'I could not save these prices. Nothing was changed; please try again.';
}
