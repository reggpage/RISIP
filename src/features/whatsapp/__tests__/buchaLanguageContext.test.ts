import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDailyRecord } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import {
  extractPaymentMethod,
  parsePaymentMethodAnswer,
} from '../../../../supabase/functions/_shared/whatsappPaymentMethod';

// PHASE 5 PART 5.
//
// Proven against production, rolled back:
//
//   exact alias                    Chakula cha mbwa | alias | 1.0
//   reconstructed from "mbwa"      Chakula cha mbwa | alias | 1.0   (was trigram 0.4706)
//   two terms ending the same way  falls through to the resolver
//   canonical name                 exact
//   Juma owes 6000 -> 4000 -> 3000, methods cash then mobile_money
//   the debt record itself         debt_issued | pay=NULL
//   pending sale + "cash"          NULL -> cash, still pending_confirmation
//   the same on a confirmed debt   not_pending

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

describe('the shop’s own words beat a weak guess', () => {
  const migration = src('supabase/migrations/0130_the_shops_own_words_beat_a_weak_guess.sql');

  it('reaches an alias from the tail of the phrase', () => {
    // "mbwa" is the tail of "za mbwa". The joiner went with the measure that
    // led the sentence, and the shop never configured the bare word.
    expect(migration).toContain("and v.term_key like '% ' || v_key");
  });

  it('only when exactly one configured term ends that way', () => {
    // Two candidates mean the shop's words do not settle it either, and the
    // resolver below knows how to ask.
    expect(migration).toContain('if v_tail_matches = 1 then');
  });

  it('keeps the order: canonical, then alias, then reconstruction, then fuzzy', () => {
    const body = migration.slice(migration.indexOf('if not v_exact then'));
    expect(body.indexOf('v.term_key = v_key')).toBeLessThan(body.indexOf("like '% ' || v_key"));
    expect(body.indexOf("like '% ' || v_key"))
      .toBeLessThan(body.indexOf('private.resolve_company_product_read'));
  });

  it('moves no threshold and hardcodes no word', () => {
    // The comment quotes the measured 0.4706 that started this, so the check is
    // on what EXECUTES: the fuzzy engine is called, never redefined, and no
    // similarity threshold appears in this file at all.
    const code = migration.split(String.fromCharCode(10))
      .filter((line) => !line.trimStart().startsWith('--'))
      .join(String.fromCharCode(10));
    expect(code).toContain('private.resolve_company_product_read(v_key)');
    expect(code).not.toContain('create or replace function private.resolve_company_product_read');
    expect(code).not.toMatch(new RegExp("similarity|0[.][0-9]"));
    expect(code.toLowerCase()).not.toContain('mbwa');
  });
});

describe('answering the question on the screen', () => {
  it('reads a bare payment word as an answer', () => {
    expect(parsePaymentMethodAnswer('cash')).toBe('cash');
    expect(parsePaymentMethodAnswer('mpesa')).toBe('mobile_money');
    expect(parsePaymentMethodAnswer('benki')).toBe('bank');
  });

  it('does not read it as a sale of its own', () => {
    // extractPaymentMethod refuses a message that is nothing but the word; the
    // flow that asked owns it.
    expect(extractPaymentMethod('cash')).toBeNull();
  });

  it('never lets credit answer the question', () => {
    expect(parsePaymentMethodAnswer('deni')).toBeNull();
    expect(parsePaymentMethodAnswer('hajalipa')).toBeNull();
  });

  it('applies the answer to the pending draft and asks again', () => {
    // OUTAGE PATH. "Mpesa" beside a pending draft is read by the model now and
    // returned through resolve_pending_clarification; this phrase list of
    // Tanzanian mobile-money brands runs only when the model was never
    // consulted. What it does once it runs is unchanged.
    expect(webhook).toContain('const answeredMethod = messageGoesToModel(convo, body, systemCommand)');
    expect(webhook).toContain("await db.rpc('wa_set_draft_payment_method', {");
    // Nothing is saved a moment earlier than it would have been.
    const branch = webhook.slice(webhook.indexOf('const answeredMethod = messageGoesToModel(convo, body, systemCommand)'));
    expect(branch.slice(0, 1600)).toContain('buildDailyRecordConfirmation(withMethod, lang)');
    expect(branch.slice(0, 1600)).not.toContain('wa_confirm_daily_record');
  });

  it('leaves yes and no to the confirmation itself', () => {
    expect(webhook).toContain('!isDailyRecordConfirmation(body) && !isDailyRecordRejection(body)');
  });
});

describe('what the payment answer may touch', () => {
  const migration = src('supabase/migrations/0131_answering_how_it_was_paid.sql');

  it('is one field, on a draft, in the caller’s own company', () => {
    expect(migration).toContain("if v_record.status <> 'pending_confirmation' then");
    expect(migration).toContain('WhatsApp identity is not active in this company');
    expect(migration).toContain('set payment_method = v_method, updated_at = now()');
  });

  it('cannot confirm anything', () => {
    expect(migration).not.toContain("status = 'confirmed'");
  });

  it('refuses to put a payment method on a credit sale', () => {
    expect(migration).toContain("if v_record.kind = 'debt_issued' then");
    expect(migration).toContain("hint = 'deni_is_not_a_payment_method'");
  });
});

describe('a customer paying is its own event', () => {
  it.each([
    ['Juma amelipa 2000 cash', 2000, 'cash'],
    ['Juma amelipa 2000 mpesa', 2000, 'mobile_money'],
  ])('reads %s', (said, amount, method) => {
    const reading = parseDailyRecord(said, 'sw');
    expect(reading.kind).toBe('parsed');
    if (reading.kind !== 'parsed') return;
    expect(reading.record.kind).toBe('customer_payment');
    expect(reading.record.amount).toBe(amount);
    expect(reading.record.partyName).toBe('Juma');
    expect(extractPaymentMethod(said)?.method).toBe(method);
  });

  it('leaves the method unstated when the trader did not say', () => {
    expect(extractPaymentMethod('Juma amelipa 2000')).toBeNull();
  });

  it('does not reach back and change the credit sale', () => {
    // A credit sale and a later payment are separate financial events. Proven
    // in the database: the debt record stayed debt_issued | pay=NULL after two
    // payments landed against it.
    const migration = src('supabase/migrations/0131_answering_how_it_was_paid.sql');
    expect(migration).toContain("return jsonb_build_object('updated', false, 'reason', 'kind_is_credit');");
  });
});
