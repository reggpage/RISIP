import { describe, expect, it } from 'vitest';
import {
  matchDeclaredSaleUnit,
  matchPortionMissingQuantity,
  parsePortionQuantityAnswer,
  parsePortionSetupOffer,
  portionSizeQuestion,
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

  it('reads a natural measured-stock setup and derives only the stated per-kilo cost', () => {
    expect(parsePortionSetupOffer(
      'store Nyama ya ngombe kilo 10 nimenunua kwa 100,000, robo nauza 6000, nusu nauza 12,000, kilo nauza 22,000',
    )).toEqual({
      kind: 'portion_setup_sizes',
      product: 'Nyama ya ngombe',
      purchaseUnit: 'kilo',
      purchaseCost: 10000,
      saleUnits: [
        { unit: 'robo', retail: 6000, wholesale: null, minQty: null },
        { unit: 'nusu', retail: 12000, wholesale: null, minQty: null },
        { unit: 'kilo', retail: 22000, wholesale: null, minQty: null },
      ],
    });
  });

  it('accepts the exact WhatsApp punctuation variants without dropping portion prices', () => {
    const noDelimiter = parsePortionSetupOffer(
      'store Nyama ya ngombe kilo 10 nimenunua kwa 100,000 robo nauza 6000, nusu nauza 12,000 kilo nauza 22,000',
    );
    const tightComma = parsePortionSetupOffer(
      'store Nyama ya ngombe kilo 10 nimenunua kwa 100000,robo nauza 6000, nusu nauza 12,000, kilo nauza 22,000',
    );
    for (const parsed of [noDelimiter, tightComma]) {
      expect(parsed).toMatchObject({
        kind: 'portion_setup_sizes', product: 'Nyama ya ngombe', purchaseCost: 10000,
      });
      expect(parsed?.saleUnits.map((unit) => [unit.unit, unit.retail])).toEqual([
        ['robo', 6000], ['nusu', 12000], ['kilo', 22000],
      ]);
    }
  });

  it('shows sensible kilo examples but still asks the owner to confirm every conversion', () => {
    const draft = parsePortionSetupOffer(
      'nyama ya ngombe kilo 10 nimenunua kwa 100000, robo nauza 6000, nusu nauza 12000, kilo nauza 22000',
    )!;
    const question = portionSizeQuestion(draft, 'sw');
    // "kilo = 1 kilo" used to be in here. It asked the shop to tell Risip that
    // a kilo is a kilo, which is what made the whole template read as garbled.
    expect(question).not.toContain('kilo = 1 kilo');
    expect(question).toContain('robo = 0.25 kilo');
    expect(question).toContain('nusu = 0.5 kilo');
    expect(question).toContain('Huu ni mfano tu');
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

  it('parks an exact known product and portion when only quantity is missing', () => {
    expect(matchPortionMissingQuantity('mafuta robo', units)).toEqual({
      kind: 'portion_quantity_prompt', productName: 'mafuta', unitName: 'robo',
    });
    expect(matchPortionMissingQuantity('nimeuza mafuta nusu', units)).toEqual({
      kind: 'portion_quantity_prompt', productName: 'mafuta', unitName: 'nusu',
    });
  });

  it('does not guess a typo or intercept a sale that already has a quantity', () => {
    expect(matchPortionMissingQuantity('maffuta robo', units)).toBeNull();
    expect(matchPortionMissingQuantity('mafuta robo 3', units)).toBeNull();
  });

  it('accepts a short positive quantity to resume the exact parked portion', () => {
    expect(parsePortionQuantityAnswer('3')).toBe(3);
    expect(parsePortionQuantityAnswer('robo 3')).toBe(3);
    expect(parsePortionQuantityAnswer('0')).toBeNull();
    expect(parsePortionQuantityAnswer('mafuta mengine')).toBeNull();
  });
});

describe('a template a shopkeeper can actually fill in', () => {
  it('refuses an offer whose unit name is a piece of a sentence', () => {
    // MEASURED FAILURE: this produced a unit called "ndoo ni lita" and a form
    // that read "ndoo ni lita = 0.25 lita". Refused outright — a portion setup
    // built on a misread name would misprice every future sale of it.
    expect(parsePortionSetupOffer('mafuta ndoo @20000 nauza ndoo ni lita 20 robo 700 nusu 1200')).toBeNull();
    expect(parsePortionSetupOffer('mafuta ndoo @20000 nauza robo ya lita 700 nusu 1200')).toBeNull();
  });

  it('still reads the plain form', () => {
    const draft = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500')!;
    expect(draft.saleUnits.map((unit) => unit.unit)).toEqual(['robo', 'nusu', 'lita']);
    expect(portionSizeQuestion(draft, 'sw')).toContain('ndoo = 20 lita');
  });

  it('never asks how many kilos are in a kilo', () => {
    const draft = parsePortionSetupOffer(
      'store nyama ya ngombe kilo 10 nimenunua kwa 100,000, robo nauza 6,000, nusu nauza 12,000, kilo nauza 22,000')!;
    const asked = portionSizeQuestion(draft, 'sw');
    expect(asked).not.toContain('kilo = 1 kilo');
    expect(asked).toContain('robo = 0.25 kilo');
  });

  it('accepts the answer that leaves out the tautology', () => {
    const draft = parsePortionSetupOffer(
      'store nyama ya ngombe kilo 10 nimenunua kwa 100,000, robo nauza 6,000, nusu nauza 12,000, kilo nauza 22,000')!;
    const resumed = resumePortionSetup(draft, 'robo = 0.25 kilo; nusu = 0.5 kilo');
    expect(resumed.kind).toBe('ready');
    if (resumed.kind !== 'ready') return;
    expect(resumed.setup.purchaseSize).toBe(1);
    expect(resumed.setup.baseUnit).toBe('kilo');
    // 100,000 for 10 kilo is 10,000 a kilo, and a quarter costs 2,500.
    expect(resumed.setup.purchaseCost).toBe(10000);
    const confirmation = portionSetupConfirmation(resumed.setup, 'sw');
    expect(confirmation).not.toMatch(/kilo 1 = 1 kilo/);
    expect(confirmation).toContain('TSh 10,000 kwa kilo');
  });

  it('still refuses an answer that leaves a real unit out', () => {
    const draft = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500')!;
    const resumed = resumePortionSetup(draft, 'robo = 0.25 lita; nusu = 0.5 lita; lita = 1 lita');
    expect(resumed.kind).toBe('missing');
    if (resumed.kind === 'missing') expect(resumed.units).toEqual(['ndoo']);
  });
});
