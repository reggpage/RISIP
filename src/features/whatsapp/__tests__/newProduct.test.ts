import { describe, expect, it } from 'vitest';
import {
  newProductConfirmation,
  newProductQuantityQuestion,
  newProductRegistrationConfirmation,
  newProductOffer,
  newProductPricingIncomplete,
  newProductSaleOffer,
  newProductSaleWorkerBlocked,
  newProductSaved,
  parseNewProductLine,
  parseNewProductPricing,
} from '../../../../supabase/functions/_shared/whatsappNewProduct';

describe('adding a product the shop sells but Risip never heard of', () => {
  it('reads the line the offer asks for', () => {
    expect(parseNewProductLine('biblia kununua 9000 rejareja 12000 jumla 11000 kuanzia 3'))
      .toEqual({
        product: 'biblia',
        unitCost: 9000,
        retail: 12000,
        wholesale: 11000,
        wholesaleMinQty: 3,
        unit: null,
      });
  });

  it('takes a product with one price', () => {
    expect(parseNewProductLine('kifutio kununua 150 rejareja 250'))
      .toEqual({ product: 'kifutio', unitCost: 150, retail: 250, wholesale: null, wholesaleMinQty: null, unit: null });
  });

  it('takes a trade price with no threshold, for the regular customer', () => {
    expect(parseNewProductLine('mkasi kununua 2300 rejareja 3500 jumla 3200'))
      .toMatchObject({ wholesale: 3200, wholesaleMinQty: null });
  });

  it('keeps a name that is a phrase', () => {
    // "ya" and "za" are part of half the names in this shop.
    expect(parseNewProductLine('nguvu ya sala kununua 8000 rejareja 10000')?.product)
      .toBe('nguvu ya sala');
    expect(parseNewProductLine('kalamu za rangi kununua 3000 rejareja 4500')?.product)
      .toBe('kalamu za rangi');
  });

  it('keeps a digit that is part of a name', () => {
    expect(parseNewProductLine('karatasi A4 rimu kununua 11000 rejareja 14000')?.product)
      .toBe('karatasi A4 rimu');
  });

  it('reads thousands written with a dot', () => {
    expect(parseNewProductLine('kamusi kununua 18.000 rejareja 25.000')?.unitCost).toBe(18000);
  });

  it('reads several products, which is how a restock arrives', () => {
    const priced = parseNewProductPricing(
      'biblia kununua 9000 rejareja 12000\nmkasi kununua 2300 rejareja 3500');
    expect(priced.map((product) => product.product)).toEqual(['biblia', 'mkasi']);
  });
});

describe('what it must refuse', () => {
  it('refuses a line with no buying cost, because profit would be blind', () => {
    expect(parseNewProductLine('biblia rejareja 12000')).toBeNull();
  });

  it('refuses a line with no selling price, because the next sale fails the same way', () => {
    expect(parseNewProductLine('biblia kununua 9000')).toBeNull();
  });

  it('refuses a trade price above the retail one', () => {
    expect(parseNewProductLine('biblia kununua 9000 rejareja 12000 jumla 13000')).toBeNull();
  });

  it('refuses a threshold with no trade price to attach it to', () => {
    expect(parseNewProductLine('biblia kununua 9000 rejareja 12000 kuanzia 3')).toBeNull();
  });

  it('leaves ordinary messages alone', () => {
    expect(parseNewProductLine('nimeuza biblia 2')).toBeNull();
    expect(parseNewProductLine('habari za asubuhi')).toBeNull();
    expect(parseNewProductLine('')).toBeNull();
  });

  it('drops an unreadable line without taking the rest down with it', () => {
    const priced = parseNewProductPricing(
      'biblia kununua 9000 rejareja 12000\nsijui bei ya hii\nmkasi kununua 2300 rejareja 3500');
    expect(priced).toHaveLength(2);
  });
});

