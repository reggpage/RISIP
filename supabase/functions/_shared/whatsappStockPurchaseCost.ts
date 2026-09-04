import type { Lang } from './whatsappIntent.ts';

export type StockPurchaseCostPending = {
  kind: 'stock_purchase_cost_choice' | 'stock_purchase_cost_amount';
  product: string;
  quantity: number;
  unit: string | null;
  lastUnitCost: number;
  supplier: string | null;
  paymentMethod: string | null;
  occurredAt: string | null;
  sourceMessageId: string;
};

export type StockPurchaseCostChoice = 'reuse' | 'new' | 'cancel';

/**
 * These are protocol answers to a menu Risip just printed. They are deliberately
 * closed and exact: ordinary sentences remain AI input, while 1/2/3 and a/b/c
 * let a shopkeeper answer a narrow choice without typing a sentence.
 */
export function stockPurchaseCostChoice(text: string | null | undefined): StockPurchaseCostChoice | null {
  const value = String(text ?? '').trim().toLocaleLowerCase('sw-TZ');
  if (value === '1' || value === 'a' || value === '(a)') return 'reuse';
  if (value === '2' || value === 'b' || value === '(b)') return 'new';
  if (value === '3' || value === 'c' || value === '(c)') return 'cancel';
  return null;
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

export function stockPurchaseCostQuestion(pending: StockPurchaseCostPending, lang: Lang): string {
  const each = money(pending.lastUnitCost);
  const total = money(pending.lastUnitCost * pending.quantity);
  const unit = pending.unit ? ` ${pending.unit}` : '';
  if (lang === 'sw') {
    return `*${pending.product}* ${pending.quantity}${unit} — chagua gharama ya mzigo huu:\n\n`
      + `1. Tumia bei ya mwisho — ${each} kila moja (jumla ${total})\n`
      + '2. Weka gharama mpya\n'
      + '3. Ghairi\n\n'
      + 'Jibu kwa *1*, *2* au *3*.';
  }
  return `*${pending.product}* ${pending.quantity}${unit} — choose the cost for this stock:\n\n`
    + `1. Use the last cost — ${each} each (total ${total})\n`
    + '2. Enter a new cost\n'
    + '3. Cancel\n\n'
    + 'Reply with *1*, *2* or *3*.';
}

export function stockPurchaseNewCostQuestion(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa. Andika jumla ya gharama mpya ya mzigo huu kwa tarakimu, mfano *60000*.'
    : 'Okay. Write the new total cost of this stock in digits, for example *60000*.';
}

export function stockPurchaseCostCancelled(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa, sijaingiza mzigo huu. Hakuna kilichohifadhiwa.'
    : 'Okay, I did not record this stock arrival. Nothing was saved.';
}
