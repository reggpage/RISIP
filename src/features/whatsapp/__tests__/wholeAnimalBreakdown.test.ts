import { describe, expect, it } from 'vitest';
import {
  parseWholeAnimalBreakdown,
  parseWholeAnimalSourceChoice,
  wholeAnimalBreakdownConfirmation,
} from '../../../../supabase/functions/_shared/whatsappWholeAnimalBreakdown';

describe('whole-animal breakdown parser', () => {
  it('reads measured outputs without inventing products or cost', () => {
    expect(parseWholeAnimalBreakdown(
      "ng'ombe huyu ametoa nyama kilo 180, maini kilo 6, utumbo kilo 12, moyo kilo 2, figo kilo 1",
      'sw',
    )).toEqual({
      kind: 'parsed',
      source: { relativeDate: null, purchaseTotal: null },
      outputs: [
        { productName: 'nyama', quantity: 180, unit: 'kilo' },
        { productName: 'maini', quantity: 6, unit: 'kilo' },
        { productName: 'utumbo', quantity: 12, unit: 'kilo' },
        { productName: 'moyo', quantity: 2, unit: 'kilo' },
        { productName: 'figo', quantity: 1, unit: 'kilo' },
      ],
    });
  });

  it('keeps historical source hints separate from measured outputs', () => {
    expect(parseWholeAnimalBreakdown("ng'ombe wa jana ametoa nyama kilo 180", 'sw')).toMatchObject({
      kind: 'parsed',
      source: { relativeDate: 'yesterday', purchaseTotal: null },
    });
    expect(parseWholeAnimalBreakdown("ng'ombe wa 1200000 ametoa nyama kilo 180", 'sw')).toMatchObject({
      kind: 'parsed',
      source: { relativeDate: null, purchaseTotal: 1200000 },
    });
  });

  it('asks for a missing measured quantity or product', () => {
    expect(parseWholeAnimalBreakdown("ng'ombe ametoa nyama", 'sw')).toMatchObject({
      kind: 'missing_quantity',
      productName: 'nyama',
    });
    expect(parseWholeAnimalBreakdown("ng'ombe ametoa kilo 180", 'sw')).toMatchObject({
      kind: 'missing_product',
      quantity: 180,
      unit: 'kilo',
    });
  });

  it('does not classify mzoga as a whole-animal breakdown', () => {
    expect(parseWholeAnimalBreakdown('nimenunua mzoga kilo 30', 'sw')).toEqual({ kind: 'none' });
  });

  it('renders confirmation and validates a single source choice', () => {
    expect(wholeAnimalBreakdownConfirmation([
      { productName: 'nyama', quantity: 180, unit: 'kilo' },
    ], 'sw')).toContain('*1*');
    expect(parseWholeAnimalSourceChoice('2', 2)).toBe(1);
    expect(parseWholeAnimalSourceChoice('3', 2)).toBeNull();
    expect(parseWholeAnimalSourceChoice('HAPANA', 2)).toBeNull();
  });
});
