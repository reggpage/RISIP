import { describe, expect, it } from 'vitest';
import {
  stockPurchaseCostCancelled,
  stockPurchaseCostChoice,
  stockPurchaseCostQuestion,
  stockPurchaseNewCostQuestion,
  type StockPurchaseCostPending,
} from '../../../../supabase/functions/_shared/whatsappStockPurchaseCost';

const pending: StockPurchaseCostPending = {
  kind: 'stock_purchase_cost_choice',
  product: 'dumu la maji',
  quantity: 10,
  unit: 'stoo',
  lastUnitCost: 5000,
  supplier: null,
  paymentMethod: null,
  occurredAt: null,
  sourceMessageId: 'message-1',
};

describe('stock purchase cost menu', () => {
  it.each([
    ['1', 'reuse'], ['a', 'reuse'], ['(a)', 'reuse'],
    ['2', 'new'], ['b', 'new'], ['(b)', 'new'],
    ['3', 'cancel'], ['c', 'cancel'], ['(c)', 'cancel'],
  ])('maps %s to %s', (answer, expected) => {
    expect(stockPurchaseCostChoice(answer)).toBe(expected);
  });

  it('does not treat an ordinary sentence as a protocol choice', () => {
    expect(stockPurchaseCostChoice('tumia bei ya mwisho')).toBeNull();
    expect(stockPurchaseCostChoice('60000')).toBeNull();
  });

  it('shows the last cost as a selectable total', () => {
    const question = stockPurchaseCostQuestion(pending, 'sw');
    expect(question).toContain('1. Tumia bei ya mwisho');
    expect(question).toContain('jumla TSh 50,000');
    expect(question).toContain('2. Weka gharama mpya');
    expect(question).toContain('3. Ghairi');
  });

  it('explains the next step for a new cost and cancellation', () => {
    expect(stockPurchaseNewCostQuestion('sw')).toContain('60000');
    expect(stockPurchaseCostCancelled('sw')).toContain('Hakuna kilichohifadhiwa');
  });
});
