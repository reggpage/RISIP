import type { Lang } from './whatsappIntent.ts';
import { normalizeNumberWords } from './whatsappDailyRecords.ts';

export type HypotheticalProfitInput = {
  productName: string;
  onHand: number | null;
  /**
   * How many the question asked about, when it named a number.
   *
   * "nikiuza kumi" means ten, not the whole shelf. Null keeps the old
   * behaviour — the estimate covers everything in stock.
   */
  askedQuantity?: number | null;
  priceBand?: 'retail' | 'wholesale' | null;
  wholesaleMinQty?: number | null;
  hasCount: boolean;
  unit: string | null;
  unitCost: number | null;
  retailPrice: number | null;
  wholesalePrice: number | null;
  /**
   * What the shop actually got per unit, on average, on the sales it has made.
   *
   * A fallback only. A price the shop set is a decision it can stand behind; an
   * average is a description of the past, so an estimate built on one has to say
   * where the number came from.
   */
  avgUnitPrice?: number | null;
};

export type PortionHypotheticalProfitInput = {
  productName: string;
  onHandBase: number | null;
  hasCount: boolean;
  baseUnit: string;
  baseUnitCost: number | null;
  saleUnit: string;
  unitBaseQuantity: number;
  retailPrice: number | null;
  wholesalePrice: number | null;
};

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

/**
 * How many, when the question names a number.
 *
 * MEASURED FAILURE: "kwa bei ya reja reja marker nikiuza kumi ntapata
 * shingapi?" was answered for all seventy-nine markers in stock. The question
 * said TEN. The estimate was arithmetically correct and answered a question
 * nobody asked, which is the worst kind of wrong — it looks right.
 */
export function parseHypotheticalQuantity(text: string | null | undefined): number | null {
  const said = normalizeNumberWords(String(text ?? '').replace(/\s+/g, ' ').trim());
  // "nikiuza 10", "nikiziuza 10", "sell 10" — the number that follows the verb.
  const match = /\b(?:nikiuza|nikiziuza|zikiuza|zikiuzwa|nikauza|sell|selling)\s+(?:pcs\s+|vipande\s+)?([0-9]+(?:\.[0-9]+)?)\b/iu
    .exec(said);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 && quantity <= 1_000_000 ? quantity : null;
}

export function parseHypotheticalProfitRequest(text: string | null | undefined): string | null {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  // MEASURED FAILURE: "Kwa bei ya reja reja gundi nikiuza sita ntapata
  // shingapi?" was recognised by nothing. It never says "faida" — it says
  // "ntapata shingapi", which is the same question — and it names six rather
  // than "zote". So it fell to the model, which answered on the whole shelf,
  // AND it did not count as changing the subject, so a parked question about a
  // different product came back instead.
  const value = normalizeNumberWords(raw)
    // "Kwa bei ya rejareja X" — the band is context for the answer, never part
    // of the product name.
    .replace(/^(?:kwa\s+)?bei\s+ya\s+(?:reja\s*reja|rejareja|jumla|retail|wholesale)\s+/iu, '');
  const asksProfit = /\b(?:faida|profit|margin)\b/iu.test(value);
  const asksTakings = /\b(?:ntapata|nitapata|tutapata|napata|shingapi|how much)\b/iu.test(value);
  const hypothetical = /\b(?:nikiuza|nikiziuza|nikauza|zikiuza|zikiuzwa|i\s+sell|selling)\b/iu.test(value);
  if (!value || !(asksProfit || (asksTakings && hypothetical))) return null;
  const patterns = [
    /^(?:je\s+)?(?:nikiuza|nikiziuza|zikiuza|zikiuzwa)\s+(.+?)\s+(?:zote|yote)\b/iu,
    /^(.+?)\s+(?:zikiuzwa|nikiuza)\s+(?:zote|yote)\b/iu,
    // "<product> nikiuza 6", the shape with a number instead of "zote".
    /^(.+?)\s+(?:nikiuza|nikiziuza|nikauza|zikiuza)\s+(?:pcs\s+|vipande\s+)?[0-9]/iu,
    /^(?:je\s+)?(?:nikiuza|nikiziuza|nikauza)\s+(?:pcs\s+|vipande\s+)?[0-9]+(?:\.[0-9]+)?\s+(?:za\s+|ya\s+|of\s+)?(.+?)(?:\s+(?:nitapata|ntapata|tutapata)|[?,]|$)/iu,
    /^(?:if\s+)?i\s+sell\s+all\s+(?:the\s+)?(.+?)(?:\s+what|\s+how|,|\?|$)/iu,
    /^what\s+(?:profit|margin).+?all\s+(?:the\s+)?(.+?)(?:\?|$)/iu,
  ];
  for (const pattern of patterns) {
    const product = pattern.exec(value)?.[1]
      ?.replace(/\s+(?:nitakuwa|nitapata|tutapata|will\s+i\s+(?:make|get)|would\s+i\s+(?:make|get)).*$/iu, '')
      .trim();
    if (product && product.length >= 2 && product.length <= 100) return product;
  }
  return null;
}

