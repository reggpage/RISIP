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

export type QuantitySaleItem = { product: string; quantity: number };
export type QuantitySale = { kind: 'quantity_sale'; items: QuantitySaleItem[] };

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
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
  if (lines.length > 1) {
    const items: QuantitySaleItem[] = [];
    for (const line of lines) {
      const one = parseQuantityOnlySale(line);
      if (!one) return null;
      for (const item of one.items) {
        const at = items.findIndex((seen) => seen.product.toLowerCase() === item.product.toLowerCase());
        // The same product on two lines is two sales at the counter, not a
        // correction of the first. They add up.
        if (at >= 0) items[at] = { ...items[at], quantity: items[at].quantity + item.quantity };
        else items.push(item);
      }
    }
    return items.length > 0 ? { kind: 'quantity_sale', items } : null;
  }

  const said = clean(text);
  if (!said || !OPENER.test(said)) return null;
  if (STATES_MONEY.test(said)) return null;

  const payload = said.replace(OPENER, '').replace(/^[\s:,-]+/, '').trim();
  if (!payload) return null;

  const items: QuantitySaleItem[] = [];
  // A name runs until the number that follows it. Names here are routinely three
  // words long — "nguvu ya sala", "st rita wa kashia" — so the separator cannot
  // be a space; it has to be the digits.
  const pattern = /([\p{L}][\p{L}\s'’.-]*?)\s+([0-9]+(?:\.[0-9]+)?)(?=\s*(?:,|;|\bna\b|\band\b|$))/giu;
  for (const match of payload.matchAll(pattern)) {
    const product = clean(match[1])
      .replace(/^(?:na|and|,|;)\s+/i, '')
      .replace(/[.,;]+$/, '')
      .trim();
    const quantity = Number(match[2]);
    if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return null;
    items.push({ product, quantity });
  }
  if (items.length === 0) return null;

  // Every word of the message has to be accounted for. If something was left
  // over, the message said more than a list of goods and this parser is the
  // wrong one to be reading it.
  const consumed = items.reduce((sum, item) => sum + item.product.length + String(item.quantity).length, 0);
  const letters = payload.replace(/[^\p{L}0-9]/gu, '').length;
  if (consumed < letters * 0.8) return null;

  return { kind: 'quantity_sale', items };
}

/** Retail unless the quantity reaches the shop's own wholesale threshold. */
export function priceLine(item: QuantitySaleItem, pricing: ProductPricing): PricedLine | null {
  const wholesaleApplies = pricing.wholesale !== null
    && (pricing.wholesaleMinQty === null || item.quantity >= pricing.wholesaleMinQty);
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

export function quantitySaleConfirmation(lines: PricedLine[], lang: Lang): string {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const rows = lines.map((line) => {
    const band = line.band === 'wholesale'
      ? (lang === 'sw' ? ' (jumla)' : ' (wholesale)')
      : '';
    return `  • ${line.product}: ${qty(line.quantity)} × ${money(line.unitPrice)}${band} = ${money(line.quantity * line.unitPrice)}`;
  }).join('\n');

  return lang === 'sw'
    ? `Nimeelewa:\nAina: Mauzo\nBidhaa:\n${rows}\nJumla: *${money(total)}*\n\n`
      + '_Bei ni zile ulizoziweka mwenyewe._\n\n'
      + 'Jibu *NDIYO* kuthibitisha, au *HAPANA* kughairi.'
    : `Understood:\nType: Sale\nItems:\n${rows}\nTotal: *${money(total)}*\n\n`
      + '_Priced from the list you set yourself._\n\n'
      + 'Reply *YES* to confirm, or *NO* to cancel.';
}
