// Counting the whole shelf in one message.
//
// The same lesson the buying prices taught: a shop counts everything at once, on
// a Sunday evening, and asking for thirty-six separate messages is asking them
// not to bother. For a first count the bulk case IS the normal case.
//
// A count overwrites what Risip believed, so this is deliberately hard to
// trigger by accident: the message has to announce itself, and every line has to
// be a product and a number. Half a list is refused rather than half applied.

import { pendingEscapeHint, type Lang } from './whatsappIntent.ts';
import { PRICE_TALK } from './whatsappStock.ts';

export type StockCountItem = { product: string; quantity: number; unit: string | null };

export type StockCountBatch = {
  kind: 'stock_count_batch';
  counts: StockCountItem[];
  /** Lines inside a count message that could not be read. Named, never dropped. */
  unreadable: string[];
  /**
   * Products the shop has never registered.
   *
   * MEASURED, in the code rather than on a screen: wa_record_stock_counts
   * inserts whatever product_key it is handed, so counting a name nobody has
   * registered creates a shelf entry for something with no buying cost and no
   * selling price. It then appears in "what is on hand" as a quantity that
   * cannot be valued, cannot be sold, and that nobody remembers creating.
   *
   * Counted separately from `unreadable` because they are a different problem
   * with a different answer: an unreadable line is a typing accident, and a
   * name like this is a product the shop may genuinely want — it just has to
   * be registered first, with its two prices.
   */
  notRegistered?: string[];
};

const MAX_LINES = 120;
const UNITS = 'kilo|kilos|kg|gramu|lita|litre|liter|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni|pcs|vipande';

/**
 * The message must say it is a count. Without a header, a pasted list of
 * products and numbers is indistinguishable from a price list or a sales
 * summary, and guessing wrong would wipe a shelf.
 */
// "store" is jargon, and the owner said so. A shopkeeper adding goods says
// "naongeza bidhaa" — I am adding products — not "store". The old words stay
// because they are already in people's chat history and in the onboarding
// messages sent before today; the new ones are what gets taught from now on.
const HEADER = new RegExp(
  '^\\s*(?:'
  + 'naongeza(?:\\s+(?:bidhaa|stock|store|mzigo))?'
  + '|nimeongeza(?:\\s+(?:bidhaa|stock|store|mzigo))?'
  + '|ongeza\\s+(?:bidhaa|stock|store|mzigo)'
  + '|add\\s+(?:product|products|stock|items?)'
  // "bidhaa" is what the replies now call these, so it has to be a word the
  // counter answers to. "stock" stays accepted forever — it is what half the
  // traders already type, and the vocabulary a shop has learned is not ours to
  // withdraw.
  + '|hesabu(?:\\s+ya)?\\s+(?:stock|bidhaa)|(?:stock|bidhaa)\\s+(?:ya\\s+)?leo'
  + '|nilizonazo|ninazo|zilizopo|store|stock\\s*count|counted'
  + ')\\b', 'i');

// “Jaza birika ziwe 100” is an absolute shelf correction, not a purchase.
// The word “ziwe/iwe” is the safety anchor: “jaza birika 100” on its own can
// mean add 100 more, so it is deliberately left for clarification.
const SET_COUNT_HEADER = /^(?:jaza|weka|wekea|sahihisha)\b/iu;
const SET_COUNT_PREFIX = /^(?:jaza|weka|wekea|sahihisha)\s+/iu;

/**
 * The conjunction that joined this item to the one before it.
 *
 * MEASURED FAILURE, the owner's own thread: "…iwe 4000 na soda iwe 2000" was
 * recorded against a product called "na soda". The word is how the sentence
 * joins, not part of the name, and every catalogue it reached kept it forever.
 */
const JOINING_WORD = /^(?:na|and|pia|kisha|halafu|au|or|ya|za|wa)\s+/iu;

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "daftari 90", "sukari kilo 12.5", "mafuta 20 lita", "daftari - 90" */
export function parseStockCountLine(line: string): StockCountItem | null {
  const said = clean(line).replace(/^[-•*\d.)\s]+/, '').replace(/[.,;]+$/, '');
  if (!said) return null;
  // A line that reports a movement is not a count.
  if (/^(?:nimeuza|niliuza|nimenunua|nimelipa|amechukua|amelipa)\b/i.test(said)) return null;

  const absolute = new RegExp(
    `^(.+?)\\s+(?:ziwe|iwe|zibaki|ibaki)\\s+(?:(${UNITS})\\s+)?([0-9]+(?:\\.[0-9]+)?)\\s*(${UNITS})?$`,
    'i',
  ).exec(said.replace(SET_COUNT_PREFIX, ''));
  const match = absolute ?? new RegExp(
    `^(.+?)[\\s:=-]+(?:(${UNITS})\\s+)?([0-9]+(?:\\.[0-9]+)?)\\s*(${UNITS})?$`,
    'i',
  ).exec(said);
  if (!match) return null;

  const product = clean(match[1]).replace(/[:=-]+$/, '').trim();
  const quantity = Number(match[3]);
  const unit = (match[2] ?? match[4] ?? '').toLowerCase() || null;
  if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  // "vipande" and "pcs" mean "no special unit", which is the default anyway.
  return { product, quantity, unit: unit === 'pcs' || unit === 'vipande' ? null : unit };
}