describe('what the shopkeeper is shown', () => {
  it('asks in one message, with an example using their own product', () => {
    const offer = newProductOffer(['biblia'], 'sw');
    expect(offer).toContain('biblia');
    // One product is named in the sentence, not listed as a bullet under a
    // plural heading: "kama ni bidhaa moja, ai ijibu kwa kutaja hiyo bidhaa".
    expect(offer).toMatch(/haipo kwenye store/);
    expect(offer).not.toMatch(/Hizi hazipo/);
    expect(offer).toMatch(/@<bei uliyonunua> nauza <bei unayouza>/);
  });

  it('warns that a mistyped name would become a second product', () => {
    expect(newProductOffer(['biblia'], 'sw')).toMatch(/jina limekosewa/);
  });

  it('says an unknown sale was not posted and will resume after registration', () => {
    const reply = newProductSaleOffer(['samaki'], 'sw');
    expect(reply).toContain('samaki');
    expect(reply).toMatch(/haipo kwenye store/);
    expect(reply).toMatch(/mauzo haya kwa muda/);
    expect(reply).toMatch(/uyathibitishe kwa \*1\*/);
  });

  it('blocks a worker clearly instead of leading them into an owner-only write', () => {
    const reply = newProductSaleWorkerBlocked(['samaki'], 'sw');
    expect(reply).toContain('samaki');
    expect(reply).toMatch(/Sijaandika mauzo haya/);
    expect(reply).toMatch(/owner au accountant/);
  });

  it('names any product whose registration prices are still missing', () => {
    expect(newProductPricingIncomplete(['samaki'], 'sw')).toMatch(/samaki/);
  });

  it('does not tell the owner to resend when the parked sale is being resumed', () => {
    const product = [{
      product: 'samaki', unitCost: 5000, retail: 7000,
      wholesale: null, wholesaleMinQty: null, unit: null,
    }];
    const reply = newProductSaved(product, 'sw', true);
    expect(reply).toMatch(/turudi kwenye bidhaa ulizonitumia awali/);
    expect(reply).not.toMatch(/andika mauzo yake kawaida/);
  });

  it('shows the margin per piece before anything is saved', () => {
    const reply = newProductConfirmation([{
      product: 'biblia', unitCost: 9000, retail: 12000, wholesale: 11000, wholesaleMinQty: 3, unit: null,
    }], 'sw');
    expect(reply).toContain('kununua TSh 9,000');
    expect(reply).toContain('rejareja TSh 12,000');
    expect(reply).toContain('jumla TSh 11,000 (kuanzia 3)');
    expect(reply).toContain('faida kwa kimoja: TSh 3,000');
    expect(reply).toContain('*1*');
    expect(reply).toMatch(/stock iliyopo/);
  });

  it('asks for opening quantity and does not pretend prices created stock', () => {
    const products = [
      { product: 'vest', unitCost: 2000, retail: 8000, wholesale: null, wholesaleMinQty: null, unit: null },
      { product: 'belt', unitCost: 3000, retail: 7000, wholesale: null, wholesaleMinQty: null, unit: null },
    ];
    const question = newProductQuantityQuestion(products, 'sw');
    expect(question).toContain('vest');
    expect(question).toContain('belt');
    expect(question).toContain('stock iliyopo sasa');
    expect(question).toContain('vipande 10');
    expect(newProductConfirmation(products, 'sw')).not.toMatch(/Niziweke kwenye store/);
  });

  it('requires a measure for an ambiguous oil product', () => {
    const question = newProductQuantityQuestion([
      { product: 'mafuta', unitCost: 5000, retail: 7000, wholesale: null, wholesaleMinQty: null, unit: null },
    ], 'sw');
    expect(question).toMatch(/kipimo hakijatajwa/);
    expect(question).toMatch(/kilo, lita, ml/);
  });

  it('shows quantity and unit in the final registration confirmation', () => {
    const reply = newProductRegistrationConfirmation([
      { product: 'mafuta', unitCost: 5000, retail: 7000, wholesale: null, wholesaleMinQty: null, unit: null },
    ], [{ product: 'mafuta', quantity: 2.5, unit: 'lita' }], 'sw');
    expect(reply).toContain('mafuta');
    expect(reply).toContain('2.5 lita');
    expect(reply).toContain('Bei na stock hizi ni sahihi');
  });

  it('interrupts for a price that loses money on every sale', () => {
    const reply = newProductConfirmation([{
      product: 'biblia', unitCost: 12000, retail: 12000, wholesale: null, wholesaleMinQty: null, unit: null,
    }], 'sw');
    expect(reply).toMatch(/hasara/);
    expect(reply.indexOf('hasara')).toBeLessThan(reply.indexOf('*1*'));
  });

  it('judges the loss by the lowest price the shop would actually charge', () => {
    const reply = newProductConfirmation([{
      product: 'biblia', unitCost: 10000, retail: 12000, wholesale: 9500, wholesaleMinQty: 3, unit: null,
    }], 'sw');
    expect(reply).toMatch(/hasara/);
  });
});

describe('the way the owner asked for it to be written', () => {
  it('reads "Kamusi @5000 nauza 10,000"', () => {
    // Their own example. "@" is how a trader writes what they paid and "nauza"
    // is how they say what they charge — far likelier to be typed than the
    // laboured "kununua … rejareja …".
    expect(parseNewProductLine('Kamusi @5000 nauza 10,000'))
      .toEqual({ product: 'Kamusi', unitCost: 5000, retail: 10000, wholesale: null, wholesaleMinQty: null, unit: null });
  });

  it('keeps a measure out of the product name', () => {
    // "sukari kwa kilo" would be a product no sale could ever match.
    expect(parseNewProductLine('Sukari @2500 nauza 3500 kwa kilo'))
      .toMatchObject({ product: 'Sukari', unit: 'kilo', unitCost: 2500, retail: 3500 });
  });

  it('keeps the Swahili purchase verb out of the product name', () => {
    expect(parseNewProductPricing(
      'vest nimenunua 2000 nauza 8000 bei ya jumla ni 6000\n'
      + 'belt nimenunua 3000 nauza 7000 bei ya jumla ni 5800',
    )).toMatchObject([
      { product: 'vest', unitCost: 2000, retail: 8000, wholesale: 6000 },
      { product: 'belt', unitCost: 3000, retail: 7000, wholesale: 5800 },
    ]);
  });

  it('reads a whole opening list in one message', () => {
    const priced = parseNewProductPricing(
      'Kamusi @5000 nauza 10000\nDaftari @1200 nauza 1500\nSukari @2500 nauza 3500 kwa kilo');
    expect(priced.map((product) => product.product)).toEqual(['Kamusi', 'Daftari', 'Sukari']);
  });
});
