import { describe, expect, it } from 'vitest';
import {
  matchDeclaredSaleUnit,
  parsePortionSetupOffer,
  portionSetupConfirmation,
  resumePortionSetup,
  type DeclaredSaleUnit,
} from '../../../../supabase/functions/_shared/whatsappPortions';
import { priceLine, quantitySaleConfirmation } from '../../../../supabase/functions/_shared/whatsappQuantitySale';

describe('setting up a product sold in portions', () => {
  it('reads the owner’s oil example but does not invent conversions', () => {
    expect(parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500')).toEqual({
      kind: 'portion_setup_sizes',
      product: 'mafuta',
      purchaseUnit: 'ndoo',
      purchaseCost: 20000,
      saleUnits: [
        { unit: 'robo', retail: 700, wholesale: null, minQty: null },
        { unit: 'nusu', retail: 1200, wholesale: null, minQty: null },
        { unit: 'lita', retail: 2500, wholesale: null, minQty: null },
      ],
    });
  });

  it('keeps a multi-word soap product and a multi-word selling portion', () => {
    expect(parsePortionSetupOffer('sabuni ya mche mche @3000 nauza kipande 500 mche mzima 3000'))
      .toMatchObject({
        product: 'sabuni ya mche',
        purchaseUnit: 'mche',
        saleUnits: [{ unit: 'kipande', retail: 500 }, { unit: 'mche mzima', retail: 3000 }],
      });
  });

  it('requires every conversion to use the same stated base unit', () => {
    const draft = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500')!;
    expect(resumePortionSetup(draft, 'ndoo = 20 lita; robo = 0.25 lita; nusu = 0.5 lita; lita = 1 lita'))
      .toMatchObject({ kind: 'ready', setup: { baseUnit: 'lita', purchaseSize: 20 } });
    expect(resumePortionSetup(draft, 'ndoo = 20 lita; robo = 0.25 lita; nusu = 0.5 kilo; lita = 1 lita'))
      .toEqual({ kind: 'invalid' });
  });

  it('names a missing conversion instead of guessing it', () => {
    const draft = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500')!;
    expect(resumePortionSetup(draft, 'ndoo = 20 lita; robo = 0.25 lita; lita = 1 lita'))
      .toEqual({ kind: 'missing', units: ['nusu'] });
  });

  it('shows the real cost and margin for every portion before saving', () => {
    const draft = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500')!;
    const resumed = resumePortionSetup(draft, 'ndoo = 20 lita; robo = 0.25 lita; nusu = 0.5 lita; lita = 1 lita');
    if (resumed.kind !== 'ready') throw new Error('expected ready');
    const reply = portionSetupConfirmation(resumed.setup, 'sw');
    expect(reply).toContain('robo: 0.25 lita · TSh 700 · gharama TSh 250 · faida TSh 450');
    expect(reply).toContain('nusu: 0.5 lita · TSh 1,200 · gharama TSh 500 · faida TSh 700');
    expect(reply).toMatch(/NDIYO/);
  });
});

describe('matching a sale to a declared portion', () => {
  const units: DeclaredSaleUnit[] = [
    { productKey: 'mafuta', productName: 'mafuta', unitKey: 'robo', unitName: 'robo', baseQuantity: 0.25, retail: 700, wholesale: null, wholesaleMinQty: null },
    { productKey: 'mafuta', productName: 'mafuta', unitKey: 'nusu', unitName: 'nusu', baseQuantity: 0.5, retail: 1200, wholesale: null, wholesaleMinQty: null },
    { productKey: 'mafuta', productName: 'mafuta', unitKey: 'lita', unitName: 'lita', baseQuantity: 1, retail: 2500, wholesale: null, wholesaleMinQty: null },
  ];

  it('matches "mafuta robo" exactly and carries the stock conversion', () => {
    expect(matchDeclaredSaleUnit('mafuta robo', units)).toEqual({ kind: 'matched', unit: units[0] });
  });

  it('asks when the product is named without one of several units', () => {
    expect(matchDeclaredSaleUnit('mafuta', units)).toEqual({
      kind: 'unit_required', productName: 'mafuta', units: ['robo', 'nusu', 'lita'],
    });
  });

  it('does not fuzzy-match a write', () => {
    expect(matchDeclaredSaleUnit('maffuta robo', units)).toEqual({ kind: 'none' });
  });

  it('shows the portion in the sale arithmetic', () => {
    const line = priceLine(
      { product: 'mafuta', unit: 'robo', quantity: 3, band: null },
      { retail: 700, wholesale: null, wholesaleMinQty: null },
    )!;
    expect(quantitySaleConfirmation([line], 'sw'))
      .toContain('mafuta (robo): 3 × TSh 700 = TSh 2,100');
  });
});
