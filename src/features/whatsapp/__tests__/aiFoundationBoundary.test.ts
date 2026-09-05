import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSISTANT_TOOLS, runConversationalAssistant, type AssistantIdentityContext } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { validateToolRound, validateToolValue } from '../../../../supabase/functions/_shared/whatsappToolBoundary';
import { answersPendingQuestion, isProtectedSystemCommand, messageGoesToModel, protectedPriceBandAnswer, protectedSaleProductAnswer } from '../../../../supabase/functions/_shared/whatsappRouting';
import { mergeStockAnswers, pendingConversationContext } from '../../../../supabase/functions/_shared/whatsappPendingContext';
import { catalogueProposalBlocked, retrievalHealthContext, type RetrievalHealth } from '../../../../supabase/functions/_shared/whatsappRetrievalHealth';
import { aiFailureLayer } from '../../../../supabase/functions/_shared/whatsappAiFailure';

const context: AssistantIdentityContext = {
  identityId: 'synthetic-identity', profileId: 'synthetic-profile', companyId: 'synthetic-company',
  companyName: 'Test shop', userName: 'Test worker', role: 'worker', lang: 'sw', approvalFlowEnabled: false,
  reversalEnabled: false, payoutsEnabled: false,
};
const money = { kind: 'supplier_payment', amount_wording: '300000', amount_candidate: 300000,
  party_wording: 'Musa', description_wording: null, payment_wording: 'cash', occurred_at_wording: null, missing_fields: [] };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const call = (name: string, input: Record<string, unknown>, id = 'tool-1') => ({ type: 'tool_use', id, name, input });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('resumes the saved sale when 2 selects the second book, without re-parsing its direction', () => {
  const pending = { awaiting: 'product_cost', options: { kind: 'product_read_choice',
    candidates: ['Kitabu cha hesabu', 'Kitabu cha Tenzi za Rohoni'], recovery: { sale: { items: [] } } } };
  expect(protectedSaleProductAnswer(pending, '2')).toBe('Kitabu cha Tenzi za Rohoni');
  for (const text of ['3', 'ndiyo', 'nimeuza 2', 'ghairi']) expect(protectedSaleProductAnswer(pending, text)).toBeNull();
  expect(protectedSaleProductAnswer({ ...pending, expires_at: '2020-01-01' }, '2')).toBeNull();
  const source = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
  expect(source.indexOf('const selectedProduct = protectedSaleProductAnswer')).toBeLessThan(source.indexOf('// Login is a protected'));
});

