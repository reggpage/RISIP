// "Daftari ni bei gani?" — asking Risip what the shop sells something for.
//
// MEASURED (scripts/interrogate.ts, seeds 1–5): every phrasing of this went to
// the model. Not misrouted — there was no tool at all. Risip would happily be
// TOLD a price, keep it, apply it to a sale, and warn when it changed, but it
// could not be ASKED one back. A shopkeeper with sixty products behind them
// cannot hold sixty retail and sixty wholesale figures in their head, and the
// one place those figures live is the table this reads.
//
// Deliberately kept apart from whatsappSellingPrice.ts, which SETS prices. The
// two are told apart by a single rule: a question carries no figure. "Bei ya
// marker rejareja 2000" sets; "bei ya marker ni ngapi" asks. Anything with a
// number in it is not read here, so this can never overwrite a price.

import type { Lang } from './whatsappIntent.ts';
import { correctControlWords } from './whatsappSpelling.ts';

export type SellingPriceQuestion = { product: string };

export type SellingPriceAnswer = {
  productName: string;
  retail: number | null;
  wholesale: number | null;
  wholesaleMinQty: number | null;
  /** The buying cost, when the shop has told Risip one. Owner/accountant only. */
  unitCost: number | null;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** The place, not the goods: "…bei gani dukani". */
const PLACE = /\s*(?:kwenye\s+|kwa\s+|katika\s+)?(?:stor(?:e|ini|eni)|stoo?(?:ni)?|ghala(?:ni)?|duka(?:ni)?|shopu?|hapa)\s*$/i;

/**
 * Questions that are about money in general, not about one product's price.
 *
 * "faida ya leo ni ngapi" and "mauzo ni ngapi" belong to the ledger tools, and
 * a parser that claimed them would answer a day's takings with a price list.
 */
const NOT_A_PRODUCT = /^(?:faida|hasara|mauzo|manunuzi|matumizi|madeni|deni|jumla|pesa|fedha|mapato|gharama|profit|sales|expenses?|debts?)$/i;

const PATTERNS: RegExp[] = [
  // <product> ni bei gani / <product> bei gani
  /^(.+?)\s+(?:ni\s+)?bei\s+gani$/iu,
  // bei ya <product> ni ngapi / bei ya <product> ni kiasi gani / bei ya <product>
  /^bei\s+(?:ya|za|ni\s+ya)\s+(.+?)(?:\s+(?:ni|iko|ipo)?\s*(?:ngapi|kiasi\s+gani|gani))?$/iu,
  // nauza <product> ngapi / ninauza <product> kwa ngapi
  /^(?:na|nina|tuna|ni)uza\s+(.+?)\s+(?:kwa\s+)?(?:ngapi|bei\s+gani|kiasi\s+gani)$/iu,
  // how much do i sell <product> for
  /^how\s+much\s+(?:do\s+i\s+sell|is)\s+(.+?)(?:\s+for)?$/iu,
  // <product> selling price
  /^(.+?)\s+(?:selling\s+price|retail\s+price)$/iu,
];

/**
 * The product whose selling price is being asked about, or null.
 *
 * A figure anywhere in the message disqualifies it: that is somebody SETTING a
 * price, and this must never stand in front of that.
 */
export function parseSellingPriceQuestion(text: string | null | undefined): SellingPriceQuestion | null {
  const said = clean(correctControlWords(text)).replace(/\?+\s*$/, '').replace(PLACE, '').trim();
  if (!said || said.length > 120) return null;
  // A figure standing on its own is somebody SETTING a price, and this must
  // never stand in front of that. A digit stuck to letters is part of a name —
  // "karatasi a4" is a real product, and rejecting every message with a digit
  // in it meant the shop could not ask what its own paper sold for.
  if (/(?:^|\s)[0-9][0-9.,]*(?:\s|$)/.test(said)) return null;
  // "bei ya daftari rejareja" is half of a price being set, not a question.
  if (/\b(?:rejareja|reja\s*reja|jumla|wholesale|retail)\b/i.test(said) && !/\b(?:ngapi|gani)\b/i.test(said)) {
    return null;
  }

  for (const pattern of PATTERNS) {
    const match = pattern.exec(said);
    if (!match) continue;
    const product = clean(match[1])
      .replace(/^(?:ya|za|wa|of|the)\s+/i, '')
      .replace(/\s+(?:ni|iko|ipo)$/i, '')
      .replace(/[:,.]+$/, '')
      .trim();
    if (product.length < 2 || product.length > 80) continue;
    if (!/[\p{L}]/u.test(product)) continue;
    if (NOT_A_PRODUCT.test(product)) continue;
    return { product };
  }
  return null;
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

/**
 * What the shop sells it for, in the shop's own figures.
 *
 * A product with no price says so plainly and shows how to set one, because
 * "sina bei" with no way forward is how a question gets asked twice.
 */
export function sellingPriceReply(
  asked: string,
  answer: SellingPriceAnswer | null,
  lang: Lang,
  /** Buying cost is commercial data; a worker sees prices but not margin. */
  showCost = false,
): string {
  if (!answer || (answer.retail === null && answer.wholesale === null)) {
    const name = answer?.productName ?? asked;
    return lang === 'sw'
      ? `Sijawahi kuwekewa bei ya kuuza ya ${name}.\nNiambie, mfano: "bei ya ${name} rejareja 2000".`
      : `No selling price has ever been set for ${name}.\nTell me one, e.g. "bei ya ${name} rejareja 2000".`;
  }

  const lines: string[] = [];
  if (answer.retail !== null) {
    lines.push(lang === 'sw' ? `• Rejareja: ${money(answer.retail)}` : `• Retail: ${money(answer.retail)}`);
  }
  if (answer.wholesale !== null) {
    const from = answer.wholesaleMinQty !== null && answer.wholesaleMinQty > 0
      ? (lang === 'sw' ? ` (kuanzia ${answer.wholesaleMinQty})` : ` (from ${answer.wholesaleMinQty})`)
      : '';
    lines.push(lang === 'sw'
      ? `• Jumla: ${money(answer.wholesale)}${from}`
      : `• Wholesale: ${money(answer.wholesale)}${from}`);
  }
  // Stated, not computed into a percentage: a margin per unit is the number a
  // trader actually uses when somebody at the counter asks for a discount.
  if (showCost && answer.unitCost !== null && answer.retail !== null) {
    const margin = answer.retail - answer.unitCost;
    lines.push(lang === 'sw'
      ? `• Ulinunua kwa ${money(answer.unitCost)} — faida ${money(margin)} kwa kila moja`
      : `• You buy it at ${money(answer.unitCost)} — ${money(margin)} margin each`);
  }

  return (lang === 'sw'
    ? `Bei ya ${answer.productName}:\n`
    : `${answer.productName} sells at:\n`) + lines.join('\n');
}
