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

export function parseQuantityMeaningAnswer(text: string | null | undefined): 'sale' | 'stock_purchase' | null {
  const said = clean(text).replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:ni\s+)?(?:mauzo|sale|sales|sold)$/.test(said)) return 'sale';
  if (/^(?:ni\s+)?(?:manunuzi|stock purchase|purchase|bought|stock niliyonunua)$/.test(said)) return 'stock_purchase';
  return null;
}

export function quantityMeaningQuestion(lang: Lang): string {
  return lang === 'sw'
    ? 'Nimekumbuka bidhaa na idadi zake. Hizi ni *mauzo* au *manunuzi ya stock*?'
    : 'I have kept the products and quantities. Are these *sales* or a *stock purchase*?';
}

export function stockPurchaseNeedsPrices(state: ParkedQuantityMeaning, lang: Lang): string {
  const names = state.sale.items.map((item) => `• ${item.product}: ${item.quantity.toLocaleString('en-US')}`).join('\n');
  return lang === 'sw'
    ? `Nimekumbuka manunuzi haya:\n${names}\n\nOngeza bei ya kununua ya kila bidhaa; sitaikisia.`
    : `I kept this stock purchase:\n${names}\n\nAdd each product's buying price; I will not guess it.`;
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
