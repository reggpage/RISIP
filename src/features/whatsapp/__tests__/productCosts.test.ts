import { describe, expect, it } from 'vitest';
import {
  costConfirmation,
  costSaved,
  parseProductCost,
  productCostErrorMessage,
  productCostReply,
  validateProductCostCandidate,
} from '../../../../supabase/functions/_shared/whatsappProductCosts';

// A buying price silently changes every profit figure that follows it, so the
// parser only claims a message that plainly says it is a cost. Reading a sale as
// a cost, or the reverse, would be invisible until the numbers were already wrong.

describe('telling Risip what a product costs to buy', () => {
  it('validates an AI-interpreted cost with the same hard bounds', () => {
    expect(validateProductCostCandidate({ product: 'Nguvu ya sala', unit_cost: 7000, unit: 'kitabu' })).toEqual({
      product: 'Nguvu ya sala', unitCost: 7000, unit: 'kitabu',
    });
    expect(validateProductCostCandidate({ product: 'x', unit_cost: 7000, unit: null })).toBeNull();
    expect(validateProductCostCandidate({ product: 'Nguvu ya sala', unit_cost: -1, unit: null })).toBeNull();
  });

  it('reads the way a trader actually says it', () => {
    expect(parseProductCost('unga unanigharimu 900 kwa kilo')).toEqual({
      product: 'unga', unitCost: 900, unit: 'kilo',
    });
  });

  it('reads the other Swahili shapes', () => {
    for (const text of [
      'bei ya kununua unga ni 900 kwa kilo',
      'ninanunua unga kwa 900 kwa kilo',
      'unga gharama ya kununua 900 kwa kilo',
    ]) {
      const parsed = parseProductCost(text);
      expect(parsed?.product, text).toBe('unga');
      expect(parsed?.unitCost, text).toBe(900);
    }
  });

  it('reads English too', () => {
    expect(parseProductCost('unga buying price 900 per kilo')?.unitCost).toBe(900);
    expect(parseProductCost('cost of unga is 900')?.product).toBe('unga');
  });

  it('handles the separators people type', () => {
    expect(parseProductCost('sukari unanigharimu 2,500 kwa kilo')?.unitCost).toBe(2500);
  });

  it('keeps the unit as words, and converts nothing', () => {
    // A sack is 50 kilos in one shop and 25 in another. The unit is a label for
    // the trader to read, never something the system does arithmetic on.
    expect(parseProductCost('unga unanigharimu 45000 kwa gunia')?.unit).toBe('gunia');
    expect(parseProductCost('maziwa unanigharimu 1200 kwa lita')?.unit).toBe('lita');
  });

  it('works without a unit', () => {
    expect(parseProductCost('daftari unanigharimu 500')).toEqual({
      product: 'daftari', unitCost: 500, unit: null,
    });
  });
});

describe('what it must never claim', () => {
  it('a sale is not a cost', () => {
    expect(parseProductCost('nimeuza unga 900')).toBeNull();
    expect(parseProductCost('nimeuza unga kilo 10 kwa 2500')).toBeNull();
  });

  it('an expense is not a cost', () => {
    expect(parseProductCost('nimelipa boda 5000')).toBeNull();
    expect(parseProductCost('nimetumia 12000 kwa chakula')).toBeNull();
  });

  it('a stock purchase is not a unit cost', () => {
    // "I bought 500,000 of stock" says nothing about the price per kilo.
    expect(parseProductCost('nimenunua stock ya sukari 500000')).toBeNull();
  });

  it('a debt or a payment is not a cost', () => {
    expect(parseProductCost('Asha amechukua mafuta kwa mkopo 18000')).toBeNull();
    expect(parseProductCost('Asha amelipa 10000')).toBeNull();
  });

  it('refuses a price of zero or nonsense', () => {
    expect(parseProductCost('unga unanigharimu 0 kwa kilo')).toBeNull();
    expect(parseProductCost('unga unanigharimu ngapi kwa kilo')).toBeNull();
  });

  it('refuses a product name that is only digits', () => {
    expect(parseProductCost('900 unanigharimu 900')).toBeNull();
  });

  it('ignores ordinary talk', () => {
    expect(parseProductCost('habari za asubuhi')).toBeNull();
    expect(parseProductCost('nani ananidai?')).toBeNull();
  });
});

describe('the confirmation says which business and what it was', () => {
  const cost = { product: 'unga', unitCost: 1100, unit: 'kilo' };

  it('names the business, because the wrong shop is the failure mode', () => {
    const text = costConfirmation(cost, 'Duka la Asha', null, 'sw');
    expect(text).toContain('Duka la Asha');
    expect(text).toContain('1,100');
    expect(text).toMatch(/NDIYO/);
  });

  it('shows the old price rather than just saying saved', () => {
    const text = costConfirmation(cost, 'Duka la Asha', 900, 'sw');
    expect(text).toContain('900');
    expect(text).toContain('1,100');
  });

  it('says nothing about a previous price when there is none', () => {
    expect(costConfirmation(cost, 'Duka la Asha', null, 'sw')).not.toMatch(/Ilikuwa/);
  });

  it('answers in the language it was asked in', () => {
    expect(costConfirmation(cost, 'Asha Shop', 900, 'en')).toMatch(/Is that right\? YES \/ NO/);
  });

  it('tells them what it unlocked', () => {
    expect(costSaved(cost, 'Duka la Asha', 'sw')).toMatch(/faida/);
    expect(costSaved(cost, 'Asha Shop', 'en')).toMatch(/estimate profit/);
  });

  it('maps database hints to friendly copy without exposing raw errors', () => {
    const raw = { hint: 'not_authorized', message: 'only the owner may set a buying price' };
    expect(productCostErrorMessage(raw, 'sw')).toContain('owner au accountant');
    expect(productCostErrorMessage(raw, 'sw')).not.toContain(raw.message);
    expect(productCostErrorMessage({ message: 'secret database detail' }, 'en')).not.toContain('secret database detail');
  });
});

describe('reading a saved buying cost', () => {
  it('shows the latest cost, unit and effective date without recalculating it', () => {
    const reply = productCostReply('unga', {
      productName: 'Unga', unitCost: 2500, unit: 'kilo', currency: 'TZS', effectiveFrom: '2026-08-13T12:00:00Z',
    }, 'sw');
    expect(reply).toContain('TSh 2,500 kwa kilo');
    expect(reply).toContain('2026');
  });

  it('states honestly when no cost exists', () => {
    expect(productCostReply('unga', null, 'sw')).toContain('hakuna bei ya kununua');
    expect(productCostReply('flour', null, 'en')).toContain('no saved buying cost');
  });
});

describe('a supplier price reported out loud', () => {
  it('reads "unga sasa ni 1100 kwa kilo" as the new buying cost', () => {
    expect(parseProductCost('unga sasa ni 1100 kwa kilo'))
      .toEqual({ product: 'unga', unitCost: 1100, unit: 'kilo' });
  });

  it('requires the unit, so an ordinary sentence is never filed as a cost', () => {
    // Without "kwa <kipimo>" this would file the buying cost of a product
    // called "faida", and every margin after it would be wrong.
    expect(parseProductCost('faida sasa ni 5000')).toBeNull();
    expect(parseProductCost('mauzo sasa ni 200000')).toBeNull();
  });
});
