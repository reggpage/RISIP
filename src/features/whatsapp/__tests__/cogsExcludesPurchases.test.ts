import { describe, expect, it } from 'vitest';
import {
  calculateProfitEstimate,
  type ReadDailyLine,
  type ReadDailyRow,
  type ReadProductCost,
} from '../../../../supabase/functions/_shared/whatsappReadTools';

/**
 * A shop bought 100 units at 8,000 and sold 3 of them at 9,500. The day's
 * summary reported a gross loss of 782,860, because every line with a price
 * was costed, including the purchase.
 *
 * The numbers below are the real ones from that report.
 */
const AT = '2026-09-08T09:00:00.000Z';

const row = (kind: string, amount: number): ReadDailyRow => ({
  kind, status: 'confirmed', amount, occurredAt: AT,
});

const line = (kind: string, description: string, quantity: number, lineTotal: number): ReadDailyLine => ({
  kind, description, quantity, lineTotal, occurredAt: AT,
});

const costs: ReadProductCost[] = [
  { productKey: 'nguvu ya sala', unitCost: 8_000, effectiveFrom: '2026-01-01T00:00:00.000Z' },
];

describe('cost of goods SOLD', () => {
  it('prices what was sold and ignores what was bought', () => {
    const estimate = calculateProfitEstimate(
      [row('sale', 28_500), row('stock_purchase', 800_000)],
      [
        line('sale', 'nguvu ya sala', 3, 28_500),
        line('stock_purchase', 'nguvu ya sala', 100, 800_000),
      ],
      costs,
    );

    // 3 sold at a cost of 8,000 each. The 100 bought are stock, not cost of sale.
    expect(estimate.cogs).toBe(24_000);
    expect(estimate.sales).toBe(28_500);
    expect(estimate.grossProfit).toBe(4_500);
  });

  // The negative control. Without the kind filter the purchase is costed too,
  // and this is the exact shape of the number the shop was shown.
  it('does not report a loss on a day that made money', () => {
    const estimate = calculateProfitEstimate(
      [row('sale', 28_500), row('stock_purchase', 800_000)],
      [
        line('sale', 'nguvu ya sala', 3, 28_500),
        line('stock_purchase', 'nguvu ya sala', 100, 800_000),
      ],
      costs,
    );
    expect(estimate.grossProfit).toBeGreaterThan(0);
    expect(estimate.cogs).not.toBe(824_000);
  });

  it('still costs a credit sale, which is a sale that has not been paid for yet', () => {
    const estimate = calculateProfitEstimate(
      [row('debt_issued', 9_500)],
      [line('debt_issued', 'nguvu ya sala', 1, 9_500)],
      costs,
    );
    expect(estimate.cogs).toBe(8_000);
    expect(estimate.grossProfit).toBe(1_500);
  });

  it('leaves coverage measuring sold lines only', () => {
    const estimate = calculateProfitEstimate(
      [row('sale', 28_500), row('stock_purchase', 800_000)],
      [
        line('sale', 'nguvu ya sala', 3, 28_500),
        line('stock_purchase', 'nguvu ya sala', 100, 800_000),
      ],
      costs,
    );
    // Every shilling of the sale had a known cost, so coverage is complete.
    expect(estimate.coverage).toBe(1);
    expect(estimate.productsMissingCost).toEqual([]);
  });
});
