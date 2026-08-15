import type { Lang } from './whatsappIntent.ts';

export type HypotheticalProfitInput = {
  productName: string;
  onHand: number | null;
  hasCount: boolean;
  unit: string | null;
  unitCost: number | null;
  retailPrice: number | null;
  wholesalePrice: number | null;
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
  const missing: string[] = [];
  if (!input.hasCount || input.onHand === null) missing.push(lang === 'sw' ? 'stock count ya kuanzia' : 'a starting stock count');
  if (input.unitCost === null) missing.push(lang === 'sw' ? 'bei ya kununua' : 'the buying cost');
  if (input.retailPrice === null) missing.push(lang === 'sw' ? 'bei ya kuuza' : 'the selling price');
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

  const retailProfit = quantity * (input.retailPrice! - input.unitCost!);
  const retailLine = `${quantity.toLocaleString('en-US')}${unitText} × (${money(input.retailPrice!)} − ${money(input.unitCost!)}) = *${money(retailProfit)}*`;
  const lines = lang === 'sw'
    ? [`Makisio ya ${input.productName} ukiuza stock yote:`, `- Retail: ${retailLine}`]
    : [`Estimate for selling all ${input.productName} stock:`, `- Retail: ${retailLine}`];
  if (input.wholesalePrice !== null && input.wholesalePrice !== input.retailPrice) {
    const wholesaleProfit = quantity * (input.wholesalePrice - input.unitCost!);
    const wholesaleLine = `${quantity.toLocaleString('en-US')}${unitText} × (${money(input.wholesalePrice)} − ${money(input.unitCost!)}) = *${money(wholesaleProfit)}*`;
    lines.push(lang === 'sw' ? `- Wholesale: ${wholesaleLine}` : `- Wholesale: ${wholesaleLine}`);
  }
  lines.push(lang === 'sw'
    ? 'Haya ni makisio; hayajaandika mauzo mapya.'
    : 'This is an estimate; it has not recorded a new sale.');
  return lines.join('\n');
}

