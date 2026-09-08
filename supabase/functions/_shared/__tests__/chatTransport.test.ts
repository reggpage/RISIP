import { describe, expect, it, vi } from 'vitest';
import { chatTransport, isWebChat, recordChatTool, redactChatSecrets } from '../chatTransport';
import { startWhatsAppTurnHeartbeat } from '../whatsappTurn';

describe('request-local reply sink', () => {
  it('redacts both supported login token query names from stored history', () => {
    for (const query of ['t=secret', 'token=secret', 'next=chat&t=secret']) {
      const { sensitive, safeContent } = redactChatSecrets(`Open https://risip.online/wa-login?${query}`);
      expect(sensitive).toBe(true); expect(safeContent).not.toContain('secret'); expect(safeContent).toContain('[redacted]');
    }
    expect(redactChatSecrets('Nimeuza sukari 2')).toEqual({ sensitive: false, safeContent: 'Nimeuza sukari 2' });
  });
  it('renews long-running turns using Supabase thenables without crashing', async () => {
    vi.useFakeTimers();
    const rpc = vi.fn(() => ({ then: (resolve: (value: unknown) => void) => resolve({ data: true, error: null }) }));
    const stop = startWhatsAppTurnHeartbeat({ from: () => null, rpc } as any, 'identity:a', 'owner');
    await vi.advanceTimersByTimeAsync(30000);
    expect(rpc).toHaveBeenCalledOnce();
    stop(); vi.useRealTimers();
  });
  it('does not leak web delivery or tool events to a simultaneous WhatsApp turn', async () => {
    const webEvents: unknown[] = [], waEvents: unknown[] = [];
    await Promise.all([
      chatTransport.run({ web: { identityId: 'a', companyId: 'a', phone: 'a', messageId: 'a', text: 'a' }, emit: (_, data) => webEvents.push(data) }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(isWebChat()).toBe(true); recordChatTool('get_sales_trend');
      }),
      chatTransport.run({ emit: (_, data) => waEvents.push(data) }, async () => {
        expect(isWebChat()).toBe(false); recordChatTool('get_stock_on_hand');
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(isWebChat()).toBe(false);
      }),
    ]);
    expect(webEvents).toEqual([{ name: 'get_sales_trend' }]);
    expect(waEvents).toEqual([{ name: 'get_stock_on_hand' }]);
    expect(isWebChat()).toBe(false);
  });
});