export function buildHypotheticalProfitReply(input: HypotheticalProfitInput, lang: Lang): string {
  if (input.askedQuantity != null && input.priceBand != null) {
    const q = input.askedQuantity;
    if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) return lang === 'sw' ? 'Kiasi cha makisio si sahihi.' : 'Invalid estimate quantity.';
    const price = input.priceBand === 'retail' ? input.retailPrice : input.wholesalePrice;
    if (price == null || !Number.isFinite(price) || price <= 0) return lang === 'sw' ? 'Bei ya aina uliyochagua haijawekwa. Sijatumia bei nyingine.' : 'The requested price is not configured. No other price was substituted.';
    const band = input.priceBand === 'retail' ? (lang === 'sw' ? 'rejareja' : 'retail') : (lang === 'sw' ? 'jumla' : 'wholesale');
    const lines = [lang === 'sw' ? `${input.productName}: ukiuza ${q} ${band}` : `${input.productName}: selling ${q} ${band}`,
      `${lang === 'sw' ? 'Mapato ya mauzo' : 'Sales revenue'}: ${q} × ${money(price)} = *${money(q * price)}*`];
    if (input.unitCost != null && Number.isFinite(input.unitCost) && input.unitCost >= 0) {
      lines.push(`${lang === 'sw' ? 'Faida ghafi (kabla ya matumizi mengine)' : 'Gross profit (before other expenses)'}: ${q} × (${money(price)} − ${money(input.unitCost)}) = *${money(q * (price - input.unitCost))}*`);
    } else lines.push(lang === 'sw' ? 'Faida ghafi haijulikani: gharama ya kununua haijathibitishwa.' : 'Gross profit unknown: buying cost is not confirmed.');
    if (input.onHand != null && input.hasCount && q > input.onHand) lines.push(lang === 'sw' ? `Tahadhari: stock ni ${input.onHand}; makisio haya ni ya ${q} ulizoomba.` : `Warning: stock is ${input.onHand}; this estimate still covers the requested ${q}.`);
    if (input.priceBand === 'wholesale' && input.wholesaleMinQty != null && q < input.wholesaleMinQty) lines.push(lang === 'sw' ? `Tahadhari: bei ya jumla inaanzia ${input.wholesaleMinQty}; haya ni makisio tu.` : `Warning: wholesale starts at ${input.wholesaleMinQty}; this is hypothetical only.`);
    lines.push(lang === 'sw' ? 'Haya ni makisio; hayajaandika mauzo mapya.' : 'This is an estimate; no sale has been recorded.');
    return lines.join('\n');
  }
  const average = input.avgUnitPrice ?? null;
  // The shop's own price wins. Where it never set one, what it has actually been
  // charging is a better answer than a refusal — as long as the reply says so.
  const sellingPrice = input.retailPrice ?? average;
  const estimated = input.retailPrice === null && average !== null;

  const missing: string[] = [];
  if (!input.hasCount || input.onHand === null) missing.push(lang === 'sw' ? 'hesabu ya bidhaa ya kuanzia' : 'a starting stock count');
  if (input.unitCost === null) missing.push(lang === 'sw' ? 'bei ya kununua' : 'the buying cost');
  if (sellingPrice === null) missing.push(lang === 'sw' ? 'bei ya kuuza' : 'the selling price');
  if (missing.length > 0) {
    const list = missing.map((item) => `- ${item}`).join('\n');
    return lang === 'sw'
      ? `Siwezi kukadiria faida ya ${input.productName} bado. Kinachokosekana:\n${list}\n\nNikipata vipande hivyo nitahesabu: bidhaa zilizopo × (bei ya kuuza − bei ya kununua).`
      : `I cannot estimate the profit for ${input.productName} yet. Missing:\n${list}\n\nOnce those are available I will calculate: stock × (selling price − buying cost).`;
  }

  // The question wins over the shelf. Asked for ten and answered for
  // seventy-nine is arithmetically correct and answers nobody's question.
  const asked = input.askedQuantity ?? null;
  const quantity = asked !== null && asked > 0 ? Math.min(asked, input.onHand!) : input.onHand!;
  const cappedByStock = asked !== null && asked > (input.onHand ?? 0);
  const unitText = input.unit ? ` ${input.unit}` : '';
  if (quantity <= 0) {
    // Never "(-8)". A shelf cannot hold minus eight, and a negative shown here
    // would be read as stock. Below zero means the records are missing
    // something, and saying which something is the only useful answer.
    const shown = Math.max(0, quantity).toLocaleString('en-US');
    const short = quantity < 0
      ? (lang === 'sw'
        ? `\n\n⚠️ Mauzo yamezidi hesabu kwa ${(-quantity).toLocaleString('en-US')}.`
          + ` Hesabu upya: "nina ${input.productName} 20".`
        : `\n\n⚠️ Sales exceed the count by ${(-quantity).toLocaleString('en-US')}.`
          + ` Count it again: "nina ${input.productName} 20".`)
      : '';
    return (lang === 'sw'
      ? `${input.productName} haina bidhaa inayoweza kuuzwa kwa sasa (${shown}${unitText}).`
      : `${input.productName} has no sellable stock right now (${shown}${unitText}).`) + short;
  }

  const retailProfit = quantity * (sellingPrice! - input.unitCost!);
  const retailLine = `${quantity.toLocaleString('en-US')}${unitText} × (${money(sellingPrice!)} − ${money(input.unitCost!)}) = *${money(retailProfit)}*`;
  const label = estimated
    ? (lang === 'sw' ? 'Kwa wastani' : 'At your average')
    : (lang === 'sw' ? 'Retail' : 'Retail');
  const scope = asked === null
    ? (lang === 'sw' ? 'ukiuza bidhaa zote' : 'selling all stock')
    : (lang === 'sw' ? `ukiuza ${quantity.toLocaleString('en-US')}${unitText}` : `selling ${quantity.toLocaleString('en-US')}${unitText}`);
  const capNote = cappedByStock
    ? (lang === 'sw' ? `
_Uliuliza ${asked}, lakini stock iliyopo ni ${quantity}._` : `
_You asked about ${asked}; stock holds ${quantity}._`)
    : '';
  const lines = lang === 'sw'
    ? [`Makisio ya ${input.productName} ${scope}:`, `- ${label}: ${retailLine}`]
    : [`Estimate for ${input.productName}, ${scope}:`, `- ${label}: ${retailLine}`];
  if (input.wholesalePrice !== null && input.wholesalePrice !== input.retailPrice) {
    const wholesaleProfit = quantity * (input.wholesalePrice - input.unitCost!);
    const wholesaleLine = `${quantity.toLocaleString('en-US')}${unitText} × (${money(input.wholesalePrice)} − ${money(input.unitCost!)}) = *${money(wholesaleProfit)}*`;
    if (capNote) lines.push(capNote.trim());
  lines.push(lang === 'sw' ? `- Wholesale: ${wholesaleLine}` : `- Wholesale: ${wholesaleLine}`);
  }
  if (estimated) {
    lines.push(lang === 'sw'
      ? `_Bado hujaweka bei ya kuuza ya ${input.productName}; nimetumia wastani wa bei ulizouzia. Ukiiweka nitatumia yako._`
      : `_You have not set a selling price for ${input.productName}; this uses the average you have actually charged. Set one and I will use it._`);
  }
  lines.push(lang === 'sw'
    ? 'Haya ni makisio; hayajaandika mauzo mapya.'
    : 'This is an estimate; it has not recorded a new sale.');
  return lines.join('\n');
}

