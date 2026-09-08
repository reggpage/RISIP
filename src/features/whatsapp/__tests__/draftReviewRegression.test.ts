import { afterEach, describe, expect, it, vi } from 'vitest';
import { runConversationalAssistant, type AssistantIdentityContext } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { describePending } from '../../../../supabase/functions/_shared/whatsappClarification';
import { pendingConversationContext } from '../../../../supabase/functions/_shared/whatsappPendingContext';

const context: AssistantIdentityContext = { identityId: 'i', profileId: 'p', companyId: 'c', companyName: 'Test shop', userName: 'Test', role: 'owner', lang: 'sw', approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false };
const saleText = 'nimeuza velvet napikin 4 bahasha 8 nguvu ya sala 3';
const sale = {
  direction: 'sale', kind: 'sale',
  lines: [['velvet napikin', 4], ['bahasha', 8], ['nguvu ya sala', 3]].map(([name, qty]) => ({ product_wording: name, quantity_wording: String(qty), quantity_candidate: qty, unit_wording: null, price_band_wording: null })),
  party_wording: null, credit_wording: null, payment_wording: null, price_band_wording: null,
  occurred_at_wording: null, loss_reason_wording: null, amount_wording: null, amount_candidate: null, missing_fields: ['price_band'],
};
const tool = (name: string, input: unknown) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'call-' + name, name, input }] });
function mockProvider(responses: unknown[]) {
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined } });
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'claude-haiku-4-5-20251001' }] }));
    const response = responses.shift();
    if (!response) throw new Error('unexpected extra provider call');
    return new Response(JSON.stringify(response));
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('reported sale and draft context regressions', () => {
  it('blocks a stale login before execution, then handles the current sale once', async () => {
    mockProvider([tool('request_account_action', { action: 'login', language: null }), tool('propose_business_event', sale)]);
    const executeTool = vi.fn().mockResolvedValue({ content: 'Chagua bei.', terminalReply: 'Chagua bei.' });
    const result = await runConversationalAssistant({ context, history: [{ role: 'user', content: 'Login' }], userText: saleText, executeTool });
    expect(executeTool.mock.calls).toEqual([['propose_business_event', sale]]);
    expect(result?.reply).toBe('Chagua bei.');
  });
  it('still executes a login requested in the current message', async () => {
    mockProvider([tool('request_account_action', { action: 'login', language: null })]);
    const executeTool = vi.fn().mockResolvedValue({ content: 'account_link_response', terminalReply: 'Link sent.', sensitiveReply: true });
    const result = await runConversationalAssistant({ context, history: [], userText: 'Naomba link ya kuingia', executeTool });
    expect(executeTool).toHaveBeenCalledOnce();
    expect(result?.sensitiveReply).toBe(true);
  });
  it('repairs a missing tool once without asking the trader to restate a clear sale', async () => {
    const fetchMock = mockProvider([{ content: [{ type: 'text', text: 'Nimeelewa mauzo.' }] }, tool('propose_business_event', sale)]);
    const executeTool = vi.fn().mockResolvedValue({ content: 'Chagua bei.', terminalReply: 'Chagua bei.' });
    const result = await runConversationalAssistant({ context, history: [], userText: saleText, executeTool });
    expect(result?.reply).toBe('Chagua bei.');
    expect(executeTool).toHaveBeenCalledOnce();
    const requests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/messages')).map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests).toHaveLength(2);
    expect(requests[1].tool_choice.type).toBe('any');
    expect(requests[1].messages.at(-1).content).toContain('No tool was called');
  });
  it('stops after one unsuccessful repair with no financial executor called', async () => {
    const noTool = { content: [{ type: 'text', text: 'Nimeelewa.' }] };
    const fetchMock = mockProvider([noTool, noTool]);
    const executeTool = vi.fn(); const onFailure = vi.fn();
    expect(await runConversationalAssistant({ context, history: [], userText: saleText, executeTool, onFailure })).toBeNull();
    expect(executeTool).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith('missing_required_tool_call');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/messages'))).toHaveLength(2);
  });
  it('gives draft corrections all original lines without exposing identity or credentials', () => {
    const record = { kind: 'sale', amount: 46100, paymentMethod: null, occurredAt: '2026-09-07T09:00:00Z', lines: [
      { description: 'Velvet napkin', quantity: 4, unit_amount: 4000 },
      { description: 'bahasha', quantity: 8, unit_amount: 200 },
      { description: 'nguvu ya sala', quantity: 3, unit_amount: 9500 },
    ] };
    const encoded = pendingConversationContext({ awaiting: 'payment_source', expires_at: new Date(Date.now() + 60000).toISOString(), options: { kind: 'daily_record_confirmation', record, dailyRecordId: 'private-id', token: 'secret' } });
    expect(encoded).toContain(JSON.stringify(record));
    expect(encoded).not.toContain('private-id'); expect(encoded).not.toContain('secret');
    const pending = describePending({ field: 'payment_method', intent: 'draft_review' });
    expect(pending).toContain('NOT being required to answer a payment question');
    expect(pending).toContain('only the changed products');
    expect(pending).not.toContain('RISIP IS WAITING FOR AN ANSWER: field=payment_method');
  });
});
