// Counting the whole shelf in one message.
//
// The same lesson the buying prices taught: a shop counts everything at once, on
// a Sunday evening, and asking for thirty-six separate messages is asking them
// not to bother. For a first count the bulk case IS the normal case.
//
// A count overwrites what Risip believed, so this is deliberately hard to
// trigger by accident: the message has to announce itself, and every line has to
// be a product and a number. Half a list is refused rather than half applied.

import type { Lang } from './whatsappIntent.ts';

export type StockCountItem = { product: string; quantity: number; unit: string | null };

export type StockCountBatch = {
  kind: 'stock_count_batch';
  counts: StockCountItem[];
  /** Lines inside a count message that could not be read. Named, never dropped. */
  unreadable: string[];
};

const MAX_LINES = 120;
const UNITS = 'kilo|kilos|kg|gramu|lita|litre|liter|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni|pcs|vipande';

/**
 * The message must say it is a count. Without a header, a pasted list of
 * products and numbers is indistinguishable from a price list or a sales
 * summary, and guessing wrong would wipe a shelf.
 */
const HEADER = /^\s*(?:hesabu(?:\s+ya)?\s+stock|stock\s+(?:ya\s+)?leo|nilizonazo|ninazo|zilizopo|store|stock\s*count|counted)\b/i;

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "daftari 90", "sukari kilo 12.5", "mafuta 20 lita", "daftari - 90" */
export function parseStockCountLine(line: string): StockCountItem | null {
  const said = clean(line).replace(/^[-•*\d.)\s]+/, '').replace(/[.,;]+$/, '');
  if (!said) return null;
  // A line that reports a movement is not a count.
  if (/^(?:nimeuza|niliuza|nimenunua|nimelipa|amechukua|amelipa)\b/i.test(said)) return null;

  const match = new RegExp(`^(.+?)[\\s:=-]+(?:(${UNITS})\\s+)?([0-9]+(?:\\.[0-9]+)?)\\s*(${UNITS})?$`, 'i')
    .exec(said);
  if (!match) return null;

  const product = clean(match[1]).replace(/[:=-]+$/, '').trim();
  const quantity = Number(match[3]);
  const unit = (match[2] ?? match[4] ?? '').toLowerCase() || null;
  if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  // "vipande" and "pcs" mean "no special unit", which is the default anyway.
  return { product, quantity, unit: unit === 'pcs' || unit === 'vipande' ? null : unit };
}

export function parseStockCountBatch(text: string | null | undefined): StockCountBatch | null {
  const raw = String(text ?? '').split(/\r?\n/);
  if (raw.length < 2) return null;
  if (!HEADER.test(raw[0] ?? '')) return null;

  const counts: StockCountItem[] = [];
  const unreadable: string[] = [];
  const seen = new Set<string>();

  for (const line of raw.slice(1, MAX_LINES + 1)) {
    const said = clean(line);
    if (!said) continue;
    const parsed = parseStockCountLine(said);
    if (!parsed) { unreadable.push(said); continue; }
    const key = parsed.product.toLowerCase();
    // The same product twice: the last one wins, as somebody correcting
    // themselves partway down a list would expect.
    const at = counts.findIndex((count) => count.product.toLowerCase() === key);
    if (at >= 0) counts[at] = parsed; else { seen.add(key); counts.push(parsed); }
  }

  return counts.length >= 2 ? { kind: 'stock_count_batch', counts, unreadable } : null;
}

const amount = (item: StockCountItem) =>
  `${item.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}${item.unit ? ` ${item.unit}` : ''}`;

export function stockCountBatchConfirmation(batch: StockCountBatch, lang: Lang): string {
  const rows = batch.counts
    .map((item, index) => `${index + 1}. ${item.product} — ${amount(item)}`)
    .join('\n');
  const problem = batch.unreadable.length === 0 ? '' : (lang === 'sw'
    ? `\n\n⚠️ Mistari ${batch.unreadable.length} sikuisoma, haitahesabiwa:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n')
    : `\n\n⚠️ ${batch.unreadable.length} line(s) I could not read, and will not count:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n'));

  return lang === 'sw'
    ? `Hesabu ya store — bidhaa ${batch.counts.length}:\n${rows}${problem}\n\n`
      + 'Hii itakuwa nanga mpya: kuanzia sasa nitafuatilia mwenyewe kadri unavyouza na kuingiza.\n\n'
      + 'Nihifadhi zote? NDIYO / HAPANA'
    : `Store count — ${batch.counts.length} products:\n${rows}${problem}\n\n`
      + 'This becomes the new anchor: from here I keep count as you sell and restock.\n\n'
      + 'Save them all? YES / NO';
}

export function stockCountBatchSaved(saved: number, businessName: string, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Nimehesabu bidhaa ${saved}${businessName ? ` kwa ${businessName}` : ''}.\n\n`
      + 'Jaribu: "Daftari ninazo ngapi?"'
    : `✅ Counted ${saved} products${businessName ? ` for ${businessName}` : ''}.\n\n`
      + 'Try: "how many Daftari do I have?"';
}

export function stockCountBatchCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, sijahesabu chochote.' : 'Fine, nothing was counted.';
}
