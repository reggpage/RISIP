import type { Lang } from './whatsappIntent.ts';
import type { QuantitySale } from './whatsappQuantitySale.ts';

export type ParkedQuantityMeaning = {
  kind: 'quantity_meaning_clarification';
  sourceMessageId: string;
  originalText: string;
  sale: QuantitySale;
  missingProducts?: string[];
  resolvedProducts?: string[];
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
  // The question now asks about "bidhaa zilizopo sasa", so that is an answer a
  // trader will echo back. "stock" stays accepted alongside it.
  if (/^(?:ni\s+)?(?:stock|bidhaa|stock iliyopo|bidhaa zilizopo|hesabu ya (?:stock|bidhaa)|idadi zilizopo|count|stock count|on hand)$/.test(said)) {
    return 'stock_count';
  }
  return null;
}

export function wantsToRegisterNewProducts(text: string | null | undefined): boolean {
  const said = clean(text).replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:ndiyo|dio|yes|yeah|yep|sajili|nisajilie|ongeza|ongeza bidhaa|weka bidhaa|bidhaa mpya)$/.test(said);
}

/**
 * The question that stops a list of numbers becoming the wrong kind of record.
 *
 * THE OWNER'S IMPROVEMENT, and it is the right one: "nataka ai iwe na akili
 * isiwe tu kama roboti… kama ai imenotice bidhaa ambazo hazipo ndio iseme pia
 * kuna bidhaa naona hazipo kwenye stoo yako hizi ni mpya kama ni mpya chagua
 * manunuzi."
 *
 * The server already knows which of these products the shop sells — it resolves
 * every one of them a moment later. Asking the question without saying so made
 * it read like a form. Saying so turns three equal options into a decision the
 * shopkeeper can already half-answer: nine products he recognises is a sale or
 * a count, and a name he has never registered is almost certainly something he
 * has just bought.
 *
 * It STATES what it found and never decides on it. Recognising a product does
 * not prove a sale, and a new name does not prove a purchase — a shop counting
 * a shelf for the first time meets both. So this leans, and he chooses.
 */
export function quantityMeaningQuestion(
  lang: Lang,
  missingProducts: string[] = [],
  knownProducts: string[] = [],
): string {
  const known = knownProducts.length === 0 ? '' : (missingProducts.length === 0
    ? (lang === 'sw'
      ? `_Bidhaa zote ${knownProducts.length} zipo kwenye orodha yako._\n\n`
      : `_All ${knownProducts.length} are already in your product list._\n\n`)
    : (lang === 'sw'
      ? `_Bidhaa ${knownProducts.length} zipo kwenye orodha yako._\n\n`
      : `_${knownProducts.length} are already in your product list._\n\n`));

  const missing = missingProducts.length === 0 ? '' : lang === 'sw'
    ? `\n\nHizi sijaziona kwenye stoo yako — ni mpya: ${missingProducts.map((name) => `*${name}*`).join(', ')}.\n`
      + 'Kama umezinunua, chagua *MANUNUZI*; nitakuomba bei ya kununua na bei ya kuuza.'
    : `\n\nI do not see these in your store — they are new: ${missingProducts.map((name) => `*${name}*`).join(', ')}.\n`
      + 'If you bought them, choose *MANUNUZI*; I will ask for buying and selling prices.';
  const items = lang === 'sw'
    ? 'Nimepata idadi za bidhaa ulizotaja. Unataka nizifanye nini?\n'
      + '1. *MAUZO* — nirekodi kama mauzo ya leo\n'
      + '2. *STOCK* — niongeze idadi hizi kama hesabu mpya ya bidhaa zilizopo sasa\n'
      + '3. *MANUNUZI* — bidhaa ulizonunua/kuongeza stoo'
    : 'I found quantities for the products you named. What should I do with them?\n'
      + '1. *SALES* — record them as today’s sales\n'
      + '2. *STOCK* — set these as the current quantities on hand\n'
      + '3. *PURCHASE* — products you bought/added to the store';
  return lang === 'sw'
    ? `${known}${items}${missing}\n\nJibu *MAUZO*, *STOCK*, *MANUNUZI*${missingProducts.length > 0 ? ', au *SAJILI*' : ''}.`
    : `${known}${items}${missing}\n\nReply *SALES*, *STOCK*, *PURCHASE*${missingProducts.length > 0 ? ', or *REGISTER*' : ''}.`;
}

export function stockPurchaseNeedsPrices(state: ParkedQuantityMeaning, lang: Lang): string {
  const names = state.sale.items.map((item) => `• ${item.product}: ${item.quantity.toLocaleString('en-US')}`).join('\n');
  return lang === 'sw'
    ? `Nimepata bidhaa hizi:\n${names}\n\nTaja bei ya kununua/gharama kwa kila bidhaa, mstari mmoja kwa kila bidhaa. Kama bidhaa ni mpya kabisa, niambie *SAJILI* kwanza ili tuweke pia bei ya kuuza.`
    : `I found these products:\n${names}\n\nSend the buying price/cost for each product, one product per line. If a product is brand new, tell me *REGISTER* first so we also capture its selling price.`;
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
