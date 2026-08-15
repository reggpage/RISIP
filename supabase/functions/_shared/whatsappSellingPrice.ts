// Retail and wholesale, said the way a trader says it.
//
// The owner's own description: "kitabu cha nguvu ya sala kinauzwa 10,000 bei
// yake ya rejareja lakini kwa mteja wa mara kwa mara anaweza uziwa 9,000 …
// au wanauziwa 9,000 kwa jumla kwanzia pcs 5 na kuendelea."
//
// So one message has to carry up to three numbers, in whatever order they come
// out, and the bulk threshold is optional — a regular customer gets the trade
// price on two items just as much as on twenty.
//
// A price list is not a movement of money, so this is deliberately kept apart
// from the sale parser. Nothing here records a shilling; it records what the
// shop intends to charge.

import type { Lang } from './whatsappIntent.ts';

export type SellingPrice = {
  product: string;
  retail: number;
  wholesale: number | null;
  /** Null means the trade price is by relationship, not by quantity. */
  minQty: number | null;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const NUMBER = '[0-9][0-9,. ]*';

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[,\s]/g, '');
  // "12.500" is twelve and a half thousand written with a dot; "12.50" is cents.
  const normalised = /\.\d{3}$/.test(digits) ? digits.replace('.', '') : digits;
  const value = Number(normalised);
  return Number.isFinite(value) && value > 0 && value < 100_000_000
    ? Math.round(value * 100) / 100
    : null;
}

const RETAIL = /(?:rejareja|reja\s*reja|retail|kawaida)/i;
const WHOLESALE = /(?:jumla|wholesale|bei\s+ya\s+mteja\s+wa\s+mara\s+kwa\s+mara|mteja\s+wa\s+mara\s+kwa\s+mara)/i;

/**
 * Reads a price list out of one message.
 *
 * Requires the word "bei" or an explicit retail/wholesale label somewhere, so an
 * ordinary sale — "nimeuza nguvu ya sala 5 kila moja 12000" — can never be
 * mistaken for a change to the shop's prices.
 */
