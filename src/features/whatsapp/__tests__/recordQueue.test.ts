import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type QueuedRecord,
  queueDiscardedReply,
  queueFlushReply,
  queueSavedReply,
  queueTickReply,
} from '../../../../supabase/functions/_shared/whatsappRecordQueue';

// RECORDING WITHOUT WAITING.
//
// The owner's design, and his reason: every line costs a whole turn today —
// Haiku reads it, Sonnet writes a confirmation back, and he waits six seconds
// at the counter before typing the next one.
//
// MEASURED: the written confirmation is 81% of what a record costs. Haiku
// deciding what the message means is $0.0023; Sonnet writing the reply is
// $0.0097. A tick costs nothing at all — it is a WhatsApp send, not a model
// call.
//
// Nothing new is stored. A draft was already a daily_records row waiting on
// pending_confirmation, and wa_confirm_daily_record_batch already took an
// array of ids. What changed is how they are shown.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0149_record_queue.sql'), 'utf8');

const record = (over: Partial<QueuedRecord> = {}): QueuedRecord => ({
  id: 'r1', kind: 'sale', amount: 36_000, partyName: null, description: null,
  occurredAt: '2026-08-30T09:00:00Z',
  lines: [{ description: 'Zege', quantity: 2, lineTotal: 36_000 }],
  ...over,
});

describe('the tick', () => {
  it('is one line, and says how many are waiting', () => {
    // Anything longer is a confirmation, and a confirmation is the thing this
    // exists to stop writing four times a minute.
    const said = queueTickReply(3, 5, 'sw');
    expect(said).toBe('✓ Nimepokea. (3/5)');
    expect(said.split('\n')).toHaveLength(1);
  });

  it('is not silence', () => {
    // Silence is how a shopkeeper finds out at eight in the evening that a
    // message never arrived.
    expect(queueTickReply(1, 5, 'sw')).toContain('✓');
    expect(queueTickReply(1, 5, 'en')).toContain('✓');
  });
});

describe('the batch, once enough have gathered', () => {
  const waiting = [
    record({ id: 'a', lines: [{ description: 'Zege', quantity: 2, lineTotal: 36_000 }] }),
    record({ id: 'b', amount: 6_000, lines: [{ description: 'Soda', quantity: 3, lineTotal: 6_000 }] }),
    record({
      id: 'c', kind: 'debt_issued', amount: 25_000, partyName: 'Juma',
      lines: [{ description: 'Crate', quantity: 1, lineTotal: 25_000 }],
    }),
    record({
      id: 'd', kind: 'stock_purchase', amount: 40_000,
      lines: [{ description: 'Sabuni ya Dasan', quantity: 20, lineTotal: 40_000 }],
    }),
  ];
  const said = queueFlushReply(waiting, 'sw');

  it('groups by kind rather than by arrival', () => {
    // Somebody checking a batch is checking their sales against their memory
    // of the counter, and a purchase sitting between two sales breaks that.
    expect(said).toContain('*Mauzo*');
    expect(said).toContain('*Mkopo*');
    expect(said).toContain('*Manunuzi*');
    expect(said.indexOf('*Mauzo*')).toBeLessThan(said.indexOf('*Manunuzi*'));
  });

  it('names the customer on a credit line', () => {
    expect(said).toContain('Crate × 1 — *Juma* — TSh 25,000');
  });

  it('totals each kind, so there is something to check against the till', () => {
    expect(said).toContain('Mauzo: TSh 42,000');
    expect(said).toContain('Mkopo: TSh 25,000');
    expect(said).toContain('Manunuzi: TSh 40,000');
  });

  it('asks once, for all of them', () => {
    expect(said).toContain('Nimepokea vitu *4*');
    expect((said.match(/NDIYO/g) ?? [])).toHaveLength(1);
  });

  it('keeps a record with no product lines readable', () => {
    // An amount with no lines still has to appear, or the total below will not
    // add up for the person checking it.
    const withExpense = queueFlushReply([
      record({ id: 'e', kind: 'expense', amount: 8_000, description: 'umeme', lines: [] }),
    ], 'sw');
    expect(withExpense).toContain('• umeme — TSh 8,000');
  });

  it('says so plainly when there is nothing waiting', () => {
    expect(queueFlushReply([], 'sw')).toBe('Hakuna kinachosubiri kuthibitishwa.');
  });
});

