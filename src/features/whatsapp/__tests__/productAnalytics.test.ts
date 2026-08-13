import { describe, expect, it } from 'vitest';
import {
  aggregateProducts,
  parseProductAnalyticsRequest,
  periodStart,
  productAnalyticsReply,
  rankProducts,
  type ProductSaleLine,
} from '../../../../supabase/functions/_shared/whatsappProductAnalytics';

const lines: ProductSaleLine[] = [
  { description: 'unga', quantity: 30, lineTotal: 75000, occurredAt: '2026-08-13T08:00:00Z' },
  { description: 'soda', quantity: 200, lineTotal: 200000, occurredAt: '2026-08-13T08:00:00Z' },
];

describe('WhatsApp product analytics', () => {
  it('distinguishes volume, revenue, and margin requests', () => {
    expect(parseProductAnalyticsRequest('bidhaa gani inauza zaidi?')?.rankBy).toBe('quantity');
    expect(parseProductAnalyticsRequest('which product gives me the most revenue')?.rankBy).toBe('revenue');
    expect(parseProductAnalyticsRequest('bidhaa gani ilinipa faida kubwa?')?.rankBy).toBe('margin');
  });

  it('does not steal an ordinary sale message that mentions a product', () => {
    expect(parseProductAnalyticsRequest('nimeuza bidhaa 10 kwa 3000')).toBeNull();
    expect(parseProductAnalyticsRequest('nimenunua bidhaa 300000')).toBeNull();
  });

  it('aggregates itemised sales and uses the historical cost at sale time', () => {
    const items = aggregateProducts(lines, [
      { productKey: 'unga', unitCost: 900, effectiveFrom: '2026-08-01T00:00:00Z' },
      { productKey: 'soda', unitCost: 900, effectiveFrom: '2026-08-01T00:00:00Z' },
    ]);
    expect(rankProducts(items, 'quantity')[0].product).toBe('soda');
    expect(rankProducts(items, 'revenue')[0].product).toBe('soda');
    expect(rankProducts(items, 'margin')[0]).toMatchObject({ product: 'unga', margin: 48000, costed: true });
  });

  it('does not rank an uncosted product as profitable', () => {
    const items = aggregateProducts(lines, []);
    expect(rankProducts(items, 'margin')).toEqual([]);
    const request = parseProductAnalyticsRequest('bidhaa gani ilinipa faida kubwa leo?')!;
    expect(productAnalyticsReply(request, items, 'sw')).toContain('bei ya kununua');
  });

  it('answers honestly when sales have no item lines', () => {
    const request = parseProductAnalyticsRequest('bidhaa gani inauza zaidi?')!;
    expect(productAnalyticsReply(request, [], 'sw')).toContain('Bado hujaandika');
    expect(productAnalyticsReply(request, [], 'sw')).toContain('majina ya bidhaa');
  });

  it('keeps comparison limited to the named products', () => {
    const request = parseProductAnalyticsRequest('unga au sukari ipi inauza zaidi?')!;
    expect(request.compareNames).toEqual(['unga', 'sukari']);
  });

  it('uses the Tanzania business day boundary', () => {
    const start = periodStart('today', new Date('2026-08-13T21:30:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-13T21:00:00.000Z');
  });

  it('responds in English without mixing labels', () => {
    const request = parseProductAnalyticsRequest('best selling product today')!;
    const items = aggregateProducts(lines, []);
    expect(productAnalyticsReply(request, items, 'en')).toContain('For today');
    expect(productAnalyticsReply(request, items, 'en')).not.toContain('Mauzo');
  });
});
