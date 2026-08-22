// "Nimeuza nguvu ya sala 8, marker 7 na anton wa padua 6."
//
// MEASURED FAILURE. The owner sent exactly that and was asked to supply a price
// for all three — one of which, nguvu ya sala, they had set a retail AND a
// wholesale price for six minutes earlier. Asking a shopkeeper to retype a price
// they already gave you is the fastest way to make them stop using the thing.
//
// So: a sale that states quantities and no money is priced from the shop's own
// price list. Nothing here invents a number. A product with no saved price is
// named and asked about — only that one, not the whole list.
//
// The wholesale rule is the owner's own: "kwa jumla kwanzia pcs 5 na kuendelea".
// If the quantity reaches the threshold the trade price applies, and the
// confirmation says which price was used for each line, because a sale priced
// behind someone's back is worse than a sale they had to type out.

import type { Lang } from './whatsappIntent.ts';
import { normalizeNumberWords } from './whatsappDailyRecords.ts';

export type QuantitySaleItem = {
  product: string;
  quantity: number;
  /** Present only after an exact declared portion has been resolved. */
  unit?: string | null;
  /**
   * Which of the shop's two prices this line was sold at.
   *
   * The owner's rule, in their words: "mtu asipoandika rejareja ujue hiyo ni
   * rejareja, akiandika jumla ujue ni jumla." Retail is the default because it
   * is what happens unless somebody decides otherwise, and a default that has to
   * be typed thirty times is not a default.
   */
  band: 'retail' | 'wholesale' | null;
};

/** "jumla" after a quantity names the trade price. "rejareja" names retail. */
const BAND = /\s+(rejareja|reja\s*reja|retail|jumla|wholesale)\s*$/i;

function readBand(text: string): { rest: string; band: 'retail' | 'wholesale' | null } {
  const match = BAND.exec(text);
  if (!match) return { rest: text, band: null };
  return {
    rest: text.slice(0, match.index),
    band: /jumla|wholesale/i.test(match[1]) ? 'wholesale' : 'retail',
  };
}
export type QuantitySale = {
  kind: 'quantity_sale';
  items: QuantitySaleItem[];
  /**
   * Money that went OUT, written at the foot of the same paste.
   *
   * The owner's real closing message ended:
   *
   *   Matumizi 15000
   *   Chakula 1200
   *   Nauli 9500
   *
   * and the whole forty-eight-line paste was refused because of those three.
   * Closing a day is one act — what came in and what went out — and splitting it
   * into two messages is a rule for the software's convenience, not the shop's.
   */
  expenses: ExpenseLine[];
};

export type ExpenseLine = { label: string; amount: number };

