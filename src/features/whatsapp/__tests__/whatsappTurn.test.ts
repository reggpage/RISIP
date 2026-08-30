import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startWhatsAppTypingHeartbeat,
  turnQueueOrder,
} from '../../../../supabase/functions/_shared/whatsappTurn';

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('WhatsApp turn ordering', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('processes rapid messages for one identity in arrival order without losing state', () => {
    const processed: string[] = [];
    const conversation: string[] = [];
    const messages = turnQueueOrder([
      { id: 'third', body: 'Na bidhaa gani imeuza sana?', createdAt: '2026-08-30T10:00:00.300Z' },
      { id: 'second', body: 'Nipe faida ya Jumapili', createdAt: '2026-08-30T10:00:00.200Z' },
      { id: 'first', body: 'Biashara yangu inaendaje?', createdAt: '2026-08-30T10:00:00.100Z' },
    ]);
    for (const message of messages) {
      processed.push(message.id);
      conversation.push(message.body);
    }
    expect(processed).toEqual(['first', 'second', 'third']);
    expect(conversation).toEqual([
      'Biashara yangu inaendaje?',
      'Nipe faida ya Jumapili',
      'Na bidhaa gani imeuza sana?',
    ]);
    expect(new Set(processed)).toEqual(new Set(['first', 'second', 'third']));
  });

  it('keeps pulsing typing for one inbound bubble until the turn ends', async () => {
    vi.useFakeTimers();
    const showTyping = vi.fn().mockResolvedValue(undefined);
    const stop = startWhatsAppTypingHeartbeat(showTyping, 5_000);

    expect(showTyping).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(showTyping).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(showTyping).toHaveBeenCalledTimes(4);
  });

  it('starts typing only after each message owns its turn', () => {
    const heartbeat = webhook.indexOf('startWhatsAppTypingHeartbeat(() => showTyping(waMessageId))');
    const wait = webhook.indexOf('waitForWhatsAppTurn(db, phone, waMessageId, turnOwner)');
    const stop = webhook.indexOf('stopTypingHeartbeat();', heartbeat);
    expect(heartbeat).toBeGreaterThan(-1);
    expect(heartbeat).toBeGreaterThan(wait);
    expect(stop).toBeGreaterThan(heartbeat);
    expect(webhook).not.toContain('const typingHeartbeats = new Map<string, () => void>()');
  });

  it('gives every claimed bubble a visible typing moment before fast replies', () => {
    const heartbeat = webhook.indexOf('startWhatsAppTypingHeartbeat(() => showTyping(waMessageId))');
    const pause = webhook.indexOf('await typingVisibilityPause()', heartbeat);
    const resolveIdentity = webhook.indexOf('Resolve identity once', pause);
    expect(webhook).toContain('typingVisibilityPause');
    expect(webhook).toContain('setTimeout(resolve, 1500)');
    expect(pause).toBeGreaterThan(heartbeat);
    expect(resolveIdentity).toBeGreaterThan(pause);
  });
});
