// A whole price list in one message.
//
// The buying prices taught this the hard way and the selling prices had exactly
// the same hole: parseSellingPrice is anchored to a single line, so a pasted
// list of thirty-six would have matched nothing at all — silently — for the
// second time in this project.
//
// Two rules carried over from that lesson:
//   - one confirmation for the whole block, not one per line;
//   - a line that cannot be read is listed back, never dropped. A price that
//     vanishes quietly is worse than one refused loudly, because every quote and
//     every margin after it is built on a number nobody checked.

import type { Lang } from './whatsappIntent.ts';
import { type SellingPrice, parseSellingPrice } from './whatsappSellingPrice.ts';

export type SellingPriceBatch = {
  kind: 'selling_price_batch';
  prices: SellingPrice[];
  /** Lines that were trying to be prices but could not be read. */
  unreadable: string[];
};

const MAX_LINES = 120;

/** A line that means to state a selling price, whether or not it parses. */
function looksLikeSellingLine(line: string): boolean {
  return /(?:rejareja|reja\s*reja|retail|jumla|wholesale|\bbei\b)/i.test(line)
    && !/bei\s+ya\s+kununua|nigharimu|ninanunua/i.test(line);
}

/**
 * Reads a message holding several selling prices, or null when it is not that.
 *
 * Two readable prices minimum: a single price already has a path that shows the
 * previous price next to the new one, and that is the better answer for one
 * product.
 */
export function parseSellingPriceBatch(text: string | null | undefined): SellingPriceBatch | null {
  // MEASURED FAILURE: a till roll headed "Mauzo" whose lines ended in "rejareja"
  // or "jumla" was read as a PRICE LIST — "daftari rejareja — TSh 100" — when
  // 100 was a hundred notebooks sold. The header says what the block is, and
  // nothing below it can turn a sale into a price change.
  const first = String(text ?? '').split(/\r?\n/)[0] ?? '';
  if (/^\s*(?:mauzo|sales?)\s*(?:rejareja|reja\s*reja|retail|jumla|wholesale)?\s*:?\s*$/i.test(first)) {
    return null;
  }

  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);
  if (lines.length < 2) return null;

  const prices: SellingPrice[] = [];
  const unreadable: string[] = [];

  for (const line of lines) {
    const parsed = parseSellingPrice(line);
    if (parsed) {
      const key = parsed.product.toLowerCase();
      // The same product twice: the last one wins, as somebody correcting
      // themselves partway down a list would expect.
      const at = prices.findIndex((price) => price.product.toLowerCase() === key);
      if (at >= 0) prices[at] = parsed; else prices.push(parsed);
      continue;
    }
    if (looksLikeSellingLine(line)) unreadable.push(line);
  }

  if (prices.length < 2) return null;
  return { kind: 'selling_price_batch', prices, unreadable };
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

