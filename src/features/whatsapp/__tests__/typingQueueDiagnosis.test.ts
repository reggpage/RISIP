import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { turnQueueOrder } from '../../../../supabase/functions/_shared/whatsappTurn';
import { whatsappTextPayload } from '../../../../supabase/functions/_shared/whatsappTextPayload';
import { typingIndicatorPayload } from '../../../../supabase/functions/_shared/whatsappApiPayloads';

// TYPING FOR THE SECOND BUBBLE, AND WHY FOUR FIXES MISSED IT.
//
// The complaint is exact: send two messages quickly and the first reply is
// preceded by "typing…" while every later reply simply appears. Four changes
// were aimed at this — a preflight heartbeat map, moving the heartbeat behind
// the turn, a 1.5s visibility pause, and a Graph version bump — and none of
// them moved it, because none of them was based on an observation.
//
// MEASURED, from whatsapp_messages in production. Three rapid pairs, one phone:
//
//   received     gap    processing
//   14:44:02      -       9.9s      A
//   14:44:02     0.4s    17.1s      B
//   15:00:51      -      12.1s      A
//   15:00:52     0.5s    19.6s      B
//   15:18:50      -      12.8s      A
//   15:18:51     1.3s    19.7s      B
//
// Two things fall straight out of those numbers.
//
// ONE: Meta is not waiting for our acknowledgement. B's row is inserted half a
// second after A's while A still has twelve seconds to run. So "the webhook
// blocks Meta and B is delivered late" is disproved — B's invocation starts
// immediately and then sits in the turn queue, silent, for ~11.6 seconds.
//
// TWO: B's indicator is raised in the worst possible instant. It is raised when
// B wins the turn, and B wins the turn the moment A releases it — which is the
// moment A's reply is delivered. A delivered message dismisses whatever
// indicator is showing. B therefore asks for an indicator that is cancelled a
// fraction of a second later, and the next heartbeat pulse is 10 seconds away
// while B's own reply lands in 8. Between those two facts, B never shows
// typing at all.
//
// The hypothesis under test — that only the FIRST request per message can ever
// produce a bubble, because the request doubles as mark-as-read and a message
// is only unread once — is what migration 0153 records, per attempt, with
// Meta's status. It is not asserted here as fact. What is asserted here is that
// the code no longer spends that one request in the instant it is guaranteed to
// be thrown away, and that every request is now written down.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const api = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/whatsappApi.ts'), 'utf8');
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0153_whatsapp_typing_audit.sql'), 'utf8');