/**
 * Every "<name> ziwe <number>" in a message, however it was laid out.
 *
 * MEASURED FAILURE: the owner sent "Jaza birika ziwe 100 / Daftari ziwe 400 /
 * Dumu la maji ziwe 100" and Risip asked whether it was a sale or a purchase.
 * The line-by-line reader above handles that shape perfectly — but only when
 * the line breaks survive, and this message arrived flat. Read as one product
 * it became a single item called "birika ziwe 100 Daftari ziwe 400 Dumu la
 * maji", a hundred of them.
 *
 * So the shelf-setting form is read out of the whole message rather than out of
 * its lines. "Ziwe" is the anchor and it is unambiguous: it is neither a sale
 * nor a purchase, it is "let them be".
 */
function setCounts(text: string): StockCountItem[] {
  const found: StockCountItem[] = [];
  const pattern = new RegExp(
    `([\\p{L}][\\p{L}'’]*(?:\\s+[\\p{L}][\\p{L}'’]*){0,3}?)`
    + `\\s+(?:ziwe|iwe|zibaki|ibaki)\\s+(?:(${UNITS})\\s+)?([0-9]+(?:\\.[0-9]+)?)`,
    'giu',
  );
  for (const match of String(text ?? '').matchAll(pattern)) {
    const product = clean(match[1]).replace(SET_COUNT_PREFIX, '').replace(JOINING_WORD, '').trim();
    const quantity = Number(match[3]);
    if (product.length < 2 || !Number.isFinite(quantity) || quantity < 0) continue;
    const unit = (match[2] ?? '').toLowerCase() || null;
    const at = found.findIndex((item) => item.product.toLowerCase() === product.toLowerCase());
    const item = { product, quantity, unit: unit === 'pcs' || unit === 'vipande' ? null : unit };
    if (at >= 0) found[at] = item; else found.push(item);
  }
  return found;
}

export function parseStockCountBatch(text: string | null | undefined): StockCountBatch | null {
  const raw = String(text ?? '').split(/\r?\n/);
  const first = raw[0] ?? '';
  // A sentence about money is never a sentence about how many are on the shelf.
  // The owner asked to raise two selling prices and it was written down as a
  // count of four thousand napkins. See PRICE_TALK in whatsappStock.ts.
  if (PRICE_TALK.test(String(text ?? ''))) return null;

  // The flat form, before anything that depends on line breaks.
  if (raw.length === 1 && /\b(?:ziwe|iwe|zibaki|ibaki)\b/iu.test(first)) {
    const counts = setCounts(first);
    if (counts.length >= 2) return { kind: 'stock_count_batch', counts, unreadable: [] };
  }

  const explicitSet = SET_COUNT_HEADER.test(first)
    && /\b(?:ziwe|iwe|zibaki|ibaki)\b/iu.test(first);
  if (!explicitSet && raw.length < 2) return null;
  if (!explicitSet && !HEADER.test(first)) return null;

  const counts: StockCountItem[] = [];
  const unreadable: string[] = [];
  const seen = new Set<string>();

  // A conventional batch has a heading on line one. An explicit correction
  // carries its first product on line one, so keep that line and every newline
  // after it; flattening would turn three products into one long name.
  const lines = explicitSet ? raw.slice(0, MAX_LINES) : raw.slice(1, MAX_LINES + 1);
  for (const line of lines) {
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

  return counts.length >= (explicitSet ? 1 : 2) ? { kind: 'stock_count_batch', counts, unreadable } : null;
}

const amount = (item: StockCountItem) =>
  `${item.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}${item.unit ? ` ${item.unit}` : ''}`;

export function stockCountBatchConfirmation(batch: StockCountBatch, lang: Lang): string {
  // The quantity is bold because it is the only thing on the line worth
  // checking. The owner counted the shelf; the product name he already knows,
  // the number is what he is here to verify.
  const rows = batch.counts
    .map((item, index) => `${index + 1}. ${item.product} — *${amount(item)}*`)
    .join('\n');
  const problem = batch.unreadable.length === 0 ? '' : (lang === 'sw'
    ? `\n\n⚠️ Mistari ${batch.unreadable.length} sikuisoma, haitahesabiwa:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n')
    : `\n\n⚠️ ${batch.unreadable.length} line(s) I could not read, and will not count:\n`
      + batch.unreadable.map((line) => `• ${line}`).join('\n'));

  // Named, and named as a different thing from an unreadable line. A shop that
  // is told "these were skipped" and not told WHY assumes Risip lost them.
  const fresh = batch.notRegistered ?? [];
  const unregistered = fresh.length === 0 ? '' : (lang === 'sw'
    ? `\n\nHizi hazijasajiliwa bado, kwa hiyo sitazihesabu:\n`
      + fresh.map((name) => `• *${name}*`).join('\n')
      + '\n_Zisajili kwanza na bei zake, kisha tutazihesabu._'
    : `\n\nThese are not registered yet, so I will not count them:\n`
      + fresh.map((name) => `• *${name}*`).join('\n')
      + '\n_Register them with their prices first, then we count them._');

  return lang === 'sw'
    ? `*Hesabu mpya ya idadi zilizopo sasa — bidhaa ${batch.counts.length}*:\n${rows}${problem}${unregistered}\n\n`
      + 'Hii itaweka idadi hizi kama zilizopo sasa kwenye stoo; si mauzo na si manunuzi mapya.\n\n'
      + `Nirekodi hesabu hii? *1* Ndiyo · *2* Hapana. ${pendingEscapeHint(lang)}`
    : `*Stock on hand — ${batch.counts.length} products*:\n${rows}${problem}${unregistered}\n\n`
      + 'This becomes the new anchor: from here I keep count as you sell and restock.\n\n'
      + `Save them all? *1* Yes · *2* No. ${pendingEscapeHint(lang)}`;
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
