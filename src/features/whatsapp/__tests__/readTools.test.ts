import { describe, expect, it } from 'vitest';
import { WHATSAPP_RECEIPTS_ENABLED } from '../../../../supabase/functions/_shared/whatsappReadTools';
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
    // Receipts, petty cash and reimbursements are switched off over WhatsApp
    // for now — a duka has none of them. The phrasings stay asserted so that
    // flipping WHATSAPP_RECEIPTS_ENABLED back on is a one-line change with the
    // coverage already in place.
    if (WHATSAPP_RECEIPTS_ENABLED) {
      expect(parseReadRequest('my receipts confirmed')).toMatchObject({ tool: 'ai_my_receipts', status: 'confirmed' });
      expect(parseReadRequest('petty cash balance')).toMatchObject({ tool: 'ai_petty_cash_balance' });
      expect(parseReadRequest('ninaidai Risip?')).toMatchObject({ tool: 'ai_owed_to_me' });
    } else {
      expect(parseReadRequest('my receipts confirmed')).toBeNull();
      expect(parseReadRequest('petty cash balance')).toBeNull();
      expect(parseReadRequest('ninaidai Risip?')).toBeNull();
    }
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
    // paidSales, not cashSales. MEASURED: the owner's screen read
    // "Cash: TSh 3,121,150" above "Njia: cash TSh 0", because the first figure
    // was every sale not on credit and the second was the payment methods
    // actually recorded — nearly all of them NULL. Credit status and payment
    // method are two different dimensions and this one is the former.
    expect(summary).toMatchObject({ sales: 190000, paidSales: 140000, expenses: 10000, debtIssued: 50000, customerPayments: 20000, cashMovement: 150000 });
    expect(summary).not.toHaveProperty('cashSales');
    const prose = buildBusinessSummaryReply(summary, 'today', 'sw');
    // The PARENTHETICAL is gone — the owner asked for it removed, and it was
    // answering a question nobody had asked. What it protected is not: paid and
    // credit are still two separate figures on the line, which IS the
    // separation rather than a sentence about it.
    expect(prose).toContain('Yaliyolipwa: TSh 140,000');
    expect(prose).toContain('Mkopo: TSh 50,000');
    expect(prose).not.toContain('si fedha iliyopokelewa');
    expect(prose).not.toMatch(/\bCash:/);
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

describe('phrasings the eval set caught on its first run', () => {
  const tool = (said: string) => parseReadRequest(said)?.tool ?? null;

  it('reads a summary asked about any period, not only today', () => {
    expect(tool('mauzo ya wiki hii')).toBe('ai_business_summary');
    expect(tool('cash movement ya leo')).toBe('ai_business_summary');
    expect(tool('show spend trend this year')).toBe('ai_business_summary');
    expect(tool('leo nimepata kiasi gani?')).toBe('ai_business_summary');
  });

  it('reads receipts asked for with an adjective in the middle', () => {
    // "my confirmed receipts" never contained the exact phrase "my receipts".
    expect(tool('show my confirmed receipts')).toBe(WHATSAPP_RECEIPTS_ENABLED ? 'ai_my_receipts' : null);
  });

  it('reads what Risip owes the person, said in English', () => {
    expect(tool('what does Risip owe me')).toBe(WHATSAPP_RECEIPTS_ENABLED ? 'ai_owed_to_me' : null);
  });

  it('reads a debt question written with typos', () => {
    expect(tool('nani ananidwa pesa')).toBe('ai_debtors');
  });

  it('reads a question about one debtor being late', () => {
    const request = parseReadRequest('Juma ana siku ngapi hajalipa?');
    expect(request?.tool).toBe('ai_debtor_detail');
    expect(request?.partyName).toBe('juma');
  });

  it('reads a loss question as a profit estimate', () => {
    expect(tool('nimepoteza pesa mwezi huu?')).toBe('daily_profit_estimate');
    expect(tool('nimepoteza pesa kwa kununua stock')).toBe('daily_profit_estimate');
  });

  it('routes Phase 9 operational reports deterministically', () => {
    expect(tool('nyama iliyoharibika leo ni kilo ngapi?')).toBe('ai_stock_loss');
    expect(tool('nimechukua stock nyumbani mwezi huu')).toBe('ai_owner_use');
    expect(tool('ngombe wangapi nimenunua mwezi huu?')).toBe('ai_whole_animals');
    expect(tool('ngombe gani bado hajafanyiwa breakdown?')).toBe('ai_whole_animals');
  });
});
