// Adding a product from WhatsApp, and noticing when it is already there.
//
// The catalogue is derived — a product exists because it was sold, costed,
// priced or counted. So "adding" one means giving it a buying price, which is
// exactly what the web dialog does. What was missing is the other half the owner
// asked for: telling them when the thing they are adding already exists.
//
// That check matters more than it sounds. Add "atlas" while "atlasi" is already
// on the shelf and the shop now has two products, each holding half the truth —
// half the stock, half the sales, and a margin that is wrong for both. Catching
// it at the door is cheap; merge_products afterwards is not.

import type { Lang } from './whatsappIntent.ts';

export type AddProductRequest = {
  kind: 'add_product';
  product: string;
  /** Optional: stated in the same breath, as most people would. */
  unitCost: number | null;
  unit: string | null;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const UNITS = 'kilo|kilos|kg|gramu|lita|litre|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni|kipande|pcs';

function money(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[,\s]/g, '');
  const normalised = /\.\d{3}$/.test(digits) ? digits.replace('.', '') : digits;
  const value = Number(normalised);
  return Number.isFinite(value) && value > 0 && value < 1_000_000_000 ? Math.round(value * 100) / 100 : null;
}

const OPENER = /^(?:tafadhali\s+)?(?:ongeza|weka|sajili|add|register)\s+(?:bidhaa|product|kitu)\s+/iu;
const START_ONLY = /^(?:tafadhali\s+)?(?:(?:nataka|nahitaji|ningependa|naomba)\s+)?(?:naongeza|ninaongeza|kuongeza|ongeza|kuweka|weka|kusajili|sajili)\s+(?:bidhaa|product|kitu)[?.!\s]*$/iu;
const ENGLISH_START_ONLY = /^(?:please\s+)?(?:i\s+(?:want|need|would\s+like)\s+to\s+)?(?:add|register)\s+(?:a\s+)?product[?.!\s]*$/iu;

/** A clear request to start adding a product, before the name is known. */
export function isAddProductStart(text: string | null | undefined): boolean {
  const said = clean(text);
  return START_ONLY.test(said) || ENGLISH_START_ONLY.test(said);
}

/** Keep the first step conversational instead of asking for a magic sentence. */
export function addProductNameQuestion(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa. Unataka kuongeza bidhaa gani? Andika jina la bidhaa, kwa mfano: *Nyama ya ng\'ombe*.'
    : 'Okay. Which product would you like to add? Send its name, for example: *Beef*.';
}

/** A short answer to the name question. Commands and money belong elsewhere. */
export function parseAddProductName(text: string | null | undefined): string | null {
  const said = clean(text).replace(/^["“”']+|["“”'?.!]+$/gu, '').trim();
  if (said.length < 2 || said.length > 80 || !/[\p{L}]/u.test(said)) return null;
  if (/\d/u.test(said) || /^(?:ndiyo|ndio|yes|hapana|no|cancel|ghairi|toka|help|msaada)$/iu.test(said)) return null;
  return said;
}

/**
 * "ongeza bidhaa sukari", "ongeza bidhaa sukari bei ya kununua 2500 kwa kilo"
 *
 * The buying price is optional here on purpose: somebody adding a product may
 * not have the invoice in front of them, and refusing the name until they do
 * just means the product never gets added.
 */
export function parseAddProduct(text: string | null | undefined): AddProductRequest | null {
  const said = clean(text);
  if (!said || !OPENER.test(said)) return null;

  let rest = said.replace(OPENER, '').trim();
  if (!rest) return null;

  const costMatch = new RegExp(
    `\\s*(?:,|\\.)?\\s*(?:bei\\s+ya\\s+kununua|ninanunua\\s+kwa|nanunua\\s+kwa|inanigharimu|unanigharimu|buying\\s+price|cost)\\s*(?:ni|is|:)?\\s*([0-9][0-9,. ]*)(?:\\s*(?:kwa|per|kila)\\s+(${UNITS}))?\\s*$`,
    'iu',
  ).exec(rest);

  const unitCost = money(costMatch?.[1]);
  const unit = costMatch?.[2] ? costMatch[2].toLowerCase() : null;
  if (costMatch) rest = rest.slice(0, costMatch.index).trim();

  const product = clean(rest).replace(/[:,.;]+$/, '').trim();
  if (product.length < 2 || product.length > 80 || !/[\p{L}]/u.test(product)) return null;
  // A price was clearly meant but could not be read. Refuse rather than let the
  // phrase become part of the product name — "sukari bei ya kununua ngapi" is
  // not a product, and it would sit on the list for ever if it got in.
  if (unitCost === null
    && /\b(?:bei\s+ya\s+kununua|inanigharimu|unanigharimu|buying\s+price|cost)\b/iu.test(product)) {
    return null;
  }

  return { kind: 'add_product', product, unitCost, unit };
}

const shillings = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

/** Said when the name is already on the shelf, exactly as typed. */
export function productAlreadyExists(
  name: string,
  facts: { soldQuantity: number; onHand: number | null; unitCost: number | null },
  lang: Lang,
): string {
  const parts: string[] = [];
  if (facts.onHand !== null) {
    parts.push(lang === 'sw' ? `store ${facts.onHand.toLocaleString('en-US')}` : `store ${facts.onHand.toLocaleString('en-US')}`);
  }
  if (facts.soldQuantity > 0) {
    parts.push(lang === 'sw'
      ? `imeuzwa ${facts.soldQuantity.toLocaleString('en-US')}`
      : `${facts.soldQuantity.toLocaleString('en-US')} sold`);
  }
  if (facts.unitCost !== null) {
    parts.push(lang === 'sw' ? `kununua ${shillings(facts.unitCost)}` : `buying ${shillings(facts.unitCost)}`);
  }
  const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return lang === 'sw'
    ? `“${name}” ipo tayari kwenye orodha yako${detail}.\n\n`
      + 'Sijaongeza nakala. Ukitaka kubadilisha bei tuma: "bei ya kununua ' + name + ' ni ..."'
    : `“${name}” is already on your list${detail}.\n\n`
      + 'I did not add a duplicate. To change its price send: "bei ya kununua ' + name + ' ni ..."';
}

/**
 * Said when the name is close to something already there.
 *
 * Deliberately a question, not a decision. Only the shopkeeper knows whether
 * "daftari kubwa" is the same thing as "daftari".
 */
export function productLooksLikeExisting(asked: string, existing: string, lang: Lang): string {
  return lang === 'sw'
    ? `Kabla sijaongeza “${asked}” — tayari una “${existing}”.\n\n`
      + `Ni bidhaa ile ile? Jibu *1* nitumie “${existing}”, au *2* niongeze “${asked}” kama bidhaa mpya.`
    : `Before I add “${asked}” — you already have “${existing}”.\n\n`
      + `Same product? Reply *YES* to use “${existing}”, or *NO* to add “${asked}” as a new one.`;
}

/** Said when the product is genuinely new but arrived without a price. */
export function addProductNeedsCost(name: string, lang: Lang): string {
  return lang === 'sw'
    ? `“${name}” haipo kwenye orodha yako bado.\n\n`
      + `Ninunua kwa bei gani? Tuma: "bei ya kununua ${name} ni ..." — hapo ndipo itaingia kwenye orodha.`
    : `“${name}” is not on your list yet.\n\n`
      + `What do you buy it for? Send: "bei ya kununua ${name} ni ..." and that puts it on the list.`;
}
