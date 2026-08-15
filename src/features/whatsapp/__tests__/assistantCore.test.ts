import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_TOOL_NAMES,
  ASSISTANT_TOOLS,
  buildAssistantSystemPrompt,
  canUseCompanyFinanceReads,
  findUngroundedNumbers,
  inferAssistantMemory,
  normalizeAssistantHistory,
  requiresCurrentBusinessDataTool,
  runConversationalAssistant,
  sanitizeAssistantFirstName,
  shouldDeferRecordLikeReply,
  type AssistantIdentityContext,
} from '../../../../supabase/functions/_shared/whatsappAssistant';

const context: AssistantIdentityContext = {
  identityId: 'identity-1',
  profileId: 'profile-1',
  companyId: 'company-1',
  companyName: 'St. Ritha Bookshop',
  userName: 'Angela',
  role: 'owner',
  lang: 'sw',
  approvalFlowEnabled: false,
  reversalEnabled: false,
  payoutsEnabled: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe('Risip conversational AI core', () => {
  it('exposes bounded tools and no protected finance action', () => {
    expect(ASSISTANT_TOOL_NAMES).toContain('get_product_performance');
    expect(ASSISTANT_TOOL_NAMES).toContain('get_product_cost');
    expect(ASSISTANT_TOOL_NAMES).toContain('get_hypothetical_product_profit');
    expect(ASSISTANT_TOOL_NAMES).toContain('propose_daily_record');
    expect(ASSISTANT_TOOL_NAMES).not.toContain('approve_receipt');
    expect(ASSISTANT_TOOL_NAMES).not.toContain('pay_claim');
    expect(ASSISTANT_TOOL_NAMES).not.toContain('reverse_receipt');
    expect(ASSISTANT_TOOL_NAMES).not.toContain('void_daily_record');
    expect(ASSISTANT_TOOLS.every((tool) => tool.input_schema)).toBe(true);
    expect(ASSISTANT_TOOLS.filter((tool) => tool.strict).map((tool) => tool.name)).toEqual([
      'propose_product_cost',
      'propose_daily_record',
    ]);
    const serializedSchemas = JSON.stringify(ASSISTANT_TOOLS.map((tool) => tool.input_schema));
    for (const unsupported of ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'pattern']) {
      expect(serializedSchemas).not.toContain(`\"${unsupported}\"`);
    }
  });

  it('injects the safe user name, business, role, flags, language and semantic-follow-up rules', () => {
    const prompt = buildAssistantSystemPrompt(context);
    expect(prompt).toContain('St. Ritha Bookshop');
    expect(prompt).toContain('User’s first name: Angela');
    expect(prompt).toContain('Do not use it in every reply');
    expect(prompt).toContain('Active role: owner');
    expect(prompt).toContain('Reply in Kiswahili');
    expect(prompt).toContain('pronouns and follow-up questions');
    expect(prompt).toContain('Treat greetings and ordinary small talk as conversation');
    expect(prompt).toContain('Never require an exact memorized phrase');
    expect(prompt).toContain('Explicit NDIYO/YES is required');
  });

  it('keeps only a bounded, safe first name for assistant personalization', () => {
    expect(sanitizeAssistantFirstName(' Angela Benedict Kessy ')).toBe('Angela');
    expect(sanitizeAssistantFirstName('Élodie N.')).toBe('Élodie');
    expect(sanitizeAssistantFirstName('  <ignore-system> Angela')).toBe('ignore-system');
    expect(sanitizeAssistantFirstName('12345')).toBeNull();
  });

  it('keeps a compact multi-topic window instead of one hard-coded product slot', () => {
    const history = Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `turn ${index}`,
    }));
    const normalized = normalizeAssistantHistory(history);
    expect(normalized).toHaveLength(12);
    expect(normalized[0].content).toBe('turn 4');
    expect(normalized.at(-1)?.content).toBe('turn 15');
    expect(normalizeAssistantHistory([
      { role: 'assistant', content: 'orphaned answer' },
      { role: 'user', content: 'new question' },
    ])).toEqual([{ role: 'user', content: 'new question' }]);
  });

  it('fails company-wide finance reads closed for workers', () => {
    expect(canUseCompanyFinanceReads('owner')).toBe(true);
    expect(canUseCompanyFinanceReads('accountant')).toBe(true);
    expect(canUseCompanyFinanceReads('worker')).toBe(false);
    expect(canUseCompanyFinanceReads('team_leader')).toBe(false);
  });

  it('tracks entities by topic for later pronoun and period follow-ups', () => {
    expect(inferAssistantMemory([{
      name: 'get_product_performance',
      input: { product_names: ['nguvu ya sala'], metric: 'quantity', period: 'today' },
    }])).toEqual({
      topic: 'product_performance',
      entities: { product_names: ['nguvu ya sala'], metric: 'quantity', period: 'today' },
      lastTool: 'get_product_performance',
    });
    expect(inferAssistantMemory([{
      name: 'get_open_debts', input: { party_name: 'Asha' },
    }])).toMatchObject({ topic: 'customer_debts', entities: { party_name: 'Asha' } });
    expect(inferAssistantMemory([{
      name: 'get_product_cost', input: { product_name: 'Nguvu ya sala' },
    }])).toMatchObject({ topic: 'product_cost', entities: { product: 'Nguvu ya sala' } });
  });

  it('detects numbers that were not present in user text or server tool evidence', () => {
    expect(findUngroundedNumbers(
      'Nguvu ya sala: vipande 7, jumla TSh 63,000.',
      ['Nguvu ya sala imeuza vipande 7 na mapato TSh 63,000.'],
    )).toEqual([]);
    expect(findUngroundedNumbers(
      'Nguvu ya sala: vipande 70, jumla TSh 630,000.',
      ['Nguvu ya sala imeuza vipande 7 na mapato TSh 63,000.'],
    )).toEqual(['70', '630000']);
  });

  it('forces live business questions and follow-ups through server tools', () => {
    expect(requiresCurrentBusinessDataTool('What sold the most today?')).toBe(true);
    expect(requiresCurrentBusinessDataTool('Nguvu ya sala imeuzwa ngapi leo?')).toBe(true);
    expect(requiresCurrentBusinessDataTool('Jumla yake?')).toBe(true);
    expect(requiresCurrentBusinessDataTool('Nisaidie kutumia Risip')).toBe(false);
  });

  it('keeps a grounded read-tool answer even when wording also looks like a sale record', () => {
    expect(shouldDeferRecordLikeReply(true, ['get_product_performance'])).toBe(false);
    expect(shouldDeferRecordLikeReply(true, ['propose_daily_record'])).toBe(false);
    expect(shouldDeferRecordLikeReply(true, [])).toBe(true);
    expect(shouldDeferRecordLikeReply(false, [])).toBe(false);
  });

  it('runs a real client-tool loop over conversation history and grounds the final answer', async () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (name: string) => name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use', id: 'tool-1', name: 'get_product_performance',
          input: { metric: 'revenue', period: 'today', product_names: ['nguvu ya sala'] },
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Nguvu ya sala imeingiza TSh 63,000 leo.' }],
      }), { status: 200 }));

    const executeTool = vi.fn().mockResolvedValue({
      content: 'Nguvu ya sala imeuza vipande 7 na kuingiza TSh 63,000 leo.',
    });
    const result = await runConversationalAssistant({
      context,
      history: [
        { role: 'user', content: 'Nguvu ya sala imeuzwa ngapi leo?' },
        { role: 'assistant', content: 'Imeuza vipande 7 leo.' },
      ],
      userText: 'Jumla yake?',
      executeTool,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(executeTool).toHaveBeenCalledWith('get_product_performance', {
      metric: 'revenue', period: 'today', product_names: ['nguvu ya sala'],
    });
    expect(result).toMatchObject({
      reply: 'Nguvu ya sala imeingiza TSh 63,000 leo.',
      toolNames: ['get_product_performance'],
      usedSafeFallback: false,
      memory: { topic: 'product_performance' },
    });
    const firstMessageRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstMessageRequest.tool_choice).toEqual({ type: 'any', disable_parallel_tool_use: false });
    expect(firstMessageRequest).not.toHaveProperty('disable_parallel_tool_use');
    expect(firstMessageRequest.messages.map((message: { content: string }) => message.content)).toEqual([
      'Nguvu ya sala imeuzwa ngapi leo?',
      'Imeuza vipande 7 leo.',
      'Jumla yake?',
    ]);
  });

  it('falls back to exact server evidence when model prose invents a figure', async () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (name: string) => name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined },
    };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tool-1', name: 'get_product_performance', input: { metric: 'quantity', period: 'today', product_names: [] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Nguvu ya sala imeuza vipande 70.' }],
      }), { status: 200 }));

    const evidence = 'Nguvu ya sala imeuza vipande 7 leo.';
    const result = await runConversationalAssistant({
      context,
      history: [],
      userText: 'Bidhaa gani imeuza sana leo?',
      executeTool: async () => ({ content: evidence }),
    });
    expect(result).toMatchObject({ reply: evidence, usedSafeFallback: true });
  });

  it('reports a safe provider failure code without exposing prompts or secrets', async () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (name: string) => name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined },
    };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'tools.10.input_schema: invalid keyword' } }), { status: 400 }));
    const onFailure = vi.fn();
    const result = await runConversationalAssistant({
      context,
      history: [],
      userText: 'Mauzo ya leo?',
      executeTool: async () => ({ content: 'unused' }),
      onFailure,
    });
    expect(result).toBeNull();
    expect(onFailure).toHaveBeenCalledWith('provider_400_invalid_request_error_tools.10.input_schema_invalid_keyword');
  });
});