export function parseSellingPrice(text: string | null | undefined): SellingPrice | null {
  const said = clean(text);
  if (!said) return null;
  // Anything that reports a movement is not a price list.
  if (/^(?:nimeuza|niliuza|uza|sold|nimenunua|nimelipa|nimetumia|amechukua|amelipa|nina|nimehesabu)\b/i.test(said)) {
    return null;
  }
  if (!/\bbei\b/i.test(said) && !RETAIL.test(said) && !WHOLESALE.test(said)) return null;
  // "bei ya kununua" is the buying cost and has its own parser.
  if (/bei\s+ya\s+kununua|nigharimu|ninanunua/i.test(said)) return null;

  const retailMatch = new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*(${NUMBER})`, 'i').exec(said)
    ?? new RegExp(`(${NUMBER})\\s*(?:ndio\\s*)?${RETAIL.source}`, 'i').exec(said);
  const wholesaleMatch = new RegExp(`${WHOLESALE.source}\\s*(?:ni|is|:)?\\s*(${NUMBER})`, 'i').exec(said)
    ?? new RegExp(`(${NUMBER})\\s*(?:ndio\\s*)?${WHOLESALE.source}`, 'i').exec(said);

  const retail = money(retailMatch?.[1]);
  const wholesale = money(wholesaleMatch?.[1]);
  if (retail === null) return null;

  // "kuanzia 5", "kuanzia pcs 5", "from 5", "5 au zaidi"
  const minMatch = /(?:kuanzia|kuanzia\s+pcs|from|starting(?:\s+at)?)\s*(?:pcs|vipande)?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(said)
    ?? /([0-9]+(?:\.[0-9]+)?)\s*(?:pcs|vipande)?\s*(?:au\s+zaidi|na\s+kuendelea|or\s+more|\+)/i.exec(said);
  const minQty = minMatch ? Number(minMatch[1]) : null;

  // The product is what is left once the prices and their labels are removed.
  let product = said
    .replace(/^bei\s+(?:za|ya)\s+/i, '')
    .replace(new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(new RegExp(`${WHOLESALE.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(/(?:kuanzia|from|starting(?:\s+at)?)\s*(?:pcs|vipande)?\s*[0-9]+(?:\.[0-9]+)?/gi, ' ')
    .replace(/[0-9]+(?:\.[0-9]+)?\s*(?:pcs|vipande)?\s*(?:au\s+zaidi|na\s+kuendelea|or\s+more)/gi, ' ')
    // Only the words that JOIN the sentence, and only where they join it. "ya"
    // is part of half the names in this shop — nguvu ya sala, rosali ya maria,
    // kalamu za rangi, kitabu cha hesabu — so stripping it everywhere turned
    // "nguvu ya sala" into "nguvu sala", which is a different product.
    .replace(/\b(?:bei|price)\b/gi, ' ')
    .replace(new RegExp(NUMBER, 'g'), ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Trimmed first: a trailing space was stopping the end-of-string anchor from
    // ever matching, so "bei ya biblia … kwa mteja wa mara kwa mara 18000" came
    // out as the product "biblia kwa".
    .replace(/^(?:ya|za|wa|kwa|of|for|ni|is)\s+/i, '')
    .replace(/\s+(?:na|and|ni|is|kwa|for)$/i, '')
    .trim();

  if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
  if (wholesale !== null && wholesale > retail) return null;
  if (minQty !== null && wholesale === null) return null;

  return { product, retail, wholesale, minQty: minQty && minQty > 0 ? minQty : null };
}

const shillings = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

export function sellingPriceConfirmation(price: SellingPrice, lang: Lang): string {
  const lines = [
    lang === 'sw' ? `Rejareja: ${shillings(price.retail)}` : `Retail: ${shillings(price.retail)}`,
  ];
  if (price.wholesale !== null) {
    const from = price.minQty !== null
      ? (lang === 'sw' ? ` (kuanzia ${price.minQty})` : ` (from ${price.minQty})`)
      : (lang === 'sw' ? ' (mteja wa mara kwa mara)' : ' (regular customers)');
    lines.push((lang === 'sw' ? 'Jumla: ' : 'Wholesale: ') + shillings(price.wholesale) + from);
  }
  return lang === 'sw'
    ? `${price.product}\n${lines.join('\n')}\n\nNihifadhi? NDIYO / HAPANA`
    : `${price.product}\n${lines.join('\n')}\n\nSave this? YES / NO`;
}

export function sellingPriceSaved(price: SellingPrice, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Bei za ${price.product} zimehifadhiwa.\n\nSasa nitakuambia mauzo yaliyoenda chini ya bei zako zote mbili.`
    : `✅ Prices for ${price.product} saved.\n\nI will now tell you when a sale goes under both of your prices.`;
}

/**
 * Said on the sale confirmation, before it is saved.
 *
 * Only "below" is worth interrupting for: it means the sale went out under every
 * price the shop set itself, which is either a decision somebody made or a
 * mistake somebody made, and only they know which. Wholesale is not a warning —
 * it is the shop working as intended, and saying so on every trade sale would
 * teach people to ignore the line.
 */
export function priceBandNotice(
  bands: { product: string; unitPrice: number; band: string }[],
  lang: Lang,
): string {
  const below = bands.filter((row) => row.band === 'below');
  if (below.length === 0) return '';
  const rows = below
    .map((row) => `• ${row.product} — ${shillings(row.unitPrice)}`)
    .join('\n');
  return lang === 'sw'
    ? `\n\n⚠️ Chini ya bei zako:\n${rows}\nKama ni punguzo la makusudi, sawa. Kama ni kosa, rekebisha kabla ya kuthibitisha.`
    : `\n\n⚠️ Under your own prices:\n${rows}\nIf that discount was deliberate, fine. If it was a slip, fix it before confirming.`;
}
