import { describe, expect, it } from 'vitest';
import {
  MAX_ASSISTANT_HISTORY_CHARS,
  MAX_ASSISTANT_HISTORY_MESSAGES,
  buildAssistantSystemPrompt,
  normalizeAssistantHistory,
} from '../../../../supabase/functions/_shared/whatsappAssistant';
import { readNumber, validateBusinessEvent } from '../../../../supabase/functions/_shared/whatsappBusinessEvent';
import {
  missingSellingPriceReply,
  productPriceComparisonReply,
} from '../../../../supabase/functions/_shared/whatsappProductPriceReads';

describe('Stage D semantic boundaries', () => {
  it('reads Tanzanian number words and grouped digits from the wording', () => {
    expect(readNumber('thelathini', null, { min: 0, max: 1_000_000 })).toEqual({
      kind: 'value', value: 30, source: 'wording', disagreed: false,
    });
    expect(readNumber('80,000', null, { min: 0, max: 100_000_000 })).toEqual({
      kind: 'value', value: 80000, source: 'digits', disagreed: false,
    });
    expect(readNumber('80,000', 80, { min: 0, max: 100_000_000 })).toMatchObject({ kind: 'ask', reason: 'disagreement' });
  });

  it('keeps quantity and total cost in one validated stock event', () => {
    const event = validateBusinessEvent({
      kind: 'stock_purchase',
      lines: [{ product_wording: 'birka', quantity_wording: 'thelathini', quantity_candidate: 30, unit_wording: null }],
      amount_wording: '300,000',
      amount_candidate: 300000,
      missing_fields: [],
    });
    expect(event?.kind).toBe('stock_purchase');
    expect(event?.lines[0]?.quantity).toMatchObject({ kind: 'value', value: 30 });
    expect(event?.amount).toMatchObject({ kind: 'value', value: 300000 });
  });

  it('keeps price ranking and missing-price reads narrow and distinct from margin', () => {
    const rows = [
      { productName: 'Velvet napkin', retailPrice: 4000 },
      { productName: 'Sodaa', retailPrice: 2000 },
      { productName: 'Birka', retailPrice: null },
    ];
    expect(productPriceComparisonReply(rows, 'lowest', 'sw')).toContain('Sodaa');
    expect(productPriceComparisonReply(rows, 'lowest', 'sw')).not.toContain('Velvet napkin —');
    expect(missingSellingPriceReply(rows, 'sw')).toContain('Birka');
    expect(missingSellingPriceReply(rows, 'sw')).not.toContain('Mauzo');
  });

  it('bounds production context and states that it is not financial authority', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `${index} ${'x'.repeat(1200)}`,
    }));
    const normalized = normalizeAssistantHistory(history);
    expect(normalized.length).toBeLessThanOrEqual(MAX_ASSISTANT_HISTORY_MESSAGES);
    expect(normalized.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(MAX_ASSISTANT_HISTORY_CHARS);
    expect(normalized[0]?.role).toBe('user');
    const prompt = buildAssistantSystemPrompt({
      identityId: 'i', profileId: 'p', companyId: 'c', companyName: 'Duka', userName: null,
      role: 'owner', lang: 'sw', approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
    });
    // The three distinctions survive; the three separate headings do not. They
    // were stated once as prose with example sentences and again as a tool
    // mapping just below, and the example sentences were teaching a Swahili
    // speaker how Swahili speakers phrase a question. What matters is that the
    // shop cannot be handed the wrong one of the three, so that is what is
    // asserted — the concept, not the heading it used to sit under.
    expect(prompt).toContain('LOSS, CHEAPEST AND MISSING PRICE ARE THREE DIFFERENT QUESTIONS');
    expect(prompt).toContain('get_product_price_comparison');
    expect(prompt).toContain('get_products_missing_selling_price');
    expect(prompt).toMatch(/metric "margin" and direction "worst"/);
    // The reasoning behind the loss rule is judgement, not vocabulary, and stays.
    expect(prompt).toMatch(/sales can exceed expenses while every kilo leaves the\s+shop at a loss/);
  });
});