describe('what happens after the answer', () => {
  it('says how many went on the books', () => {
    expect(queueSavedReply(5, 'sw')).toBe('✅ Nimehifadhi vitu *5*.');
  });

  it('says nothing was written when the answer was no', () => {
    expect(queueDiscardedReply(4, 'sw')).toContain('sijahifadhi chochote');
    expect(queueDiscardedReply(4, 'sw')).toContain('*4*');
  });
});

describe('the safety of shipping it', () => {
  it('is off until a shop is switched on, one at a time', () => {
    // This is the path that writes money. It has to be provable on one shop
    // before it is anybody's default.
    expect(migration).toContain('add column if not exists record_queue_size integer');
    expect(migration).toContain('record_queue_size between 2 and 30');
    expect(webhook).toContain('if (ceiling === null) return null;');
  });

  it('stores nothing new', () => {
    // A draft was already a row waiting on pending_confirmation.
    expect(migration).toContain("r.status = 'pending_confirmation'");
    expect(migration).not.toMatch(/create table [^;]*queue/i);
  });

  it('hands nobody another person’s drafts to confirm', () => {
    // Two workers recording at once must not be shown each other's lines, and
    // the ledger records who entered what.
    expect(migration).toContain('r.recorded_by = p_profile_id');
  });

  it('parks nothing while it is only ticking', () => {
    // A tick is not a question. Parking one would make the next ordinary
    // sentence look like an answer to it.
    const at = webhook.indexOf('if (waiting.length < ceiling)');
    const branch = webhook.slice(at, at + 400);
    expect(branch).toContain('await clearConversation(db, identity.id as string);');
    expect(branch).toContain('queueTickReply');
  });

  it('answers a question, and never swallows it', () => {
    // MEASURED, within the hour of shipping the queue and it was my fault. I
    // had every read flush the queue and return the BATCH instead of the
    // answer, so "leo ameuza nini na nini" came back as a confirmation list —
    // and asking again returned the same list, because nothing had been
    // confirmed. Two questions in, Risip was a wall.
    //
    // A pending draft is a fact about the shop, not a reason to refuse it.
    expect(webhook).toContain('A QUESTION IS ANSWERED. It is never swallowed.');
    expect(webhook).toContain('pending_drafts_not_yet_counted=');
    expect(webhook).toContain('vinasubiri kuthibitishwa');
  });

  it('still stops before closing the day, because that one cannot be wrong', () => {
    // The totals a closure writes would be missing whatever is still waiting.
    const at = webhook.indexOf("if (name === 'propose_day_close') {");
    expect(at).toBeGreaterThan(0);
    expect(webhook.slice(at, at + 300)).toContain('askToConfirmQueue');
  });

  it('adds the note in one place rather than at forty return sites', () => {
    // Threading it through each branch is how one of them gets forgotten.
    expect(webhook).toContain('async function runAssistantTool(');
    expect(webhook).toContain('const result = await runAssistantTool(');
    expect(webhook).toContain("if (!name.startsWith('get_')) return result;");
  });

  it('writes only on NDIYO, and drops everything on HAPANA', () => {
    expect(webhook).toContain("await db.rpc('wa_confirm_daily_record_batch'");
    expect(webhook).toContain("await db.rpc('wa_cancel_daily_record_batch'");
    // A failed save must not be reported as a save.
    expect(webhook).toContain('Hakuna kilichoingia; jaribu tena baada ya muda mfupi.');
  });
});