describe('actual exposed-tool execution boundary', () => {
  it('allows a well-formed supplier payment proposal, not hidden legacy tools', () => {
    expect(validateToolRound([{ id: 'a', name: 'propose_money_event', input: money }], ASSISTANT_TOOLS)).toBeNull();
    expect(validateToolRound([{ id: 'a', name: 'propose_daily_record', input: {} }], ASSISTANT_TOOLS)?.code).toBe('tool_not_exposed');
  });
  it.each([
    { ...money, company_id: 'another-company' },
    { ...money, amount_candidate: '300000' },
    { ...money, amount_candidate: Infinity },
    { ...money, kind: 'transfer_all' },
  ])('rejects invalid input before an executor sees it: %j', (input) => {
    expect(validateToolRound([{ id: 'a', name: 'propose_money_event', input }], ASSISTANT_TOOLS)).not.toBeNull();
  });
  it('preflights all proposals before either can replace pending state', () => {
    expect(validateToolRound([
      { id: 'a', name: 'propose_money_event', input: money },
      { id: 'b', name: 'propose_money_event', input: { ...money, kind: 'expense' } },
    ], ASSISTANT_TOOLS)?.code).toBe('conflicting_proposals');
  });
  it('rejects missing-product events and unsupported quantity candidates before execution', () => {
    const input = { direction: 'sale', kind: 'sale', lines: [], party_wording: null,
      credit_wording: null, payment_wording: null, price_band_wording: null,
      occurred_at_wording: 'jana', loss_reason_wording: null, amount_wording: null,
      amount_candidate: null, missing_fields: ['product'] };
    expect(validateToolRound([{ id: 'a', name: 'propose_business_event', input }], ASSISTANT_TOOLS)?.code).toBe('event_product_required');
    const unsupported = { ...input, lines: [{ product_wording: 'ngombe', quantity_wording: null,
      quantity_candidate: 1, unit_wording: null, price_band_wording: null }] };
    expect(validateToolRound([{ id: 'a', name: 'propose_business_event', input: unsupported }], ASSISTANT_TOOLS)?.code).toBe('quantity_evidence_required');
  });
  it('validates nested properties, nullable enums, required fields and limits', () => {
    const schema = { type: 'object', required: ['items'], properties: { items: { type: 'array', maxItems: 1,
      items: { type: 'object', required: ['band'], properties: { band: { anyOf: [{ type: 'string', enum: ['retail'] }, { type: 'null' }] } } } } } };
    expect(validateToolValue({ items: [{ band: null }] }, schema)).toBeNull();
    for (const input of [{}, { items: [{ band: 'invented' }] }, { items: [{ band: 'retail', price: 4 }] }, { items: [{ band: null }, { band: null }] }]) {
      expect(validateToolValue(input, schema)).not.toBeNull();
    }
  });
  it('uses the real assistant loop and refuses extra properties without a DB call', async () => {
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'ANTHROPIC_API_KEY' ? 'synthetic-key' : undefined } });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ content: [call('propose_money_event', { ...money, role: 'owner' })] }))
      .mockResolvedValueOnce(json({ content: [{ type: 'text', text: 'Naomba ufafanue malipo hayo.' }] }));
    const executeTool = vi.fn();
    const onFailure = vi.fn();
    await runConversationalAssistant({ context, history: [], userText: 'nimemlipa Musa 300000 cash', executeTool, onFailure });
    expect(executeTool).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith('tool_boundary:tool_input_extra_property');
  });
  it('does not submit any part of an oversized message', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'synthetic-key' } });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const executeTool = vi.fn();
    const onFailure = vi.fn();
    expect(await runConversationalAssistant({ context, history: [], userText: 'x'.repeat(2001), executeTool, onFailure })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith('input_too_long');
  });
  it('does not retry a proposal whose executor may have written before timing out', async () => {
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'ANTHROPIC_API_KEY' ? 'synthetic-key' : undefined } });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ content: [call('propose_money_event', money)] }))
      .mockResolvedValueOnce(json({ content: [call('propose_money_event', money, 'retry')] }))
      .mockResolvedValueOnce(json({ content: [{ type: 'text', text: 'Naomba uhakiki rekodi kabla ya kujaribu tena.' }] }));
    const executeTool = vi.fn().mockRejectedValue(new Error('simulated timeout after DB commit'));
    const onFailure = vi.fn();
    await runConversationalAssistant({ context, history: [], userText: 'nimemlipa Musa 300000 cash', executeTool, onFailure });
    expect(executeTool).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith('tool_boundary:conflicting_proposals');
  });
  it('does not hide a pending confirmation behind an earlier terminal read reply', async () => {
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'ANTHROPIC_API_KEY' ? 'synthetic-key' : undefined } });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ content: [call('get_supplier_payables', { supplier_wording: 'Musa' }, 'read'), call('propose_money_event', money, 'proposal')] }));
    const executeTool = vi.fn(async (name: string) => ({ content: 'verified', terminalReply: name.startsWith('get_') ? 'Outstanding summary' : 'Confirm this payment' }));
    const result = await runConversationalAssistant({ context, history: [], userText: 'nadaiwa na Musa kiasi gani na nimemlipa 300000 cash', executeTool });
    expect(result?.reply).toBe('Confirm this payment');
  });
});

describe('one text dispatch before every legacy language handler', () => {
  const examples = [
    'nimeuza mafuta 2', 'mafuta ya taa', 'mafuta ya kula', 'nimeuza vest 2 rejareja',
    'nimeuza bidhaa mbili', 'nimeuza ng’ombe mmoja kwa Musa kwa deni',
    'nimemlipa Musa 300000 cash', 'nimeongeza ng’ombe ya sala 20 stoo', 'jana nilifanya mauzo',
    'nmemlpa musa laki tatu mpsa', '1 jumla 2 rejareja 3 juml', 'ndiyo lakini bei ibadilike',
    'hapana usighairi, nilimaanisha jumla', 'nataka kumwalika mtu', 'nipe login nichek dashboard',
  ];
  const states = [null, { awaiting: 'daily_record_quantity', options: { kind: 'quantity_wanted' } },
    { awaiting: 'product_cost', options: { kind: 'price_band_choice' } },
    { awaiting: 'payment_source', options: { kind: 'daily_record_confirmation' } }];
  it.each(examples)('routes ordinary language to AI in every pending state: %s', (message) => {
    for (const state of states) expect(messageGoesToModel(state, message, isProtectedSystemCommand(message))).toBe(true);
  });
  it('binds 1 to the active question, not to every question', () => {
    expect(answersPendingQuestion(states[1], '1')).toBe(false);
    expect(answersPendingQuestion(states[3], '1')).toBe(true);
    expect(answersPendingQuestion(null, '1')).toBe(false);
    expect(answersPendingQuestion({ ...states[3], expires_at: '2020-01-01T00:00:00Z' }, '1')).toBe(false);
    expect(answersPendingQuestion({ awaiting: 'account_delete_confirm' }, 'NDIYO')).toBe(false);
    expect(answersPendingQuestion({ awaiting: 'account_delete_confirm' }, 'FUTA KABISA')).toBe(true);
  });
  it('checks actual invocation order, not only an eligibility substring', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    const boundary = source.indexOf('if (await handleAiText(activeQuestion, body, isProtectedSystemCommand(body), identity)) continue;');
    expect(boundary).toBeGreaterThan(0);
    for (const legacy of ['if (identity && isSellScanRequest(body))', 'const chosen = parseProductChoiceAnswer(body', 'const answer = parseQuantityAnswer(body', 'if (parseInviteRequest(writeBody))']) {
      expect(source.indexOf(legacy), legacy).toBeGreaterThan(boundary);
    }
  });
  it('turns only advertised a/b choices into a band, never ordinary language', () => {
    const question = { awaiting: 'product_cost', options: { kind: 'price_band_choice', choices: [{ product: 'vest' }] } };
    expect(protectedPriceBandAnswer(question, '(a)')).toBe('retail');
    expect(protectedPriceBandAnswer(question, 'b')).toBe('wholesale');
    for (const text of ['rejareja', '1 jumla 2 reja', 'a lakini belt jumla', 'c']) expect(protectedPriceBandAnswer(question, text)).toBeNull();
    expect(protectedPriceBandAnswer(null, 'a')).toBeNull();
    expect(protectedPriceBandAnswer({ ...question, expires_at: '2020-01-01' }, 'a')).toBeNull();
    expect(answersPendingQuestion({ awaiting: 'payment_source', options: { kind: 'whole_animal_breakdown_source_selection', candidates: [{}, {}] } }, '2')).toBe(true);
  });
});

