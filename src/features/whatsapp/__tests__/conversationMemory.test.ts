import { describe, expect, it } from 'vitest';
import { parseBareQuantityList } from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import {
  matchHypotheticalPortionAnswer,
  parseQuantityMeaningAnswer,
  quantityMeaningQuestion,
  stockPurchaseNeedsPrices,
  wantsToRegisterNewProducts,
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
    expect(parseQuantityMeaningAnswer('(a)')).toBe('sale');
    expect(parseQuantityMeaningAnswer('sales')).toBe('sale');
    expect(parseQuantityMeaningAnswer('ni manunuzi')).toBe('stock_purchase');
    expect(parseQuantityMeaningAnswer('b')).toBe('stock_purchase');
    expect(parseQuantityMeaningAnswer('stock iliyopo')).toBe('stock_count');
    expect(parseQuantityMeaningAnswer('sawa')).toBeNull();
    expect(wantsToRegisterNewProducts('ndiyo')).toBe(true);
    expect(wantsToRegisterNewProducts('sajili')).toBe(true);
    expect(wantsToRegisterNewProducts('(c)')).toBe(true);
  });

  it('asks naturally and keeps every product on its own line', () => {
    const sale = parseBareQuantityList('birika 100\nDaftari 400\nDumu la maji 100')!;
    const state = {
      kind: 'quantity_meaning_clarification' as const,
      sourceMessageId: 'wamid-1',
      originalText: 'birika 100\nDaftari 400\nDumu la maji 100',
      sale,
    };
    const question = quantityMeaningQuestion('sw');
    expect(question).toContain('nimeuza bidhaa hizi');
    expect(question).toContain('ziongezwe kwenye zilizopo');
    expect(question).toContain('ziwekwe kwenye orodha kwanza');
    expect(question).not.toMatch(/Nimekumbuka|Kumbuka/);
    expect(stockPurchaseNeedsPrices(state, 'sw')).toContain('• birika: 100\n• Daftari: 400\n• Dumu la maji: 100');
    expect(stockPurchaseNeedsPrices(state, 'sw')).not.toMatch(/Nimekumbuka|Kumbuka|sitaikisia/);
  });

  it('names products that are not yet registered before offering to add them', () => {
    const question = quantityMeaningQuestion('sw', ['Puch', 'Dasan']);
    expect(question).toContain('*Puch*');
    expect(question).toContain('*Dasan*');
    // The wording moved from "if they are new products" to naming them as new
    // and pointing at the choice that fits: the owner asked for the question to
    // lean on what Risip can already see rather than read like a form.
    expect(question).toContain('sijaziona kwenye stoo yako — ni mpya');
    expect(question).toContain('Zikiwa mpya kweli, chagua *3*');
    expect(question).toContain('bei ya kununua na bei ya kuuza');
    expect(question).toContain('SAJILI');
    expect(question).toContain('(a)');
    expect(question).toContain('(b)');
    expect(question).toContain('(c)');
  });

  it('resolves a short portion answer against only the parked choices', () => {
    const state: HypotheticalPortionChoice = {
      kind: 'hypothetical_portion_choice', productName: 'mafuta', units: ['robo', 'nusu', 'lita'],
    };
    expect(matchHypotheticalPortionAnswer('kwa robo', state)).toBe('robo');
    expect(matchHypotheticalPortionAnswer('ndoo', state)).toBeNull();
  });
});
