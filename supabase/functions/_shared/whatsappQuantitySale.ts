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

export type QuantitySaleItem = {
  product: string;
  quantity: number;
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
};

export type ProductPricing = {
  retail: number | null;
  wholesale: number | null;
  wholesaleMinQty: number | null;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

const OPENER = /^(?:leo\s+|today\s+)?(?:nimeuza|niliuza|nimuza|uza|mauzo|(?:i\s+)?sold)\b/iu;

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
  let lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);

  // "mauzo" on a line of its own, then the goods underneath. The owner's idea,
  // and a good one: one word at the top tells Risip what the whole block is,
  // instead of every line having to repeat "nimeuza". The header is spent here
  // by giving it to each line, so nothing below has to change.
  if (lines.length > 1 && /^(?:mauzo|sales?)\s*:?\s*$/i.test(lines[0])) {
    lines = lines.slice(1).map((line) => (OPENER.test(line) ? line : `nimeuza ${line}`));
  }

  if (lines.length > 1) {
    const items: QuantitySaleItem[] = [];
    const expenses: ExpenseLine[] = [];
    for (const line of lines) {
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

  const said = clean(text);
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
    return `  • ${line.product}: ${qty(line.quantity)} × ${money(line.unitPrice)}${band} = ${money(line.quantity * line.unitPrice)}`;
  }).join('\n');

  return lang === 'sw'
    ? `Nimeelewa:\nAina: Mauzo\nBidhaa:\n${rows}\nJumla ya mauzo: *${money(total)}*\n${outgoings}${skipped}\n`
      + '_Bei ni zile ulizoziweka mwenyewe._\n\n'
      + 'Jibu *NDIYO* kuthibitisha, au *HAPANA* kughairi.'
    : `Understood:\nType: Sale\nItems:\n${rows}\nSales total: *${money(total)}*\n${outgoings}${skipped}\n`
      + '_Priced from the list you set yourself._\n\n'
      + 'Reply *YES* to confirm, or *NO* to cancel.';
}
