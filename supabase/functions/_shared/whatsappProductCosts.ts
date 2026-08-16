// "unga unanigharimu 900 kwa kilo" — telling Risip what a product costs to buy.
//
// Without this the product_costs table stays empty and the profit estimate can
// never say anything, because nobody has a way to answer the one question it
// needs. A trader lives in WhatsApp, so the answer has to be reachable there.
//
// Deliberately narrow, for the same reason the stock parser is: a buying price
// silently changes every future profit figure, so a message has to say plainly
// that it is a cost before we treat it as one. "nimeuza unga 900" is a sale and
// must never land here.

export type Lang = 'en' | 'sw';

export type ProductCost = {
  product: string;
  unitCost: number;
  /** "kilo", "kipande" — descriptive only. Nothing converts between units. */
  unit: string | null;
};

export type ProductCostErrorCode =
  | 'not_linked' | 'no_active_company' | 'not_authorized' | 'no_product'
  | 'invalid_cost'
  /** A price or count offered in a unit the product is not measured in. */
  | 'unit_mismatch'
  | 'invalid_quantity'
  | 'unknown';

/**
 * A unit is a word. "50" is not.
 *
 * The AI tool path used to hand any string through, and one production row ended
 * up measured in '50'. Because a product may only ever have one unit, that made
 * the product uncountable for good: every later count was told it was measured
 * in 50. Better to keep no unit than to keep a wrong one.
 */
export function normaliseUnit(raw: string | null | undefined): string | null {
  const unit = clean(raw).toLowerCase().slice(0, 20);
  return unit && /[\p{L}]/u.test(unit) ? unit : null;
}

