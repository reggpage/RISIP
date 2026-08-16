import { describe, expect, it } from 'vitest';
import { parseBareQuantityList } from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import {
  matchHypotheticalPortionAnswer,
  parseQuantityMeaningAnswer,
  type HypotheticalPortionChoice,
} from '../../../../supabase/functions/_shared/whatsappConversationMemory';

describe('short WhatsApp follow-up memory', () => {
  it('parks a bare multi-product quantity list without guessing its meaning', () => {
    const parsed = parseBareQuantityList('kitabu cha hesabu 7, biblia 3, nguvu ya sala 20');
    expect(parsed?.items).toEqual([
      { product: 'kitabu cha hesabu', quantity: 7, band: null },
      { product: 'biblia', quantity: 3, band: null },
      { product: 'nguvu ya sala', quantity: 20, band: null },
    ]);
  });

  it('resumes sale and purchase meanings but does not guess vague chat', () => {
    expect(parseQuantityMeaningAnswer('ni mauzo')).toBe('sale');
    expect(parseQuantityMeaningAnswer('sales')).toBe('sale');
    expect(parseQuantityMeaningAnswer('ni manunuzi')).toBe('stock_purchase');
    expect(parseQuantityMeaningAnswer('sawa')).toBeNull();
  });

  it('resolves a short portion answer against only the parked choices', () => {
    const state: HypotheticalPortionChoice = {
      kind: 'hypothetical_portion_choice', productName: 'mafuta', units: ['robo', 'nusu', 'lita'],
    };
    expect(matchHypotheticalPortionAnswer('kwa robo', state)).toBe('robo');
    expect(matchHypotheticalPortionAnswer('ndoo', state)).toBeNull();
  });
});
