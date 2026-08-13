import { describe, expect, it } from 'vitest';
import {
  buildBusinessSummaryReply,
  buildDebtorsReply,
  buildProfitReply,
  calculateBusinessSummary,
  calculateDebtors,
  calculateProfitEstimate,
  parseReadRequest,
} from '../../../../supabase/functions/_shared/whatsappReadTools';

describe('A1 deterministic read-only WhatsApp tools', () => {
  it('routes supported read questions without AI', () => {
    expect(parseReadRequest('nani anadaiwa?')).toMatchObject({ tool: 'ai_debtors' });
    expect(parseReadRequest('faida ya mwezi huu')).toMatchObject({ tool: 'daily_profit_estimate', period: 'month' });
    expect(parseReadRequest('deni la Asha ni ngapi sasa?')).toMatchObject({ tool: 'ai_debtor_detail', partyName: 'asha' });
    expect(parseReadRequest('what happened today')).toMatchObject({ tool: 'ai_business_summary' });
    expect(parseReadRequest('my receipts confirmed')).toMatchObject({ tool: 'ai_my_receipts', status: 'confirmed' });
    expect(parseReadRequest('petty cash balance')).toMatchObject({ tool: 'ai_petty_cash_balance' });
    expect(parseReadRequest('ninaidai Risip?')).toMatchObject({ tool: 'ai_owed_to_me' });
    expect(parseReadRequest('random hello')).toBeNull();
  });

  it('keeps debt issued out of cash received and calculates cash movement', () => {
    const summary = calculateBusinessSummary([
      { kind: 'sale', status: 'confirmed', amount: 140000 },
      { kind: 'expense', status: 'confirmed', amount: 10000 },
      { kind: 'debt_issued', status: 'confirmed', amount: 50000 },
      { kind: 'customer_payment', status: 'confirmed', amount: 20000 },
      { kind: 'sale', status: 'voided', amount: 9000 },
    ]);
    expect(summary).toMatchObject({ sales: 140000, expenses: 10000, debtIssued: 50000, customerPayments: 20000, cashMovement: 150000 });
    expect(buildBusinessSummaryReply(summary, 'today', 'sw')).toContain('si fedha iliyopokelewa');
  });

  it('shows only open confirmed customer debts', () => {
    const debtors = calculateDebtors([
      { kind: 'debt_issued', status: 'confirmed', amount: 24000, partyName: 'Asha' },
      { kind: 'customer_payment', status: 'confirmed', amount: 10000, partyName: 'Asha' },
      { kind: 'debt_issued', status: 'confirmed', amount: 5000, partyName: 'Juma' },
      { kind: 'customer_payment', status: 'confirmed', amount: 5000, partyName: 'Juma' },
    ]);
    expect(debtors).toEqual([{ partyName: 'Asha', issued: 24000, paid: 10000, balance: 14000 }]);
    expect(buildDebtorsReply(debtors, 'sw')).toContain('14,000');
  });

  it('calculates profit from historical product costs and names missing costs', () => {
    const profit = calculateProfitEstimate(
      [{ kind: 'sale', status: 'confirmed', amount: 100000 }, { kind: 'expense', status: 'confirmed', amount: 5000 }],
      [{ description: 'unga', quantity: 10, lineTotal: 100000, occurredAt: '2026-01-01T00:00:00.000Z' }],
      [{ productKey: 'unga', unitCost: 7000, effectiveFrom: '2025-01-01T00:00:00.000Z' }],
    );
    expect(profit).toMatchObject({ cogs: 70000, costedSales: 100000, coverage: 1, estimatedProfit: 25000 });
    expect(buildProfitReply(profit, 'today', 'sw')).toContain('25,000');

    const incomplete = calculateProfitEstimate(
      [{ kind: 'sale', status: 'confirmed', amount: 100000 }],
      [{ description: 'sukari', quantity: 10, lineTotal: 100000, occurredAt: '2026-01-01T00:00:00.000Z' }],
      [],
    );
    expect(incomplete.productsMissingCost).toEqual(['sukari']);
    expect(buildProfitReply(incomplete, 'today', 'sw')).toContain('sukari');
  });
});