describe('persistent multi-bubble context facts', () => {
  it('retains vest quantity when the next bubble supplies only belt quantity', () => {
    const products = ['vest', 'belt'];
    const first = mergeStockAnswers([], [{ product: 'vest', field: 'quantity', rawWording: 'vest 4', canonicalValue: null, numericValue: 4 }], products);
    const next = mergeStockAnswers(first, [{ product: 'belt', field: 'quantity', rawWording: 'belt kumi', canonicalValue: null, numericValue: 10 }], products);
    expect(next.map((answer) => [answer.product, answer.numericValue])).toEqual([['vest', 4], ['belt', 10]]);
    expect(mergeStockAnswers(next, [{ product: 'vest', field: 'quantity', rawWording: 'vest 5', canonicalValue: null, numericValue: 5 }], products)[0].numericValue).toBe(5);
  });
  it('rejects a quantity for a product outside the pending list', () => {
    expect(mergeStockAnswers([], [{ product: 'vestline', field: 'quantity', rawWording: 'vest', canonicalValue: null, numericValue: 4 }], ['vest'])).toEqual([]);
  });
  it('provides original intent and choices without credentials', () => {
    const snapshot = pendingConversationContext({ awaiting: 'product_cost', options: {
      kind: 'product_read_choice', originalText: 'nimeuza mafuta 2', candidates: ['mafuta ya taa', 'mafuta ya kula'],
      token: 'secret', phone: 'secret-phone',
    } });
    expect(snapshot).toContain('nimeuza mafuta 2');
    expect(snapshot).toContain('mafuta ya taa');
    expect(snapshot).not.toContain('secret');
  });
  it('does not present expired question data as an active draft', () => {
    const snapshot = pendingConversationContext({ awaiting: 'product_cost', expires_at: '2020-01-01', options: { originalText: 'old sale', kind: 'price_band_choice' } });
    expect(snapshot).toContain('previous_question=expired');
    expect(snapshot).not.toContain('old sale');
  });
});

describe('retrieval and failure attribution', () => {
  const healthy: RetrievalHealth = { vocabulary: 'partial', products: 'available', units: 'available', prices: 'partial' };
  it('distinguishes unavailable data from a missing product and blocks catalogue proposals', () => {
    const failed: RetrievalHealth = { ...healthy, units: 'unavailable' };
    expect(retrievalHealthContext(failed)).toContain('Unavailable means a lookup failed');
    expect(catalogueProposalBlocked('propose_business_event', failed)).toBe(true);
    expect(catalogueProposalBlocked('get_stock_on_hand', failed)).toBe(false);
    expect(catalogueProposalBlocked('propose_business_event', healthy)).toBe(false);
  });
  it('attributes failures without returning private error text', () => {
    expect(aiFailureLayer('tool_boundary:tool_input_extra_property')).toBe('tool_schema');
    expect(aiFailureLayer('tool_execution_failed:propose_money_event')).toBe('tool_execution');
    expect(aiFailureLayer('provider_timeout')).toBe('provider');
    expect(aiFailureLayer('model_ungrounded_number:300000')).toBe('grounding');
    expect(aiFailureLayer('merchant secret')).toBe('unknown');
  });
});
