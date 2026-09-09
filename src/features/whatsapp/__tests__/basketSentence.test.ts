import { describe, expect, it } from 'vitest';
import { basketSentence, type BasketLine } from '../../chat/chat';
import { chatEnglish, chatSwahili } from '../../../i18n/chat';

/**
 * Scanning a whole basket has to arrive at the assistant as an ordinary
 * sentence, because that is the only door with the confirmation, the guards
 * and the ledger behind it. A second, tidier path would be a second Risip.
 */
const line = (name: string, quantity: number, price: number | null = null): BasketLine =>
  ({ productKey: name.toLowerCase(), name, quantity, price });

describe('turning a scanned basket into one sentence', () => {
  it('sends a single product the way it always did', () => {
    expect(basketSentence(chatSwahili, [line('Biblia', 2)])).toBe('Nimeuza "Biblia" 2');
  });

  it('joins several products into one sale', () => {
    const text = basketSentence(chatSwahili, [line('Biblia', 2), line('daftari', 3), line('kalamu', 10)]);
    expect(text).toBe('Nimeuza "Biblia" 2 na "daftari" 3 na "kalamu" 10');
    // The verb leads once, not once per product.
    expect(text.match(/Nimeuza/g)).toHaveLength(1);
  });

  it('states the price only where the shopkeeper had to choose one', () => {
    const text = basketSentence(chatSwahili, [line('Biblia', 12, 9500), line('daftari', 1)]);
    expect(text).toBe('Nimeuza "Biblia" 12 kila moja 9500 na "daftari" 1');
  });

  it('writes the price as plain digits, never grouped', () => {
    // "1,020,000" would read as three numbers to anything parsing the sentence.
    expect(basketSentence(chatSwahili, [line('vest', 2, 1020000)])).toContain('kila moja 1020000');
  });

  it('works in English too', () => {
    expect(basketSentence(chatEnglish, [line('Bible', 2), line('pen', 5)])).toBe('I sold "Bible" 2 and "pen" 5');
  });

  // The negative controls. A basket that cannot be trusted must not be sent.
  it('refuses an empty basket', () => {
    expect(() => basketSentence(chatSwahili, [])).toThrow('empty_basket');
  });

  it('refuses a quantity of zero or less', () => {
    expect(() => basketSentence(chatSwahili, [line('Biblia', 0)])).toThrow('invalid_quantity');
    expect(() => basketSentence(chatSwahili, [line('Biblia', 2), line('daftari', -1)])).toThrow('invalid_quantity');
  });

  it('refuses a quantity that is not a number', () => {
    expect(() => basketSentence(chatSwahili, [line('Biblia', Number.NaN)])).toThrow('invalid_quantity');
  });

  it('keeps the same product twice when the two lines were sold at different prices', () => {
    const text = basketSentence(chatSwahili, [line('Biblia', 3, 11000), line('Biblia', 20, 9500)]);
    expect(text).toBe('Nimeuza "Biblia" 3 kila moja 11000 na "Biblia" 20 kila moja 9500');
  });
});
