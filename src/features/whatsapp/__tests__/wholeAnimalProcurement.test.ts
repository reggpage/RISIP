import { describe, expect, it } from 'vitest';
import {
  parseWholeAnimalProcurement,
  wholeAnimalProcurementConfirmation,
} from '../../../../supabase/functions/_shared/whatsappWholeAnimalProcurement';
import { resolveTransactionDate } from '../../../../supabase/functions/_shared/whatsappDateRange';

describe('whole-animal procurement', () => {
  it('reads one whole cow paid in cash without inventing any outputs', () => {
    const result = parseWholeAnimalProcurement(
      "nimenunua ng'ombe mzima mmoja kwa 1200000 cash",
      'sw',
    );
    expect(result).toEqual({
      kind: 'parsed',
      procurement: {
        animalType: "ng'ombe",
        animalCount: 1,
        purchaseTotal: 1_200_000,
        supplierName: null,
        paymentMethod: 'cash',
        reference: null,
        note: null,
      },
    });
    if (result.kind !== 'parsed') return;
    expect(wholeAnimalProcurementConfirmation(result.procurement, null, 'sw'))
      .toContain('Hii haijaongeza kilo za nyama au bidhaa nyingine.');
  });

  it('reads two cows and treats the stated amount as the transaction total', () => {
    expect(parseWholeAnimalProcurement("nimenunua ng'ombe 2 kwa 2500000 bank", 'sw'))
      .toMatchObject({
        kind: 'parsed',
        procurement: { animalCount: 2, purchaseTotal: 2_500_000, paymentMethod: 'bank' },
      });
  });

  it('keeps yesterday as transaction context for the server-owned date resolver', () => {
    const text = "jana nimenunua ng'ombe mzima 1 kwa 1100000";
    expect(parseWholeAnimalProcurement(text, 'sw')).toMatchObject({
      kind: 'parsed', procurement: { purchaseTotal: 1_100_000 },
    });
    const date = resolveTransactionDate(text, new Date('2026-08-25T09:00:00.000Z'));
    expect(date.kind).toBe('historical');
    // 24 August at Tanzania midnight is 23 August 21:00 UTC.
    if (date.kind === 'historical') expect(date.occurredAt).toBe('2026-08-23T21:00:00.000Z');
  });

  it('asks for missing quantity and cost instead of inventing them', () => {
    expect(parseWholeAnimalProcurement("nimenunua ng'ombe", 'sw')).toEqual({
      kind: 'missing',
      missing: ['quantity', 'cost'],
      question: "Ng'ombe wangapi, na jumla ya ununuzi ni TSh ngapi?",
    });
  });

  it('does not globally turn mzoga into a whole animal', () => {
    expect(parseWholeAnimalProcurement('nimenunua mzoga', 'sw')).toEqual({ kind: 'none' });
  });

  it('refuses to fake supplier-credit accounting', () => {
    const result = parseWholeAnimalProcurement(
      "nimechukua ng'ombe mmoja kwa supplier kwa deni",
      'sw',
    );
    expect(result.kind).toBe('supplier_credit');
    if (result.kind === 'supplier_credit') expect(result.question).toContain('deni la supplier');
  });

  it('preserves a supplied supplier name and mobile-money method', () => {
    expect(parseWholeAnimalProcurement(
      "nimenunua ng'ombe 1 kutoka kwa Juma kwa 1200000 mpesa",
      'sw',
    )).toMatchObject({
      kind: 'parsed',
      procurement: { supplierName: 'juma', paymentMethod: 'mobile_money' },
    });
  });
});
