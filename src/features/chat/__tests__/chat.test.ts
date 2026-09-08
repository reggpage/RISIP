import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-only' } } }) } } }));
import { businessDay, confirmationRows, parseSse, saleSentence, sendChat } from '../chat';
import { chatEnglish, chatSwahili } from '@/i18n/chat';

describe('shared chat transport contract', () => {
  it('uses the shop timezone at UTC midnight boundaries', () => {
    expect(businessDay(0, new Date('2026-09-08T20:59:59Z'))).toBe('2026-09-08');
    expect(businessDay(0, new Date('2026-09-08T21:00:00Z'))).toBe('2026-09-09');
    expect(businessDay(-2, new Date('2026-03-01T01:00:00Z'))).toBe('2026-02-27');
  });
  it('composes scanner input as ordinary words in both languages', () => {
    expect(saleSentence(chatSwahili.saleSentence, 'Sukari', 2.5)).toBe('Nimeuza "Sukari" 2.5');
    expect(saleSentence(chatEnglish.saleSentence, 'Sugar', 2)).toBe('I sold "Sugar" 2');
    for (const qty of [0, -1, Infinity, NaN]) expect(() => saleSentence(chatEnglish.saleSentence, 'Sugar', qty)).toThrow();
  });
  it('preserves the exact confirmation amounts without calculating a new total', () => {
    expect(confirmationRows('Nimeelewa:\n- Sukari: 2 × TSh 3,000 = TSh 6,000\nJumla: *TSh 6,000*\nJibu 1 Ndiyo')).toEqual([
      ['Sukari', '2 × TSh 3,000 = TSh 6,000'], ['Jumla', 'TSh 6,000'],
    ]);
  });
  it('has complete bilingual copy and no forbidden punctuation', () => {
    expect(Object.keys(chatSwahili)).toEqual(Object.keys(chatEnglish));
    expect(JSON.stringify([chatEnglish, chatSwahili])).not.toContain('\u2014');
  });
  it('parses SSE frames without treating heartbeats as answers', () => {
    expect(parseSse('event: heartbeat\ndata: {}')).toEqual({ event: 'heartbeat', data: {} });
    expect(parseSse(':keepalive')).toBeNull();
  });
  it('keeps a retryable failure when a connection closes before done', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('event: accepted\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })));
    await expect(sendChat({ id: 'same-client-id', text: 'NDIYO', companyId: 'test' }, () => {})).rejects.toThrow('interrupted_stream');
    vi.unstubAllGlobals();
  });
  it('retries the same client id and accepts the durable replay', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ content: 'Saved once' }], status: 'skipped' }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const input = { id: 'same-client-id', text: 'NDIYO', companyId: 'test' }, events: string[] = [];
    await sendChat(input, (event) => events.push(event.event));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    expect(events).toEqual(['message', 'done']);
    vi.unstubAllGlobals();
  });
});
