import { describe, expect, it } from 'vitest';
import { formatDailySummary } from '../../../../supabase/functions/_shared/whatsappDailySummary';

describe('daily summary presentation', () => {
  it('shows a clean Swahili report with items, totals, profit and stock alerts', () => {
    const text = formatDailySummary({
      businessName: 'St. Ritha bookshop', dateLabel: 'Jumanne, 2 Septemba 2026',
      sales: 8_000, cogs: 4_000, expenses: 1_000, profit: 3_000,
      salesItems: [{ name: 'Daftari', quantity: 2, unitPrice: 2_000, total: 4_000 }],
      expenseItems: [{ name: 'Usafiri', quantity: 1, unitPrice: null, total: 1_000 }],
      outOfStock: [{ name: 'Kalamu', quantity: 0 }],
      lowStock: [{ name: 'Maji', quantity: 3 }], records: 3,
    }, 'sw');

    expect(text).toContain('*Muhtasiri wa leo*');
    expect(text).toContain('Hii ni taarifa ya leo katika biashara yako.');
    expect(text).toContain('Daftari 2 × TSh 2,000 = *TSh 4,000*');
    expect(text).toContain('*Jumla ya mauzo: TSh 8,000*');
    expect(text).toContain('*Faida ya leo: TSh 3,000*');
    expect(text).toContain('Kalamu* — imeisha');
    expect(text).toContain('Maji* — inakaribia kuisha');
    expect(text).toContain('*🤖 Uchambuzi wa siku*');
  });

  it('labels a historical day with its own date instead of calling it today', () => {
    const text = formatDailySummary({
      businessName: 'St. Ritha bookshop', dateLabel: 'Alhamisi, 3 Septemba 2026', isToday: false,
      sales: 10_000, cogs: 4_000, expenses: 0, profit: 6_000,
      salesItems: [], expenseItems: [], outOfStock: [], lowStock: [], records: 1,
    }, 'sw');

    expect(text).toContain('*Muhtasiri wa Alhamisi, 3 Septemba 2026*');
    expect(text).toContain('Hii ni taarifa ya Alhamisi, 3 Septemba 2026 katika biashara yako.');
    expect(text).not.toContain('Muhtasiri wa leo');
    expect(text).not.toContain('taarifa ya leo');
    expect(text).toContain('*Faida ya siku: TSh 6,000*');
  });
});