// A line with no selling verb that still ends in an amount. The verb is the
// discriminator, never the size of the number: "daftari 10" is ten notebooks
// and "Nauli 9500" is bus fare, and nothing about 10 versus 9500 says so.
const EXPENSE_LINE = /^([\p{L}][\p{L}\s'’.\-\/]{1,60}?)[\s:=-]+((?:tshs?|tzs|sh)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\/=)?$/iu;

/** A line that is only a heading: everything after it is money going out. */
const SPENDING_SECTION = /^(?:matumizi|gharama|expenses?|spending|matumizi ya leo)\s*:?\s*$/iu;

/**
 * Labels that are spending wherever they appear, header or no header.
 *
 * Deliberately a short list of things a shop pays for and never sells. A word
 * that could be either — "mafuta", "chakula" — is NOT here: under a sales
 * header those are goods, and guessing otherwise would delete a sale.
 */
const SPENDING_LABEL =
  /^(?:matumizi|gharama|nauli|usafiri|umeme|maji|kodi|pango|mshahara|posho|leseni|internet|bando|luku)\b/iu;

function readExpense(line: string): ExpenseLine | null {
  const match = EXPENSE_LINE.exec(clean(line));
  if (!match) return null;
  const label = clean(match[1]).replace(/[:=-]+$/, '').trim();
  const amount = Number(match[2].replace(/[^0-9.]/g, ''));
  if (label.length < 2 || !/[\p{L}]/u.test(label)) return null;
  // Below this it is far more likely to be a stray quantity than an expense.
  if (!Number.isFinite(amount) || amount < 100 || amount > 100_000_000) return null;
  return { label, amount };
}

export type PricedLine = {
  product: string;
  quantity: number;
  unitPrice: number;
  band: 'retail' | 'wholesale';
  unit?: string | null;
  /** Immutable stock conversion declared by the trader. */
  baseQuantity?: number;
};

export type ProductPricing = {
  retail: number | null;
  wholesale: number | null;
  wholesaleMinQty: number | null;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The dash a person puts between a product and its number.
 *
 * MEASURED FAILURE: "daftari — 100" broke the parser outright, and "daftari -
 * 100" left the dash stuck to the name, giving a product called "daftari -"
 * that matches nothing in the catalogue. WhatsApp turns a typed hyphen into an
 * em dash on its own, so this is not an unusual way to write a list — it is
 * what a phone produces.
 *
 * Only a dash that sits in front of a NUMBER is removed. "T-shirt" and
 * "chips-mayai" keep theirs, because there the dash is part of the name.
 */
function dashToSpace(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s*[-–—−]\s*(?=[0-9])/gu, ' ');
}

const OPENER = /^(?:leo\s+|today\s+)?(?:nimeuza|niliuza|nimuza|uza|mauzo|(?:i\s+)?sold)\b/iu;

/**
 * "Mauzo" standing alone at the top of a block, saying what the block is.
 *
 * MEASURED FAILURE: this used to accept "Mauzo" or "Mauzo rejareja" and nothing
 * else, so "Mauzo ya leo" — the most natural way anybody heads a day's takings —
 * was not a header at all. The block fell through, the price-list parser claimed
 * it, and a hundred notebooks SOLD were read as setting daftari's price to 100.
 *
 * Exported because the price-list parser has to recognise the same header in
 * order to decline. One definition, so the two can never disagree.
 */
export const SALE_HEADER =
  /^\s*(?:mauzo|sales?|nimeuza|niliuza|nimuza|tumeuza|sold)\b[\s,]*(?:ya\s+|za\s+|of\s+)?(?:leo|jana|juzi|siku(?:\s+hii)?|today|yesterday)?[\s,]*(rejareja|reja\s*reja|retail|jumla|wholesale)?\s*:?\s*$/i;

// Anything that states money makes this somebody else's message: the ordinary
// sale parser and the comma-list parser both handle stated prices, and they
// must keep handling them.
const STATES_MONEY = /\b(?:kwa|for|kila\s+moja|each|@|jumla|total|bei)\b\s*[0-9]|\b(?:tsh|tzs|shilingi)\b|[0-9]\s*\/=/iu;

/**
 * Reads "<product> <qty>" pairs out of a sale that names no money at all.
 *
 * Returns null the moment anything looks like a price, so this can never take a
 * message away from a parser that knows what the sale was actually worth.
 */
export function parseQuantityOnlySale(text: string | null | undefined): QuantitySale | null {
  // MEASURED FAILURE, again: this refused every multi-line message, and the
  // owner's real till roll was THIRTY lines of "nimeuza daftari 10". A counter
  // closing a day writes one product per line — that is not an edge case, it is
  // the main case. Each line has to be its own sale line, so a stray sentence in
  // the middle still hands the whole message to somebody else.
  let lines = String(text ?? '').split(/\r?\n/).map((line) => clean(dashToSpace(line))).filter(Boolean);

  // "mauzo" on a line of its own, then the goods underneath. The owner's idea,
  // and a good one: one word at the top tells Risip what the whole block is,
  // instead of every line having to repeat "nimeuza".
  //
  // MEASURED FAILURE: the header had to be the word ALONE, so "Mauzo rejareja"
  // — the owner saying which price the whole block went at — was not a header at
  // all, and the entire list fell through to a parser that asked whether 100 was
  // a price. The band is read off the header and handed to every line.
  const header = SALE_HEADER
    .exec(lines[0] ?? '');
  // Kept as typed, alongside the prefixed copy. Under a header every line is
  // rewritten as "nimeuza <line>", which is what makes "daftari 10" a sale —
  // and it is also what turned the day's spending into a phantom product
  // called "matumizi" that the shop was then invited to register.
  let raw = lines;
  if (lines.length > 1 && header) {
    const band = header[1] ? ` ${header[1]}` : '';
    raw = lines.slice(1);
    lines = raw.map((line) => (OPENER.test(line) ? line : `nimeuza ${line}${band}`));
  }

  if (lines.length > 1) {
    const items: QuantitySaleItem[] = [];
    const expenses: ExpenseLine[] = [];
    // "Matumizi:" on a line of its own used to kill the whole parse — it is
    // neither a sale nor a readable expense — and everything under it went with
    // it. It is a heading: what follows is money out.
    let spending = false;
    for (const [at, line] of lines.entries()) {
      const typed = raw[at] ?? line;
      if (SPENDING_SECTION.test(typed)) { spending = true; continue; }
      if (spending || SPENDING_LABEL.test(typed)) {
        const spent = readExpense(typed);
        if (spent) { expenses.push(spent); continue; }
      }
      const one = parseQuantityOnlySale(line);
      if (!one) {
        // Not a sale line. It may still be the day's spending, written at the
        // foot of the same paste, which is how a counter actually closes.
        const spent = readExpense(line);
        if (spent) { expenses.push(spent); continue; }
        return null;
      }
      // MEASURED FAILURE: these used to be added together right here, and the
      // COMBINED quantity was then compared against the wholesale threshold.
      // Four separate retail sales of daftari — 10, 20, 10 and 8 — became one
      // sale of 48, sailed past the 12-piece threshold, and all forty-eight were
      // priced as a trade sale. Nobody asked for that and nobody would notice
      // it: the confirmation just says "(jumla)" as though it knew something.
      //
      // Each line is its own transaction at the counter and must be banded on
      // its OWN quantity. Merging happens after pricing, and only across lines
      // that ended up at the same price.
      items.push(...one.items);
    }
    // Expenses alone are not this parser's business — the expense parser reads
    // them, and it knows how to ask about a label it does not recognise.
    return items.length > 0 ? { kind: 'quantity_sale', items, expenses } : null;
  }

  const said = clean(dashToSpace(text));
  if (!said || !OPENER.test(said)) return null;
  if (STATES_MONEY.test(said)) return null;

  const withoutOpener = said.replace(OPENER, '').replace(/^[\s:,-]+/, '').trim();
  // "nimeuza daftari 20 jumla" — the band is stated once, at the end, and
  // applies to the whole line. Read and removed before the products are, or it
  // would be swallowed into the last product's name.
  const { rest: payload, band: statedBand } = readBand(withoutOpener);
  if (!payload) return null;

  const items: QuantitySaleItem[] = [];
  // A name runs until the number that follows it. Names here are routinely three
  // words long — "nguvu ya sala", "st rita wa kashia" — so the separator cannot
  // be a space; it has to be the digits.
  // Digits are allowed INSIDE a name, just never at the start of one. "karatasi
  // A4 rimu" is a real product on this shelf, and excluding digits made that one
  // line unreadable — which, in an all-or-nothing paste, silently refused the
  // other forty-four. The quantity is still unambiguous because it has to be the
  // last number before a separator or the end of the line.
  const pattern = /([\p{L}][\p{L}0-9\s'’.-]*?)\s+([0-9]+(?:\.[0-9]+)?)(?=\s*(?:,|;|\bna\b|\band\b|$))/giu;
  for (const match of payload.matchAll(pattern)) {
    const product = clean(match[1])
      .replace(/^(?:na|and|,|;)\s+/i, '')
      .replace(/[.,;]+$/, '')
      .trim();
    const quantity = Number(match[2]);
    if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return null;
    items.push({ product, quantity, band: statedBand });
  }
  if (items.length === 0) return null;

  // Every word of the message has to be accounted for. If something was left
  // over, the message said more than a list of goods and this parser is the
  // wrong one to be reading it.
  const consumed = items.reduce((sum, item) => sum + item.product.length + String(item.quantity).length, 0);
  const letters = payload.replace(/[^\p{L}0-9]/gu, '').length;
  if (consumed < letters * 0.8) return null;

  return { kind: 'quantity_sale', items, expenses: [] };
}

/**
 * A list of products and quantities with no verb, for example:
 *   "kitabu cha hesabu 7, biblia 3, nguvu ya sala 20"
 *
 * This is deliberately only a clarification candidate. The same shape could be
 * a sale or a stock count/purchase, so callers must park it and ask rather than
 * write anything. Two lines are required to avoid stealing ordinary short chat.
 */
/**
 * The chatter a person adds after the figure.
 *
 * "mihogo 18 leo", "zege 3 tu, leo mambo hovyo" — the number is the message and
 * the rest is how somebody talks. The bare-list parser needs the quantity at the
 * end of the phrase, so three of six misses in the street corpus were nothing
 * but a trailing word. Only stripped from the END, and only these words: cutting
 * anywhere else would eat a product name.
 */
const TRAILING_CHATTER =
  /(?:[,\s]+(?:leo|jana|juzi|asubuhi|mchana|jioni|usiku|tu|basi|kabisa|sasa|hivi|hapa|today|now|only))+\s*$/iu;

/** "leo mambo hovyo", "biashara ngumu" — a whole clause of mood, not data. */
const TRAILING_MOOD =
  /[,;]\s*(?:leo\s+)?(?:mambo|biashara|soko|mauzo)\s+(?:hovyo|ngumu|mazuri|mabaya|poa|safi)\b.*$/iu;

export function stripTrailingChatter(text: string | null | undefined): string {
  let said = String(text ?? '').trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const before = said;
    said = said.replace(TRAILING_MOOD, '').replace(TRAILING_CHATTER, '').trim();
    if (said === before) break;
  }
  return said.replace(/[,;]\s*$/, '').trim();
}

export function parseBareQuantityList(text: string | null | undefined): QuantitySale | null {
  // Keep line breaks until the quantity parser sees them. Flattening here made
  // “birika 100 / daftari 400 / dumu 100” one product whose name contained the
  // first two quantities. The flattened copy is only for classification tests.
  const preserved = stripTrailingChatter(dashToSpace(text));
  const said = clean(preserved);
  if (!said || OPENER.test(said) || STATES_MONEY.test(said)) return null;
  // Do not ban a word wherever it appears: "kitabu cha hesabu" is a real
  // product. Only an unmistakable opener makes this a stock/purchase message.
  if (/^(?:hesabu\s+ya\s+stock|stock\b|store\b|nina\b|ninazo\b|nilizonazo\b|zilizopo\b|nimehesabu\b|nimenunua\b|nilinunua\b|purchase\b|bought\b)/iu.test(said)
    || /\bzimebaki\b/iu.test(said)) return null;
  // A command is not a sale. "approve receipt 123" was read as selling 123 of
  // something called "approve receipt" — found by the eval set the moment a
  // single item became enough. An instruction opens with a verb aimed at Risip,
  // and none of those verbs ever start a sale.
  if (/^(?:approve|confirm|thibitisha|reject|kataa|delete|futa|void|ghairi|reverse|rudisha|cancel|sitisha|rename|badilisha|show|onyesha|nipe|list|orodha|tuma|send|login|logout|toka|help|msaada|open|fungua)\b/iu.test(said)) {
    return null;
  }
  // A price list is not a sale. "bei ya daftari rejareja 1500" has no money
  // keyword directly before a digit, so STATES_MONEY lets it through — and with
  // no verb to stop it, it was read as selling 1500 of something.
  if (/^bei/iu.test(said) || /(?:rejareja|rejas*reja|retail|jumla|wholesale)[s:]*[0-9]/iu.test(said)) {
    return null;
  }
  // A bare line carries no verb, so the number has to carry the doubt. "Nauli
  // 9500" is bus fare; nobody hands 9,500 pieces of anything across a counter.
  // With a verb in front the ordinary parser handles the big numbers.
  if (/(?:^|\s)[0-9][0-9,.]*\s*$/u.test(said)
    && Number(said.replace(/.*?([0-9][0-9,.]*)\s*$/u, '$1').replace(/[,\s]/g, '')) >= 1000) {
    return null;
  }
  // "mafuta dumu moja 78000" — the count is a word, not a digit. The daily
  // record parser has always known these; this one did not, so the number was
  // invisible and the whole line went to the model.
  const digits = normalizeNumberWords(preserved);
  const sale = parseQuantityOnlySale(digits.includes('\n') ? `mauzo\n${digits}` : `mauzo ${digits}`);
  // One product is enough. "Nguvu ya sala 21" was answered with a request for
  // a price the shop had already set, because a single item did not qualify —
  // and the owner's point stands: a sentence should not need a verb to be read.
  // The caller is what keeps this safe: it only acts when every name is already
  // in the catalogue.
  return sale && sale.items.length >= 1 && sale.expenses.length === 0 ? sale : null;
}

/**
 * Retail unless the line says otherwise, or the quantity reaches the threshold.
 *
 * What the line SAYS wins over what the quantity implies. Somebody who typed
 * "jumla" has told you which price they charged; the threshold is only a guess
 * at what they meant when they said nothing at all. And "rejareja" on a large
 * quantity is a real thing — a bulk buyer who is not a regular still pays retail.
 */
export function priceLine(item: QuantitySaleItem, pricing: ProductPricing): PricedLine | null {
  const wholesaleApplies = pricing.wholesale !== null && (
    item.band === 'wholesale'
    || (item.band === null
      && (pricing.wholesaleMinQty === null || item.quantity >= pricing.wholesaleMinQty)));
  const unitPrice = wholesaleApplies ? pricing.wholesale! : pricing.retail;
  if (unitPrice === null || !(unitPrice > 0)) return null;
  return {
    product: item.product,
    quantity: item.quantity,
    unitPrice,
    band: wholesaleApplies ? 'wholesale' : 'retail',
    ...(item.unit ? { unit: item.unit } : {}),
  };
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

/** Asked when some of the products have no price the shop ever set. */
export function quantitySaleMissingPrices(missing: string[], lang: Lang): string {
  const rows = missing.map((name) => `• ${name}`).join('\n');
  return lang === 'sw'
    ? `Nina bei za bidhaa nyingine, lakini hizi bado hazina bei ya kuuza:\n${rows}\n\n`
      + 'Nipe bei, mfano: "bei ya marker rejareja 2000". Kisha tuma mauzo tena.'
    : `I have prices for the rest, but these have no selling price yet:\n${rows}\n\n`
      + 'Send me one, e.g. "bei ya marker rejareja 2000", then send the sale again.';
}

export function quantitySaleConfirmation(
  lines: PricedLine[],
  lang: Lang,
  expenses: ExpenseLine[] = [],
  /** Named right above the question, because a line that vanishes is money. */
  notCounted: string[] = [],
): string {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  // Shown separately and never netted off. A day that took 480,000 and spent
  // 25,000 is not a day that took 455,000, and somebody handed one number cannot
  // tell which of the two went wrong.
  // A label that only repeats the heading is dropped. The owner wrote
  // "Matumizi 15000" and read back "Matumizi:" and then "• Matumizi: TSh
  // 15,000" — the word twice, saying nothing the second time.
  const generic = /^(?:matumizi|gharama|expenses?|spending|other|nyingine)$/i;
  const line = (item: ExpenseLine) => (generic.test(item.label)
    ? `  • ${money(item.amount)}`
    : `  • ${item.label}: ${money(item.amount)}`);
  const outgoings = expenses.length === 0 ? '' : (lang === 'sw'
    ? `\nMatumizi:\n${expenses.map(line).join('\n')}`
      + `\nJumla ya matumizi: *${money(spent)}*\n`
    : `\nExpenses:\n${expenses.map(line).join('\n')}`
      + `\nTotal spent: *${money(spent)}*\n`);
  // Directly above the question, never below it. One unrecognised name out of
  // thirty used to refuse the whole paste and ask for all forty-eight lines
  // again — nobody retypes that, they give up. The rest is worth recording, and
  // this line is what keeps the omission a decision rather than a disappearance.
  const skipped = notCounted.length === 0 ? '' : (lang === 'sw'
    ? `\n⚠️ Hizi sijazihesabu, sina bei yake ya kuuza:\n`
      + notCounted.map((name) => `  • ${name}`).join('\n')
      + '\nWeka bei yake kisha uziandike peke yake.\n'
    : `\n⚠️ Not counted, no selling price for these:\n`
      + notCounted.map((name) => `  • ${name}`).join('\n')
      + '\nSet a price, then record them on their own.\n');
  const rows = lines.map((line) => {
    const band = line.band === 'wholesale'
      ? (lang === 'sw' ? ' (jumla)' : ' (wholesale)')
      : '';
    const unit = line.unit ? ` (${line.unit})` : '';
    return `  • ${line.product}${unit}: ${qty(line.quantity)} × ${money(line.unitPrice)}${band} = ${money(line.quantity * line.unitPrice)}`;
  }).join('\n');

  return lang === 'sw'
    ? `Nimeelewa:\nAina: Mauzo\nBidhaa:\n${rows}\nJumla ya mauzo: *${money(total)}*\n${outgoings}${skipped}\n`
      + '_Bei ni zile ulizoziweka mwenyewe._\n\n'
      + 'Jibu *NDIYO* kuthibitisha, au *HAPANA* kughairi.'
    : `Understood:\nType: Sale\nItems:\n${rows}\nSales total: *${money(total)}*\n${outgoings}${skipped}\n`
      + '_Priced from the list you set yourself._\n\n'
      + 'Reply *YES* to confirm, or *NO* to cancel.';
}


/**
 * Buying, written the way a restock actually arrives.
 *
 * "mafuta dumu moja 78000", "nyanya tenga 1 15000 na vitunguu 8000",
 * "soda kreti 5 kwa 60000 kutoka bohari" — no verb anywhere, and every one of
 * them is money leaving the shop. Sales with no verb already worked; spending
 * with no verb did not exist, so all three went to the model.
 *
 * The signal is NOT the size of the number. A big number with no verb could be
 * anything, and guessing from it is how "Nauli 9500" once became a sale of nine
 * and a half thousand. The signal is the WHOLESALE UNIT — kreti, gunia, dumu,
 * tenga, mzigo — or a stated source. Those words appear when goods are bought
 * in bulk and almost never when they are sold one at a time.
 */
const WHOLESALE_UNIT =
  /\b(?:kreti|crate|gunia|magunia|dumu|madumu|tenga|matenga|mzigo|boksi|box|debe|madebe|ndoo|rimu|ream|treya|tray|pakiti|packet|katoni|carton|bando|mfuko|kartoni)\b/iu;

/** "kutoka bohari", "toka sokoni", "kwa wakala" — where the goods came from. */
const SOURCE_TAG =
  /\b(?:kutoka|toka|from)\s+\S+|\b(?:bohari|sokoni|soko kuu|wakala|wholesale|jumla ya mzigo)\b/iu;

export function parseBareExpense(text: string | null | undefined): ExpenseLine[] | null {
  const said = stripTrailingChatter(clean(dashToSpace(text)));
  if (!said) return null;
  // A verb means one of the ordinary parsers owns this message.
  if (OPENER.test(said) || /^(?:nime|nili|tume|tuli|ame|ali)/iu.test(said)) return null;
  if (!WHOLESALE_UNIT.test(said) && !SOURCE_TAG.test(said)) return null;

  // The source clause is context, never part of a label or an amount.
  const body = normalizeNumberWords(said).replace(SOURCE_TAG, ' ').replace(/\s+/g, ' ').trim();

  const lines: ExpenseLine[] = [];
  for (const part of body.split(/\s+(?:na|and)\s+|,\s*/i)) {
    const piece = part.trim();
    if (!piece) continue;
    // <label…> [kwa] <amount>, where the amount is the last number in the piece.
    const match = /^(.+?)[\s:=-]*(?:kwa|for)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\/=)?$/iu.exec(piece);
    if (!match) return null;
    const label = clean(match[1]).replace(/[:=-]+$/, '').trim();
    const amount = Number(match[2].replace(/,/g, ''));
    if (label.length < 2 || !/[\p{L}]/u.test(label)) return null;
    // Below a thousand it is far likelier to be a count than a restock.
    if (!Number.isFinite(amount) || amount < 1000 || amount > 100_000_000) return null;
    lines.push({ label, amount });
  }
  return lines.length > 0 ? lines : null;
}