export function sellingPriceBatchConfirmation(
  batch: SellingPriceBatch,
  lang: Lang,
  ...warnings: string[]
): string {
  const rows = batch.prices.map((price, index) => {
    const trade = price.wholesale === null
      ? ''
      : price.minQty === null
        ? (lang === 'sw' ? ` · jumla ${money(price.wholesale)}` : ` · wholesale ${money(price.wholesale)}`)
        : (lang === 'sw'
          ? ` · jumla ${money(price.wholesale)} (kuanzia ${price.minQty})`
          : ` · wholesale ${money(price.wholesale)} (from ${price.minQty})`);
    return `${index + 1}. ${price.product} — ${money(price.retail)}${trade}`;
  }).join('\n');

  const problem = batch.unreadable.length === 0 ? '' : (lang === 'sw'
    ? `\n\n⚠️ Mistari ${batch.unreadable.length} sikuisoma, haitahifadhiwa:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n')
    : `\n\n⚠️ ${batch.unreadable.length} line(s) I could not read, and will not save:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n'));

  // The warnings go ABOVE the question, never after it. Sent underneath, they
  // arrive as an afterthought to a decision already asked for — the real message
  // read "save them all? YES / NO" and only then "by the way, one of these loses
  // money on every sale". You show somebody the problem, then you ask.
  const trouble = warnings.filter(Boolean).join('');

  return lang === 'sw'
    ? `Bei za kuuza — bidhaa ${batch.prices.length}:\n${rows}${problem}${trouble}\n\n`
      + 'Nitazitumia mtu akituma mauzo bila kutaja bei.\n\n'
      + 'Nihifadhi zote? NDIYO / HAPANA'
    : `Selling prices — ${batch.prices.length} products:\n${rows}${problem}${trouble}\n\n`
      + 'I will use these when a sale names no price.\n\n'
      + 'Save them all? YES / NO';
}

/**
 * The check that earns its keep: a price that loses money on every sale.
 *
 * A wholesale price above the retail one is caught by the parser, and an
 * unreadable line is listed back. Neither of those is the dangerous mistake. The
 * dangerous one is a retail price at or under what the shop pays — it reads
 * perfectly, saves perfectly, and quietly turns every future sale into a loss.
 *
 * Named, not blocked. A loss-leader is a real decision; only the shopkeeper
 * knows whether this was one.
 */
export function sellingPriceBatchCostWarnings(
  prices: SellingPrice[],
  costs: Map<string, number>,
  lang: Lang,
): string {
  const rows: string[] = [];
  for (const price of prices) {
    const cost = costs.get(price.product.toLowerCase());
    if (cost === undefined) continue;
    const lowest = price.wholesale ?? price.retail;
    if (lowest > cost) continue;
    rows.push(lang === 'sw'
      ? `• ${price.product}: unauza ${money(lowest)}, unanunua ${money(cost)}`
      : `• ${price.product}: selling ${money(lowest)}, buying ${money(cost)}`);
  }
  if (rows.length === 0) return '';
  return lang === 'sw'
    ? `\n\n⚠️ Bei hizi ziko chini ya bei ya kununua — kila mauzo ni hasara:\n${rows.join('\n')}\n`
      + 'Kama ni makusudi, sawa. Kama ni kosa, rekebisha kabla ya kuthibitisha.'
    : `\n\n⚠️ These are at or under what you pay — every sale is a loss:\n${rows.join('\n')}\n`
      + 'If that is deliberate, fine. If it is a slip, fix it before confirming.';
}

/**
 * Names the shop has never bought or sold under.
 *
 * Nearly always a typo in a long paste — "atlas" where the shelf says "atlasi".
 * A price saved against a name that does not exist is invisible: the product it
 * was meant for keeps quoting the old price, and nothing anywhere says why.
 *
 * Said, not refused. Pricing something before the first sale of it is perfectly
 * normal, and the shopkeeper can see at a glance which of the two this is.
 */
export function sellingPriceBatchUnknownProducts(
  unknown: string[],
  lang: Lang,
  /** name as typed → the catalogue name it is probably a misspelling of */
  suggestions: Map<string, string> = new Map(),
): string {
  if (unknown.length === 0) return '';
  // Naming the near match is the whole difference between "this is wrong" and
  // "here is the fix". The resolver already knows atlas means atlasi; saying so
  // costs nothing and still leaves the choice with the shopkeeper, because a
  // price is a write and a write is never guessed.
  const rows = unknown.map((name) => {
    const near = suggestions.get(name.toLowerCase());
    if (!near) return `• ${name}`;
    return lang === 'sw'
      ? `• ${name} — unamaanisha “${near}”?`
      : `• ${name} — did you mean “${near}”?`;
  }).join('\n');
  return lang === 'sw'
    ? `\n\n❓ Hizi bado hazijawahi kununuliwa wala kuuzwa hapa:\n${rows}\n`
      + 'Kama ni bidhaa mpya, sawa. Kama jina limekosewa, rekebisha — bei ikienda kwa jina lisilo sahihi haitatumika popote.'
    : `\n\n❓ These have never been bought or sold here:\n${rows}\n`
      + 'If they are new, fine. If a name is mistyped, fix it — a price under the wrong name is never used.';
}

export function sellingPriceBatchSaved(saved: number, businessName: string, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Nimehifadhi bei za bidhaa ${saved}${businessName ? ` kwa ${businessName}` : ''}.\n\n`
      + 'Jaribu: "nimeuza daftari 3" — nitatumia bei yako mwenyewe.'
    : `✅ Saved prices for ${saved} products${businessName ? ` for ${businessName}` : ''}.\n\n`
      + 'Try: "nimeuza daftari 3" — I will price it from your own list.';
}

export function sellingPriceBatchCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, sijahifadhi bei yoyote.' : 'Fine, nothing was saved.';
}
