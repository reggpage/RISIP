import { describe, expect, it } from 'vitest';
import {
  parseSellingPriceBatch,
  sellingPriceBatchConfirmation,
  sellingPriceBatchCostWarnings,
} from '../../../../supabase/functions/_shared/whatsappSellingPriceBatch';

const list = (...lines: string[]) => lines.join('\n');

describe('a whole price list in one message', () => {
  it('reads a pasted list', () => {
    const batch = parseSellingPriceBatch(list(
      'daftari rejareja 1500 jumla 1300 kuanzia 12',
      'kalamu rejareja 500',
      'nguvu ya sala rejareja 10000 jumla 9000 kuanzia 5',
    ));
    expect(batch?.prices).toEqual([
      { product: 'daftari', retail: 1500, wholesale: 1300, minQty: 12 },
      { product: 'kalamu', retail: 500, wholesale: null, minQty: null },
      { product: 'nguvu ya sala', retail: 10000, wholesale: 9000, minQty: 5 },
    ]);
    expect(batch?.unreadable).toEqual([]);
  });

  it('survives numbering and bullets, which is how people paste', () => {
    const batch = parseSellingPriceBatch(list('1. daftari rejareja 1500', '2. kalamu rejareja 500'));
    expect(batch?.prices.map((price) => price.product)).toEqual(['daftari', 'kalamu']);
  });

  it('lets a correction further down the list win', () => {
    const batch = parseSellingPriceBatch(list(
      'daftari rejareja 1500', 'kalamu rejareja 500', 'daftari rejareja 1600',
    ));
    expect(batch?.prices).toContainEqual({ product: 'daftari', retail: 1600, wholesale: null, minQty: null });
    expect(batch?.prices).toHaveLength(2);
  });

  it('names a line it could not read instead of dropping it', () => {
    // A wholesale price above retail is a typo, and it must be seen.
    const batch = parseSellingPriceBatch(list(
      'daftari rejareja 1500',
      'kalamu rejareja 500 jumla 900',
      'penseli rejareja 300',
    ));
    expect(batch?.prices).toHaveLength(2);
    expect(batch?.unreadable).toEqual(['kalamu rejareja 500 jumla 900']);
  });
});

describe('what it must never take', () => {
  it('leaves a buying-price list alone', () => {
    expect(parseSellingPriceBatch(list(
      'bei ya kununua daftari ni 1200', 'bei ya kununua kalamu ni 300',
    ))).toBeNull();
  });

  it('leaves sales alone', () => {
    expect(parseSellingPriceBatch(list('nimeuza daftari 5 kwa 7500', 'nimeuza kalamu 3 kwa 1500'))).toBeNull();
  });

  it('will not act on a single price', () => {
    expect(parseSellingPriceBatch('daftari rejareja 1500')).toBeNull();
  });
});

describe('noticing a price that loses money', () => {
  const costs = new Map([['daftari', 1200], ['kalamu', 300], ['nguvu ya sala', 8000]]);

  it('names a retail price under the buying cost', () => {
    const warning = sellingPriceBatchCostWarnings(
      [{ product: 'daftari', retail: 1000, wholesale: null, minQty: null }], costs, 'sw');
    expect(warning).toContain('daftari: unauza TSh 1,000, unanunua TSh 1,200');
    expect(warning).toMatch(/hasara/);
  });

  it('judges by the lowest price the shop would actually charge', () => {
    // Retail clears the cost, the trade price does not — and the trade price is
    // the one a regular customer gets.
    const warning = sellingPriceBatchCostWarnings(
      [{ product: 'nguvu ya sala', retail: 10000, wholesale: 7500, minQty: 5 }], costs, 'sw');
    expect(warning).toContain('unauza TSh 7,500');
  });

  it('says nothing about a healthy price', () => {
    expect(sellingPriceBatchCostWarnings(
      [{ product: 'daftari', retail: 1500, wholesale: 1300, minQty: 12 }], costs, 'sw')).toBe('');
  });

  it('says nothing about a product whose cost it does not know', () => {
    expect(sellingPriceBatchCostWarnings(
      [{ product: 'mkasi', retail: 1, wholesale: null, minQty: null }], costs, 'sw')).toBe('');
  });

  it('does not tell anybody they were wrong', () => {
    const warning = sellingPriceBatchCostWarnings(
      [{ product: 'daftari', retail: 1000, wholesale: null, minQty: null }], costs, 'sw');
    expect(warning).toMatch(/Kama ni makusudi, sawa/);
  });
});

describe('what the trader is shown', () => {
  it('lists every price back before saving anything', () => {
    const batch = parseSellingPriceBatch(list(
      'daftari rejareja 1500 jumla 1300 kuanzia 12', 'kalamu rejareja 500'))!;
    const reply = sellingPriceBatchConfirmation(batch, 'sw');
    expect(reply).toContain('1. daftari — TSh 1,500 · jumla TSh 1,300 (kuanzia 12)');
    expect(reply).toContain('2. kalamu — TSh 500');
    expect(reply).toMatch(/NDIYO/);
  });

  it('shows the unreadable lines before the question', () => {
    const batch = parseSellingPriceBatch(list(
      'daftari rejareja 1500', 'kalamu rejareja 500 jumla 900', 'penseli rejareja 300'))!;
    const reply = sellingPriceBatchConfirmation(batch, 'sw');
    expect(reply).toContain('kalamu rejareja 500 jumla 900');
    expect(reply.indexOf('kalamu rejareja 500 jumla 900')).toBeLessThan(reply.indexOf('NDIYO'));
  });
});