export function validateProductCostCandidate(candidate: unknown): ProductCost | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const value = candidate as { product?: unknown; unit_cost?: unknown; unit?: unknown };
  const product = typeof value.product === 'string' ? clean(value.product).slice(0, 80) : '';
  const unitCost = typeof value.unit_cost === 'number' ? value.unit_cost : Number.NaN;
  const unit = normaliseUnit(typeof value.unit === 'string' ? value.unit : null);
  if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
  if (!Number.isFinite(unitCost) || unitCost <= 0 || unitCost > 1_000_000_000) return null;
  return { product, unitCost: Math.round(unitCost * 100) / 100, unit };
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** 12,500 · 12500 · 12.500 → 12500 */
function money(raw: string): number | null {
  const digits = raw.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Every shape means the same thing: this product costs me this much to buy.
//   unga unanigharimu 900 kwa kilo
//   unga inanigharimu 900
//   bei ya kununua unga ni 900
//   ninanunua unga kwa 900 kwa kilo
//   unga buying price 900 per kilo
//   cost of unga is 900
const PATTERNS: { re: RegExp; product: number; amount: number; unit: number }[] = [
  // <product> unanigharimu|inanigharimu|unagharimu <amount> [kwa <unit>]
  { re: /^(.+?)\s+(?:una|ina|u|i)?nigharimu\s+([\d.,]+)(?:\s+(?:kwa|per|kila)\s+([\p{L}]+))?$/iu,
    product: 1, amount: 2, unit: 3 },
  // bei ya kununua <product> ni <amount> [kwa <unit>]
  { re: /^bei\s+ya\s+kununua\s+(.+?)\s+(?:ni\s+)?([\d.,]+)(?:\s+(?:kwa|per|kila)\s+([\p{L}]+))?$/iu,
    product: 1, amount: 2, unit: 3 },
  // ninanunua|nanunua <product> kwa <amount> [kwa <unit>]
  { re: /^(?:nina|na|ni)nunua\s+(.+?)\s+kwa\s+([\d.,]+)(?:\s+(?:kwa|per|kila)\s+([\p{L}]+))?$/iu,
    product: 1, amount: 2, unit: 3 },
  // <product> gharama (ya kununua) <amount> [kwa <unit>]
  { re: /^(.+?)\s+gharama(?:\s+ya\s+kununua)?\s+(?:ni\s+)?([\d.,]+)(?:\s+(?:kwa|per|kila)\s+([\p{L}]+))?$/iu,
    product: 1, amount: 2, unit: 3 },
  // <product> buying price [is] <amount> [per <unit>]
  { re: /^(.+?)\s+(?:buying\s+price|cost\s+price)\s+(?:is\s+)?([\d.,]+)(?:\s+(?:per|a)\s+([\p{L}]+))?$/iu,
    product: 1, amount: 2, unit: 3 },
  // cost of <product> is <amount> [per <unit>]
  { re: /^cost\s+of\s+(.+?)\s+is\s+([\d.,]+)(?:\s+(?:per|a)\s+([\p{L}]+))?$/iu,
    product: 1, amount: 2, unit: 3 },
  // <product> sasa ni <amount> kwa <unit> — how a supplier's new price gets
  // reported out loud. The unit is REQUIRED here and nowhere else: without it
  // "faida sasa ni 5000" would be filed as the buying cost of a product called
  // "faida", and every margin after it would be wrong.
  { re: /^(.+?)\s+(?:sasa|now)\s+(?:ni|is)\s+([\d.,]+)\s+(?:kwa|per|kila)\s+([\p{L}]+)$/iu,
    product: 1, amount: 2, unit: 3 },
];

// Words that mean the message is about selling or spending, not about a cost
// price. If one of these opens the message we do not claim it, whatever else it
// contains — a mis-read here rewrites every future profit figure.
const NOT_A_COST = /^(?:nimeuza|niliuza|uza|sold|mauzo|nimelipa|nimetumia|paid|spent|nimenunua\s+stock|amechukua|amelipa)\b/i;

export function parseProductCost(text: string | null | undefined): ProductCost | null {
  const said = clean(text);
  if (!said || NOT_A_COST.test(said)) return null;

  for (const { re, product, amount, unit } of PATTERNS) {
    const m = re.exec(said);
    if (!m) continue;

    const name = clean(m[product])
      .replace(/^(?:bei\s+ya\s+)?/i, '')
      .replace(/[:,.]+$/, '')
      .trim();
    const value = money(m[amount] ?? '');
    if (!value || name.length < 2 || name.length > 80) return null;
    // A product name that is only digits is a parse gone wrong, not a product.
    if (!/[\p{L}]/u.test(name)) return null;

    return {
      product: name,
      unitCost: value,
      unit: m[unit] ? clean(m[unit]).toLowerCase().slice(0, 20) : null,
    };
  }
  return null;
}

/** Asked before saving, because this number changes every report that follows. */
export function costConfirmation(
  cost: ProductCost, businessName: string, previous: number | null, lang: Lang,
): string {
  const price = cost.unitCost.toLocaleString('en-US');
  const per = cost.unit ? (lang === 'sw' ? ` kwa ${cost.unit}` : ` per ${cost.unit}`) : '';
  const was = previous !== null
    ? (lang === 'sw'
        ? `\nIlikuwa TSh ${previous.toLocaleString('en-US')}${per}.`
        : `\nIt was TSh ${previous.toLocaleString('en-US')}${per}.`)
    : '';

  return lang === 'sw'
    ? `${businessName} — ${cost.product} inakugharimu TSh ${price}${per}.${was}\n\nNi sahihi? NDIYO / HAPANA`
    : `${businessName} — ${cost.product} costs you TSh ${price}${per}.${was}\n\nIs that right? YES / NO`;
}

export function costSaved(cost: ProductCost, businessName: string, lang: Lang): string {
  const per = cost.unit ? (lang === 'sw' ? ` kwa ${cost.unit}` : ` per ${cost.unit}`) : '';
  return lang === 'sw'
    ? `Nimeandika: ${cost.product} TSh ${cost.unitCost.toLocaleString('en-US')}${per} (${businessName}).\nSasa naweza kukadiria faida ya ${cost.product}.`
    : `Saved: ${cost.product} TSh ${cost.unitCost.toLocaleString('en-US')}${per} (${businessName}).\nI can now estimate profit on ${cost.product}.`;
}

export function productCostReply(
  product: string,
  row: { productName: string; unitCost: number; unit: string | null; currency: string; effectiveFrom: string } | null,
  lang: Lang,
): string {
  if (!row) {
    return lang === 'sw'
      ? `Bado hakuna bei ya kununua iliyohifadhiwa kwa ${product}. Owner au accountant anaweza kuiweka kwa uthibitisho.`
      : `There is no saved buying cost for ${product} yet. An owner or accountant can set it with confirmation.`;
  }
  const currency = row.currency.toUpperCase() === 'TZS' ? (lang === 'sw' ? 'TSh' : 'TZS') : row.currency.toUpperCase();
  const per = row.unit ? (lang === 'sw' ? ` kwa ${row.unit}` : ` per ${row.unit}`) : '';
  const date = new Date(row.effectiveFrom);
  const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam',
  });
  return lang === 'sw'
    ? `Bei ya kununua ya ${row.productName}: ${currency} ${row.unitCost.toLocaleString('en-US')}${per}.${dateText ? ` Imeanza kutumika ${dateText}.` : ''}`
    : `Buying cost for ${row.productName}: ${currency} ${row.unitCost.toLocaleString('en-US')}${per}.${dateText ? ` Effective ${dateText}.` : ''}`;
}