/**
 * Sell-all estimate for one explicitly chosen portion.
 *
 * Stock is held in the base unit. Only complete selling portions are counted;
 * any remainder stays on the shelf and is named in the answer. This prevents a
 * quarter-litre price being multiplied by litres (or by purchase buckets).
 */
export function buildPortionHypotheticalProfitReply(
  input: PortionHypotheticalProfitInput,
  lang: Lang,
): string {
  const missing: string[] = [];
  if (!input.hasCount || input.onHandBase === null) {
    missing.push(lang === 'sw' ? 'hesabu ya bidhaa ya kuanzia' : 'a starting stock count');
  }
  if (input.baseUnitCost === null) missing.push(lang === 'sw' ? 'bei ya kununua' : 'the buying cost');
  if (input.retailPrice === null) missing.push(lang === 'sw' ? `bei ya kuuza kwa ${input.saleUnit}` : `the ${input.saleUnit} selling price`);
  if (missing.length > 0) {
    const list = missing.map((item) => `- ${item}`).join('\n');
    return lang === 'sw'
      ? `Siwezi kukadiria faida ya ${input.productName} kwa ${input.saleUnit} bado. Kinachokosekana:\n${list}`
      : `I cannot estimate the profit for ${input.productName} sold by ${input.saleUnit} yet. Missing:\n${list}`;
  }
  if (!Number.isFinite(input.unitBaseQuantity) || input.unitBaseQuantity <= 0) {
    return lang === 'sw'
      ? `Kipimo cha ${input.saleUnit} hakina conversion halali kwenda ${input.baseUnit}.`
      : `${input.saleUnit} has no valid conversion to ${input.baseUnit}.`;
  }

  const stock = input.onHandBase!;
  if (stock <= 0) {
    return lang === 'sw'
      ? `${input.productName} haina bidhaa inayoweza kuuzwa kwa sasa (${stock.toLocaleString('en-US')} ${input.baseUnit}).`
      : `${input.productName} has no sellable stock right now (${stock.toLocaleString('en-US')} ${input.baseUnit}).`;
  }
  const portions = Math.floor((stock + 1e-9) / input.unitBaseQuantity);
  const usedBase = portions * input.unitBaseQuantity;
  const remainder = Math.max(0, stock - usedBase);
  if (portions <= 0) {
    return lang === 'sw'
      ? `Bidhaa ya ${input.productName} (${stock.toLocaleString('en-US')} ${input.baseUnit}) haitoshi hata ${input.saleUnit} moja.`
      : `${input.productName} stock (${stock.toLocaleString('en-US')} ${input.baseUnit}) is not enough for one ${input.saleUnit}.`;
  }

  const portionCost = input.baseUnitCost! * input.unitBaseQuantity;
  const retailProfit = portions * (input.retailPrice! - portionCost);
  const formula = `${portions.toLocaleString('en-US')} ${input.saleUnit} × (${money(input.retailPrice!)} − ${money(portionCost)}) = *${money(retailProfit)}*`;
  const lines = lang === 'sw'
    ? [
      `Makisio ya ${input.productName} ukiuza bidhaa zote kwa ${input.saleUnit}:`,
      `- Stock: ${stock.toLocaleString('en-US')} ${input.baseUnit}`,
      `- Inayouzwa: ${portions.toLocaleString('en-US')} ${input.saleUnit}`,
      `- Retail: ${formula}`,
    ]
    : [
      `Estimate for selling all ${input.productName} stock by ${input.saleUnit}:`,
      `- Stock: ${stock.toLocaleString('en-US')} ${input.baseUnit}`,
      `- Sellable: ${portions.toLocaleString('en-US')} ${input.saleUnit}`,
      `- Retail: ${formula}`,
    ];
  if (input.wholesalePrice !== null && input.wholesalePrice !== input.retailPrice) {
    const wholesaleProfit = portions * (input.wholesalePrice - portionCost);
    lines.push(`- Wholesale: ${portions.toLocaleString('en-US')} ${input.saleUnit} × (${money(input.wholesalePrice)} − ${money(portionCost)}) = *${money(wholesaleProfit)}*`);
  }
  if (remainder > 1e-9) {
    lines.push(lang === 'sw'
      ? `- Inabaki: ${remainder.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${input.baseUnit} (haitoshi ${input.saleUnit} kamili)`
      : `- Remaining: ${remainder.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${input.baseUnit} (not enough for a complete ${input.saleUnit})`);
  }
  lines.push(lang === 'sw'
    ? 'Haya ni makisio; hayajaandika mauzo mapya.'
    : 'This is an estimate; it has not recorded a new sale.');
  return lines.join('\n');
}