describe('rapid messages are all processed, in the order they were sent', () => {
  it('keeps two rapid messages in arrival order', () => {
    const ordered = turnQueueOrder([
      { id: 'b', createdAt: '2026-08-30T15:00:52.000Z' },
      { id: 'a', createdAt: '2026-08-30T15:00:51.000Z' },
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('keeps three rapid messages in arrival order and loses none', () => {
    const ordered = turnQueueOrder([
      { id: 'c', createdAt: '2026-08-30T15:00:53.100Z' },
      { id: 'a', createdAt: '2026-08-30T15:00:51.000Z' },
      { id: 'b', createdAt: '2026-08-30T15:00:52.400Z' },
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(ordered).toHaveLength(3);
  });

  it('orders by sub-second arrival, because that is the whole case', () => {
    // Both of these arrive inside the same second in production.
    const ordered = turnQueueOrder([
      { id: 'second', createdAt: '2026-08-30T14:44:02.900Z' },
      { id: 'first', createdAt: '2026-08-30T14:44:02.100Z' },
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['first', 'second']);
  });

  it('waits for an earlier message rather than answering past it', () => {
    // The lease is per phone, so one shop's queue never holds up another's.
    const turn = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/whatsappTurn.ts'), 'utf8');
    expect(turn).toContain(".in('status', ['pending', 'processing'])");
    expect(turn).toContain(".lt('created_at', createdAt)");
    expect(turn).toContain(".eq('phone_e164', phone)");
  });
});

describe('typing is requested for every message, not only the first', () => {
  it('routes every pulse through the recorder, leaving no unrecorded call', () => {
    // If a raw showTyping(waMessageId) survives anywhere in the loop, that
    // pulse is invisible to the diagnosis and the next investigation starts
    // blind all over again.
    // Exactly one raw call may exist: the one inside typingRecorder itself,
    // which is the thing doing the recording.
    const rawCalls = webhook.match(/await showTyping\(waMessageId\)/g) ?? [];
    expect(rawCalls).toHaveLength(1);
    const recorderBody = webhook.slice(
      webhook.indexOf('function typingRecorder('),
      webhook.indexOf('function typingRecorder(') + 900,
    );
    expect(recorderBody).toContain('await showTyping(waMessageId)');
    expect((webhook.match(/await pulseTyping\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('gives a queued message its own pulse rather than riding the first one', () => {
    const recorder = webhook.indexOf('const pulseTyping = typingRecorder(');
    const heartbeat = webhook.indexOf('startWhatsAppTypingHeartbeat(() => pulseTyping())');
    expect(recorder).toBeGreaterThan(-1);
    expect(heartbeat).toBeGreaterThan(recorder);
  });

  it('does not spend the pulse in the instant the previous reply lands', () => {
    // The settle is conditional on having actually queued. A message arriving
    // alone waits for nothing, because there is nothing to wait behind.
    expect(webhook).toContain('if (queuedBehind) await typingSettlePause();');
    expect(webhook).toContain('const TYPING_SETTLE_MS = 1_200;');
    const settle = webhook.indexOf('if (queuedBehind) await typingSettlePause();');
    const heartbeat = webhook.indexOf('startWhatsAppTypingHeartbeat(() => pulseTyping())');
    expect(heartbeat).toBeGreaterThan(settle);
  });

  it('measures the queue wait instead of guessing at it', () => {
    expect(webhook).toContain('const queuedMs = Date.now() - waitStartedAt;');
    expect(webhook).toContain('const queuedBehind = queuedMs >= QUEUED_BEHIND_MS;');
  });
});

describe('what Meta said is written down, not shouted into stderr', () => {
  it('returns the status and the error code instead of void', () => {
    expect(api).toContain('export type TypingOutcome');
    expect(api).toContain('return { status: res.status, code };');
    // Keep the log line too: it is what a live tail shows.
    expect(api).toContain('whatsapp typing indicator failed: ${res.status}');
  });

  it('records the attempt number, which is the question being asked', () => {
    expect(webhook).toContain("db.from('whatsapp_typing_attempts').insert({");
    expect(webhook).toContain('attempt: at,');
    expect(webhook).toContain('ms_since_received:');
    expect(webhook).toContain('queued_behind_earlier: queuedBehind,');
  });

  it('never lets the diagnostic cost a shop its reply', () => {
    const insert = webhook.indexOf("db.from('whatsapp_typing_attempts').insert({");
    expect(webhook.slice(insert, insert + 500))
      .toContain('A diagnostic must never cost a shop its reply.');
  });

  it('stores nothing about the person or what they wrote', () => {
    // Assert on the COLUMNS, not the prose. The comment block naturally says
    // the words "phone number" and "message text" while promising not to keep
    // them, and a test that reads the promise instead of the schema proves
    // nothing at all.
    const create = migration.slice(
      migration.indexOf('create table if not exists public.whatsapp_typing_attempts'),
      migration.indexOf('comment on table'),
    );
    const columns = create
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[a-z_]+ /.test(line) && !line.startsWith('--'))
      .map((line) => line.split(' ')[0]);
    expect(columns).toContain('wa_message_id');
    expect(columns).not.toContain('phone_e164');
    expect(columns).not.toContain('body');
    expect(columns).not.toContain('message_text');
    expect(columns.some((name) => /phone|customer|body|text/.test(name))).toBe(false);
  });

  it('caps its own growth, since it writes on every pulse', () => {
    expect(migration).toContain('wa_trim_typing_attempts');
  });
});

describe('the reply still quotes the message it answers', () => {
  it('carries context.message_id for the exact inbound bubble', () => {
    expect(whatsappTextPayload('+255700000000', 'Faida ya leo ni TSh 84,250.', {
      replyToMessageId: 'wamid.SECOND',
    })).toMatchObject({
      to: '255700000000',
      context: { message_id: 'wamid.SECOND' },
    });
  });

  it('quotes the second message, not the first, when answering the second', () => {
    // With two answers in flight and no ordering guarantee from Meta, the
    // quote is the only thing that says which question this answers.
    const second = whatsappTextPayload('+255700000000', 'jibu B', { replyToMessageId: 'wamid.B' });
    expect(second.context).toEqual({ message_id: 'wamid.B' });
  });

  it('sends no context at all when there is nothing to quote', () => {
    // A proactive notification answers no bubble; quoting a stale one would be
    // worse than not quoting.
    expect(whatsappTextPayload('+255700000000', 'habari za asubuhi', {}))
      .not.toHaveProperty('context');
  });

  it('asks for the indicator against the exact message id', () => {
    expect(typingIndicatorPayload('wamid.B')).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.B',
      typing_indicator: { type: 'text' },
    });
  });
});

describe('a redelivered webhook still changes nothing', () => {
  it('drops a duplicate on the unique key and answers it no second time', () => {
    // Meta redelivers whenever it is unhappy, and it has had every reason to
    // be unhappy while the webhook held its connection open for twenty seconds.
    expect(webhook).toContain("if (dupErr.code === '23505') continue;");
  });

  it('records the message before doing any work with it', () => {
    const insert = webhook.indexOf('wa_message_id: waMessageId,');
    const loop = webhook.indexOf('for (const { message, waMessageId, phone, receivedAtMs }');
    expect(insert).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(insert);
  });
});

describe('Meta is answered promptly, and the work still finishes', () => {
  it('hands the work to the runtime instead of holding the connection', () => {
    expect(webhook).toContain('runtime.waitUntil(processAll());');
  });

  it('falls back to awaiting when the runtime cannot keep it alive', () => {
    // Without this a missing convenience would silently drop messages, which
    // is the one failure this codebase keeps having to apologise for.
    const dispatch = webhook.indexOf("if (typeof runtime?.waitUntil === 'function')");
    expect(dispatch).toBeGreaterThan(-1);
    expect(webhook.slice(dispatch, dispatch + 260)).toContain('await processAll();');
  });

  it('still answers 200 so a recorded payload is never redelivered', () => {
    expect(webhook).toContain('Always 200: a non-200 makes Meta retry a payload we have already recorded.');
  });
});
