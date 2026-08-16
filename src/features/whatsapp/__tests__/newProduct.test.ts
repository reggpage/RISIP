import { describe, expect, it } from 'vitest';
import {
  newProductConfirmation,
  newProductOffer,
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
      });
  });

  it('takes a product with one price', () => {
    expect(parseNewProductLine('kifutio kununua 150 rejareja 250'))
      .toEqual({ product: 'kifutio', unitCost: 150, retail: 250, wholesale: null, wholesaleMinQty: null });
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
    expect(offer).toMatch(/hazipo kwenye store/);
    expect(offer).toMatch(/kununua .* rejareja/);
  });

  it('warns that a mistyped name would become a second product', () => {
    expect(newProductOffer(['biblia'], 'sw')).toMatch(/jina limekosewa/);
  });

  it('shows the margin per piece before anything is saved', () => {
    const reply = newProductConfirmation([{
      product: 'biblia', unitCost: 9000, retail: 12000, wholesale: 11000, wholesaleMinQty: 3,
    }], 'sw');
    expect(reply).toContain('kununua TSh 9,000');
    expect(reply).toContain('rejareja TSh 12,000');
    expect(reply).toContain('jumla TSh 11,000 (kuanzia 3)');
    expect(reply).toContain('faida kwa kimoja: TSh 3,000');
    expect(reply).toMatch(/NDIYO/);
  });

  it('interrupts for a price that loses money on every sale', () => {
    const reply = newProductConfirmation([{
      product: 'biblia', unitCost: 12000, retail: 12000, wholesale: null, wholesaleMinQty: null,
    }], 'sw');
    expect(reply).toMatch(/hasara/);
    expect(reply.indexOf('hasara')).toBeLessThan(reply.indexOf('NDIYO'));
  });

  it('judges the loss by the lowest price the shop would actually charge', () => {
    const reply = newProductConfirmation([{
      product: 'biblia', unitCost: 10000, retail: 12000, wholesale: 9500, wholesaleMinQty: 3,
    }], 'sw');
    expect(reply).toMatch(/hasara/);
  });
});
