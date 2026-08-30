import { describe, expect, it } from 'vitest';
import { turnQueueOrder } from '../../../../supabase/functions/_shared/whatsappTurn';

describe('WhatsApp turn ordering', () => {
  it('processes rapid messages for one identity in arrival order without losing state', () => {
    const processed: string[] = [];
    const conversation: string[] = [];
    const messages = turnQueueOrder([
      { id: 'second', body: 'Nipe faida ya Jumapili', createdAt: '2026-08-30T10:00:00.200Z' },
      { id: 'first', body: 'Biashara yangu inaendaje?', createdAt: '2026-08-30T10:00:00.100Z' },
    ]);
    for (const message of messages) {
      processed.push(message.id);
      conversation.push(message.body);
    }
    expect(processed).toEqual(['first', 'second']);
    expect(conversation).toEqual(['Biashara yangu inaendaje?', 'Nipe faida ya Jumapili']);
    expect(new Set(processed)).toEqual(new Set(['first', 'second']));
  });
});
