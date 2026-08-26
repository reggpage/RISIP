import { describe, expect, it } from 'vitest';
import {
  parseSupplierCreditPurchase,
  parseSupplierPayment,
  parseSupplierBalanceQuestion,
} from '../../../../supabase/functions/_shared/whatsappSupplierPayables';
import { parseWholeAnimalProcurement } from '../../../../supabase/functions/_shared/whatsappWholeAnimalProcurement';

describe('supplier payables and payments', () => {
  it('parses a normal stock purchase on supplier credit without inventing a price', () => {
    expect(parseSupplierCreditPurchase('nimenunua nyama kilo 20 kwa Musa kwa deni', 'sw')).toMatchObject({
      kind: 'parsed',
      purchase: {
        supplierName: 'musa',
        amount: null,
        lines: [{ description: 'nyama', quantity: 20, unit: 'kilo' }],
      },
    });
  });

  it('clarifies when credit purchase product or quantity is missing', () => {
    expect(parseSupplierCreditPurchase('nimenunua bidhaa kwa Musa kwa mkopo', 'sw').kind)
      .toBe('missing_purchase');
  });

  it('keeps whole-animal credit in Phase 6 and leaves payment_method null', () => {
    expect(parseWholeAnimalProcurement("nimechukua ng'ombe mmoja kwa Musa kwa deni 1200000", 'sw'))
      .toMatchObject({
        kind: 'parsed',
        procurement: { animalCount: 1, purchaseTotal: 1_200_000, supplierName: 'musa', paymentMethod: null },
      });
  });

  it.each([
    ['cash', 'cash'],
    ['mpesa', 'mobile_money'],
    ['bank', 'bank'],
  ] as const)('parses supplier payment by %s', (word, method) => {
    expect(parseSupplierPayment(`nimemlipa Musa 300000 ${word}`, 'sw')).toMatchObject({
      kind: 'parsed', payment: { supplierName: 'musa', amount: 300_000, paymentMethod: method },
    });
  });

  it('asks for supplier or amount instead of guessing', () => {
    expect(parseSupplierPayment('nimelipa 300000', 'sw').kind).toBe('missing_supplier');
    expect(parseSupplierPayment('nimemlipa Musa', 'sw').kind).toBe('missing_amount');
  });

  it('never maps deni to a payment method', () => {
    expect(parseSupplierPayment('nimemlipa Musa 300000 deni', 'sw').kind).toBe('missing_amount');
  });

  it('recognizes only clear supplier-liability wording for balance reads', () => {
    expect(parseSupplierBalanceQuestion('nina deni kiasi gani kwa Musa?')).toEqual({ supplierName: 'musa' });
    expect(parseSupplierBalanceQuestion('nina deni kiasi gani kwa suppliers?')).toEqual({ supplierName: null });
    expect(parseSupplierBalanceQuestion('nani ananidai?')).toBeNull();
  });
});
