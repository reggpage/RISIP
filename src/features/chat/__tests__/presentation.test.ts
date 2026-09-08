import { describe, expect, it } from 'vitest';
import { compactChoiceCopy, hasMixedChoiceInstruction, lineCalculation, reconcileMessage, replyChoices, responseSeconds, safeLink } from '../presentation';
import type { ChatMessage } from '../chat';

const question = 'punch 3, umeuza kwa bei gani?\n\n• rejareja TSh 12,000 = TSh 36,000\n• jumla TSh 11,000 = TSh 33,000\n\nChagua (a) *REJAREJA* · (b) *JUMLA* · (c) *GHAIRI*. Unaweza pia kuandika jumla kamili.';
describe('chat presentation preserves the text contract', () => {
  it('separates the quoted calculation from the quoted total without recomputing money', () => {
    expect(lineCalculation('3 × TSh 12,000 = TSh 36,000')).toEqual({ calculation: '3 × TSh 12,000', total: 'TSh 36,000' });
    expect(lineCalculation('3 × TSh 12,000 = TSh 35,999')).toEqual({ calculation: '3 × TSh 12,000', total: 'TSh 35,999' });
    expect(lineCalculation('TSh 36,000')).toBeNull();
  });
  it('offers exact price-band replies and preserves quoted amounts', () => {
    expect(replyChoices(question, 'price_band_choice')).toEqual([
      { label: 'REJAREJA', value: 'REJAREJA', detail: 'TSh 12,000 = TSh 36,000', cancel: false },
      { label: 'JUMLA', value: 'JUMLA', detail: 'TSh 11,000 = TSh 33,000', cancel: false },
      { label: 'GHAIRI', value: 'GHAIRI', detail: undefined, cancel: true },
    ]);
  });
  it('does not turn a historical price quotation or destructive confirmation into active suggestions', () => {
    expect(replyChoices(question, null)).toEqual([]);
    expect(replyChoices('Retail TSh 12,000. Wholesale TSh 11,000.', 'product_read_choice')).toEqual([]);
    expect(replyChoices('Choose (a) DELETE · (b) CANCEL.', 'account_delete_confirmation')).toEqual([]);
  });
  it('supports offered menu numbers and skip without inventing quantity or price', () => {
    expect(replyChoices('1. Duka la kwanza\n2. Duka la pili', 'business').map((c) => c.value)).toEqual(['1', '2']);
    expect(replyChoices('Andika bei tu, au andika RUKA. Ukiamua kuacha, andika GHAIRI.', 'cost_prompt').map((c) => c.value)).toEqual(['RUKA', 'GHAIRI']);
    expect(replyChoices('Umeuza kwa shilingi ngapi?', 'sale_missing_prices')).toEqual([]);
  });
  it('supports English choices with the same ordinary-message protocol', () => {
    expect(replyChoices('Choose (a) *RETAIL*, (b) *WHOLESALE*, or (c) *CANCEL*.', 'price_band_choice').map((c) => c.value)).toEqual(['RETAIL', 'WHOLESALE', 'CANCEL']);
  });
  it('removes only button-redundant choice instructions and keeps a mixed-price fallback', () => {
    const content = '1. Daftari 4, rejareja TSh 1,500 · jumla TSh 1,200 Namba hizi ni za bidhaa zenye bei mbili pekee; bidhaa zilizokwisha pimiwa juu hazihitaji jibu.\nKama zote ni bei moja, chagua (a) REJAREJA au (b) JUMLA.\nKama zimechanganyika, andika namba: 1 rejareja, 2 jumla.\nUkifanya kuacha, chagua (c) GHAIRI.';
    const choices = replyChoices('Chagua (a) REJAREJA · (b) JUMLA · (c) GHAIRI.', 'price_band_choice');
    expect(compactChoiceCopy(content, choices)).toBe('1. Daftari 4, rejareja TSh 1,500 · jumla TSh 1,200');
    expect(hasMixedChoiceInstruction(content, choices)).toBe(true);
    expect(compactChoiceCopy(content, [])).toBe(content);
  });
  const message = (id: string, role: ChatMessage['role'], time = '2026-09-08T10:00:00Z'): ChatMessage => ({ id, role, content: 'sale', created_at: time, wa_message_id: 'web:user:client', chat_day: '2026-09-08', awaiting: null, tools: [] });
  it('replaces an optimistic bubble with its durable acknowledgement, then deduplicates retries', () => {
    const acknowledged = message('server', 'user');
    const once = reconcileMessage([message('local:client', 'user')], acknowledged, 'client');
    expect(once).toEqual([acknowledged]);
    expect(reconcileMessage(once, acknowledged, 'client')).toEqual([acknowledged]);
  });
  it('measures the first answer against its own inbound turn, not another conversation', () => {
    const input = message('input', 'user'), reply = message('reply', 'assistant', '2026-09-08T10:00:04.250Z');
    const followup = message('followup', 'assistant', '2026-09-08T10:00:05Z');
    expect(responseSeconds(reply, [input, reply, followup])).toBe(4.25);
    expect(responseSeconds(followup, [input, reply, followup])).toBeNull();
    expect(responseSeconds(reply, [reply])).toBeNull();
  });
  it('never turns unsafe schemes into profile images or message links', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('data:text/html,bad')).toBeNull();
    expect(safeLink('https://risip.online/daily-records')).toBe('https://risip.online/daily-records');
  });
});
