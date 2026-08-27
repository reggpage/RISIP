import { describe, expect, it } from 'vitest';
import {
  isDailyRecordCandidate,
  parseDailyRecord,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import {
  claimsRecordSaved,
  shouldDeferRecordLikeReply,
} from '../../../../supabase/functions/_shared/whatsappAssistant';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

// MEASURED FAILURE, three replies in one screenshot:
//
//   "nimeingiza trei 3 na mayai 15 leo"
//   -> "Sijaelewa vizuri. Andika mauzo, matumizi, mkopo, au malipo..."
//   "Mzigo mpya nimeingiza trei 3 na mayai 15 leo"   (rephrased for us)
//   -> the same sentence again, word for word.
//
// The model was never consulted. isDailyRecordCandidate is true for any
// record-SHAPED message and excluded every one of them from the assistant —
// including the ones the record parser then fails to read. A parser that could
// not understand the sentence still owned the reply, and all it had to say was
// that it did not understand.

/**
 * The webhook's own eligibility test, in the one line that matters. Kept here
 * rather than reaching into the edge function so the RULE is what is asserted:
 * a record-shaped message is deterministic ONLY when the deterministic path can
 * actually produce a record.
 */
const deterministicRecord = (said: string): boolean => {
  if (!isDailyRecordCandidate(said)) return false;
  const reading = parseDailyRecord(said, 'sw');
  return !(reading.kind === 'clarify' && reading.reason === 'message');
};

describe('who owns a record-shaped message', () => {
  it('no longer lets a parser take a bare list or a mixed batch first', () => {
    // THE INVERTED INVARIANT. These two lines used to sit in the eligibility
    // gate and were the reason "Feni 7 / Nguvu 6 / Antoni 4" never reached
    // Haiku: a parser counted the quantities, asked MAUZO or MANUNUZI, and
    // offered to register a product the shop already sells.
    // Asserted against the gate itself, not the file: the comment above it
    // quotes both removed lines on purpose, so the reader can see what used to
    // stand here and why it went.
    const gate = webhook.slice(
      webhook.indexOf('const aiEligible = messageGoesToModel'),
      webhook.indexOf('let messageRoute'),
    );
    expect(gate).not.toContain('parseBareQuantityList');
    expect(gate).not.toContain('deterministicBatch');
  });

  it('sends an ordinary sale to the model first', () => {
    // The highest-volume message in the product, and for four stages it was the
    // one that never met the model. The deterministic path can still read these
    // — that is what makes it a usable outage fallback — but reading them is no
    // longer the same thing as owning them.
    expect(deterministicRecord('nimeuza daftari 5 kwa 7500')).toBe(true);
    expect(deterministicRecord('nimenunua sukari kilo 50 kwa 130000')).toBe(true);
    expect(deterministicRecord('nimelipa umeme elfu ishirini')).toBe(true);
    // And nothing in the gate consults any of that before Claude.
    const gate = webhook.slice(
      webhook.indexOf('const aiEligible = messageGoesToModel'),
      webhook.indexOf('let messageRoute'),
    );
    expect(gate.length).toBeGreaterThan(50);
    for (const parser of [
      'parseBareQuantityList', 'parseDailyRecordBatch', 'parseQuantityOnlySale',
      'parseDailyRecord(', 'isDailyRecordCandidate', 'parseStockLoss',
      'parseSupplierCreditPurchase', 'parseWholeAnimalProcurement',
    ]) {
      expect(gate, `the gate still consults ${parser}`).not.toContain(parser);
    }
  });

  it('keeps a record it understood but needs one figure for', () => {
    // "How much?" is a real answer, not a confession. Still deterministic.
    const reading = parseDailyRecord('nimeuza daftari', 'sw');
    expect(reading.kind).toBe('clarify');
    if (reading.kind === 'clarify') expect(reading.reason).toBe('amount');
    expect(deterministicRecord('nimeuza daftari')).toBe(true);
  });

  it('hands over the sentence it could not read at all', () => {
    for (const said of [
      'nimeingiza trei 3 na mayai 15 leo',
      'Mzigo mpya nimeingiza trei 3 na mayai 15 leo',
    ]) {
      const reading = parseDailyRecord(said, 'sw');
      expect(reading.kind, said).toBe('clarify');
      if (reading.kind === 'clarify') expect(reading.reason, said).toBe('message');
      // The whole point: this must NOT be owned by the deterministic path.
      expect(deterministicRecord(said), said).toBe(false);
    }
  });
});

describe('what the model is allowed to say about a record', () => {
  // The real danger, unchanged: prose that claims a save when nothing saved.
  it('still refuses a claim that something was written', () => {
    for (const reply of [
      'Nimehifadhi mzigo wako wa trei 3.',
      'Imerekodiwa. Mayai 15 yameingizwa.',
      'Saved — 3 trays recorded.',
    ]) {
      expect(claimsRecordSaved(reply), reply).toBe(true);
      expect(shouldDeferRecordLikeReply(true, [], reply), reply).toBe(true);
    }
  });

  // MEASURED FAILURE: deferring EVERY tool-less reply threw away the model's
  // clarifying questions too, and the deterministic clarifier then printed
  // "Sijaelewa vizuri" at somebody who had just been asked something useful.
  it('lets a clarifying question through', () => {
    for (const reply of [
      'Unamaanisha umeingiza trei 3 za mayai? Nikuandikie kama manunuzi?',
      'Trei 3 ni mayai mangapi kwako?',
      'Hii ni mzigo unaoingia au mauzo?',
    ]) {
      expect(claimsRecordSaved(reply), reply).toBe(false);
      expect(shouldDeferRecordLikeReply(true, [], reply), reply).toBe(false);
    }
  });

  it('never defers when the model actually used a tool', () => {
    expect(shouldDeferRecordLikeReply(true, ['propose_daily_record'], 'Nimehifadhi.')).toBe(false);
  });

  // Older callers that pass no reply keep the strict original rule.
  it('keeps the strict behaviour when no reply is supplied', () => {
    expect(shouldDeferRecordLikeReply(true, [])).toBe(true);
    expect(shouldDeferRecordLikeReply(false, [])).toBe(false);
  });
});