/** Map database hints to safe user-facing copy; never expose raw Postgres text. */
export function productCostErrorMessage(error: { message?: string; hint?: string } | null | undefined, lang: Lang): string {
  const hint = error?.hint as ProductCostErrorCode | undefined;
  const sw: Record<ProductCostErrorCode, string> = {
    not_linked: 'Namba hii bado haijaunganishwa na Risip.',
    no_active_company: 'Hakuna biashara hai iliyochaguliwa kwenye Risip.',
    not_authorized: 'Ni owner au accountant pekee anayeweza kuweka bei ya kununua.',
    no_product: 'Sikuweza kutambua jina la bidhaa. Taja bidhaa na bei yake.',
    invalid_cost: 'Bei ya kununua lazima iwe kubwa kuliko sifuri.',
    unit_mismatch: 'Bidhaa hii ina kipimo chake tayari. Tumia kipimo kile kile.',
    invalid_quantity: 'Idadi haiwezi kuwa chini ya sifuri.',
    unknown: 'Sikuweza kuhifadhi bei hiyo. Tafadhali jaribu tena.',
  };
  const en: Record<ProductCostErrorCode, string> = {
    not_linked: 'This number is not linked to Risip.',
    no_active_company: 'No active business is selected in Risip.',
    not_authorized: 'Only an owner or accountant can set a buying price.',
    no_product: 'I could not identify the product name. Include the product and its price.',
    invalid_cost: 'The buying price must be greater than zero.',
    unit_mismatch: 'This product already has a unit. Use the same one.',
    invalid_quantity: 'A quantity cannot be less than zero.',
    unknown: 'I could not save that buying price. Please try again.',
  };

  // The server names BOTH units, and that is the useful half — "measured in
  // kilo, not per gunia" tells the trader exactly what to convert. Collapsing it
  // into a generic "try again" is the swallowed-error-body mistake.
  if (hint === 'unit_mismatch') {
    const units = /measured in ([\p{L}]+)[\s\S]*?not (?:per |in )([\p{L}]+)/u.exec(String(error?.message ?? ''));
    if (units) {
      return lang === 'sw'
        ? `Bidhaa hii inapimwa kwa ${units[1]}, si ${units[2]}. Tumia ${units[1]}.`
        : `This product is measured in ${units[1]}, not ${units[2]}. Use ${units[1]}.`;
    }
  }

  return (lang === 'sw' ? sw : en)[hint && hint in sw ? hint : 'unknown'];
}
