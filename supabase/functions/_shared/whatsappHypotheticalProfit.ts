import type { Lang } from './whatsappIntent.ts';

export type HypotheticalProfitInput = {
  productName: string;
  onHand: number | null;
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

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

export function parseHypotheticalProfitRequest(text: string | null | undefined): string | null {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value || !/\b(?:faida|profit|margin)\b/iu.test(value)) return null;
  const patterns = [
    /^(?:je\s+)?(?:nikiuza|nikiziuza|zikiuza|zikiuzwa)\s+(.+?)\s+(?:zote|yote)\b/iu,
    /^(.+?)\s+(?:zikiuzwa|nikiuza)\s+(?:zote|yote)\b/iu,
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
  const average = input.avgUnitPrice ?? null;
  // The shop's own price wins. Where it never set one, what it has actually been
  // charging is a better answer than a refusal — as long as the reply says so.
  const sellingPrice = input.retailPrice ?? average;
  const estimated = input.retailPrice === null && average !== null;

  const missing: string[] = [];
  if (!input.hasCount || input.onHand === null) missing.push(lang === 'sw' ? 'stock count ya kuanzia' : 'a starting stock count');
  if (input.unitCost === null) missing.push(lang === 'sw' ? 'bei ya kununua' : 'the buying cost');
  if (sellingPrice === null) missing.push(lang === 'sw' ? 'bei ya kuuza' : 'the selling price');
  if (missing.length > 0) {
    const list = missing.map((item) => `- ${item}`).join('\n');
    return lang === 'sw'
      ? `Siwezi kukadiria faida ya ${input.productName} bado. Kinachokosekana:\n${list}\n\nNikipata vipande hivyo nitahesabu: stock × (bei ya kuuza − bei ya kununua).`
      : `I cannot estimate the profit for ${input.productName} yet. Missing:\n${list}\n\nOnce those are available I will calculate: stock × (selling price − buying cost).`;
  }

  const quantity = input.onHand!;
  const unitText = input.unit ? ` ${input.unit}` : '';
  if (quantity <= 0) {
    return lang === 'sw'
      ? `${input.productName} haina stock inayoweza kuuzwa kwa sasa (${quantity.toLocaleString('en-US')}${unitText}).`
      : `${input.productName} has no sellable stock right now (${quantity.toLocaleString('en-US')}${unitText}).`;
  }

  const retailProfit = quantity * (sellingPrice! - input.unitCost!);
  const retailLine = `${quantity.toLocaleString('en-US')}${unitText} × (${money(sellingPrice!)} − ${money(input.unitCost!)}) = *${money(retailProfit)}*`;
  const label = estimated
    ? (lang === 'sw' ? 'Kwa wastani' : 'At your average')
    : (lang === 'sw' ? 'Retail' : 'Retail');
  const lines = lang === 'sw'
    ? [`Makisio ya ${input.productName} ukiuza stock yote:`, `- ${label}: ${retailLine}`]
    : [`Estimate for selling all ${input.productName} stock:`, `- ${label}: ${retailLine}`];
  if (input.wholesalePrice !== null && input.wholesalePrice !== input.retailPrice) {
    const wholesaleProfit = quantity * (input.wholesalePrice - input.unitCost!);
    const wholesaleLine = `${quantity.toLocaleString('en-US')}${unitText} × (${money(input.wholesalePrice)} − ${money(input.unitCost!)}) = *${money(wholesaleProfit)}*`;
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

