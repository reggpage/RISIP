import type { Lang } from './whatsappIntent.ts';
import type { QuantitySale } from './whatsappQuantitySale.ts';

export type ParkedQuantityMeaning = {
  kind: 'quantity_meaning_clarification';
  sourceMessageId: string;
  originalText: string;
  sale: QuantitySale;
};

export type HypotheticalPortionChoice = {
  kind: 'hypothetical_portion_choice';
  productName: string;
  units: string[];
};

const clean = (value: string | null | undefined) => String(value ?? '').trim().toLocaleLowerCase('sw-TZ');

export function parseQuantityMeaningAnswer(
  text: string | null | undefined,
): 'sale' | 'stock_purchase' | 'stock_count' | null {
  const said = clean(text).replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:ni\s+)?(?:mauzo|sale|sales|sold)$/.test(said)) return 'sale';
  if (/^(?:ni\s+)?(?:manunuzi|stock purchase|purchase|bought|stock niliyonunua)$/.test(said)) return 'stock_purchase';
  if (/^(?:ni\s+)?(?:stock|stock iliyopo|hesabu ya stock|idadi zilizopo|count|stock count|on hand)$/.test(said)) {
    return 'stock_count';
  }
  return null;
}

export function quantityMeaningQuestion(lang: Lang): string {
  const items = lang === 'sw'
    ? 'Idadi hizi ni *mauzo*, *manunuzi*, au *stock iliyopo sasa*?'
    : 'Are these quantities *sales*, a *stock purchase*, or *stock on hand now*?';
  return lang === 'sw'
    ? `${items}\nJibu MAUZO, MANUNUZI, au STOCK.`
    : `${items}\nReply SALES, PURCHASE, or STOCK.`;
}

export function stockPurchaseNeedsPrices(state: ParkedQuantityMeaning, lang: Lang): string {
  const names = state.sale.items.map((item) => `• ${item.product}: ${item.quantity.toLocaleString('en-US')}`).join('\n');
  return lang === 'sw'
    ? `Nimepata bidhaa hizi:\n${names}\n\nTaja bei ya kununua kwa kila bidhaa, mstari mmoja kwa kila bidhaa.`
    : `I found these products:\n${names}\n\nSend the buying price for each product, one product per line.`;
}

export function hypotheticalPortionQuestion(state: HypotheticalPortionChoice, lang: Lang): string {
  const choices = state.units.map((unit) => `• ${unit}`).join('\n');
  return lang === 'sw'
    ? `${state.productName} ina bei kwa vipimo tofauti. Unataka makisio ya faida ukiuza kwa kipimo gani?\n${choices}`
    : `${state.productName} has prices for different selling units. Which unit should I use for the profit estimate?\n${choices}`;
}

export function matchHypotheticalPortionAnswer(
  text: string | null | undefined,
  state: HypotheticalPortionChoice,
): string | null {
  const said = clean(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return state.units.find((unit) => {
    const key = clean(unit).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    return said === key || said === `kwa ${key}` || said === `by ${key}` || said === `per ${key}`;
  }) ?? null;
}
