import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SNIPPE_TIMESTAMP_TOLERANCE_SECONDS,
  readSnippeEvent,
  verifySnippeSignature,
} from '../../../../supabase/functions/_shared/snippeSignature';

// THE ONLY THING BETWEEN "SOMEBODY PAID" AND "SOMEBODY TYPED A URL".
//
// snippe-webhook runs with verify_jwt=false, because Snippe cannot hold a
// Supabase JWT. The HMAC is not one layer of security here, it is the whole of
// it. Anyone who finds the address can POST to it; the signature is what
// separates a real payment from a stranger marking a shop paid for a year.
//
// Every case below is a way that check has been got wrong in real systems.

const SECRET = 'whsec_test_only_never_a_real_key';
const BODY = JSON.stringify({
  id: 'evt_a1b2c3',
  type: 'payment.completed',
  api_version: '2026-01-25',
  created_at: '2026-09-03T10:30:00Z',
  data: {
    reference: 'pi_a1b2c3',
    external_reference: '11111111-2222-3333-4444-555555555555',
    status: 'completed',
    amount: { value: 39999, currency: 'TZS' },
    settlement: { net: { value: 38999, currency: 'TZS' } },
  },
});

const NOW_MS = Date.parse('2026-09-03T10:30:05Z');
const TS = String(Math.floor(NOW_MS / 1000));
const sign = (timestamp: string, body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

describe('a signature Snippe actually produced', () => {
  it('is accepted', async () => {
    const out = await verifySnippeSignature(BODY, sign(TS, BODY), TS, SECRET, NOW_MS);
    expect(out).toEqual({ ok: true });
  });

  it('is accepted in upper case, since hex has two spellings', async () => {
    const upper = sign(TS, BODY).toUpperCase();
    expect(await verifySnippeSignature(BODY, upper, TS, SECRET, NOW_MS)).toEqual({ ok: true });
  });

  it('is accepted with surrounding whitespace, which proxies add', async () => {
    const padded = `  ${sign(TS, BODY)}  `;
    expect(await verifySnippeSignature(BODY, padded, TS, SECRET, NOW_MS)).toEqual({ ok: true });
  });
});

describe('everything that must be refused', () => {
  it('a body changed by one character', async () => {
    const tampered = BODY.replace('39999', '39990');
    const out = await verifySnippeSignature(tampered, sign(TS, BODY), TS, SECRET, NOW_MS);
    expect(out).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('a signature made with a different key', async () => {
    const wrong = sign(TS, BODY, 'whsec_someone_elses_key');
    expect(await verifySnippeSignature(BODY, wrong, TS, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'mismatch' });
  });

  it('a signature over the body alone, without the timestamp', async () => {
    // The classic implementation slip: HMAC the body, forget the prefix.
    const bare = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(await verifySnippeSignature(BODY, bare, TS, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'mismatch' });
  });

  it('a timestamp swapped for another one', async () => {
    const other = String(Number(TS) - 30);
    expect(await verifySnippeSignature(BODY, sign(TS, BODY), other, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'mismatch' });
  });

  it('a REPLAY of a genuine event from last month', async () => {
    // Perfectly valid signature, correct key, correct body. If age is not
    // checked, one captured "payment.completed" pays a shop forever.
    const old = String(Number(TS) - SNIPPE_TIMESTAMP_TOLERANCE_SECONDS - 60);
    expect(await verifySnippeSignature(BODY, sign(old, BODY), old, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'stale' });
  });

  it('a timestamp far in the future', async () => {
    const ahead = String(Number(TS) + SNIPPE_TIMESTAMP_TOLERANCE_SECONDS + 60);
    expect(await verifySnippeSignature(BODY, sign(ahead, BODY), ahead, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'stale' });
  });

  it('a missing signature, a missing timestamp, a missing secret', async () => {
    expect(await verifySnippeSignature(BODY, null, TS, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'no_signature' });
    expect(await verifySnippeSignature(BODY, sign(TS, BODY), null, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'no_timestamp' });
    // An unset secret must FAIL CLOSED. Treating a missing key as "skip the
    // check" is how a staging misconfiguration becomes an open door.
    expect(await verifySnippeSignature(BODY, sign(TS, BODY), TS, '', NOW_MS))
      .toEqual({ ok: false, reason: 'no_secret' });
  });

  it('a signature of the wrong length or shape', async () => {
    for (const bad of ['', 'abc', 'z'.repeat(64), sign(TS, BODY).slice(0, 63)]) {
      const out = await verifySnippeSignature(BODY, bad, TS, SECRET, NOW_MS);
      expect(out.ok).toBe(false);
    }
  });

  it('a body re-serialised rather than passed through', async () => {
    // THE MISTAKE THE DOCS WARN ABOUT, built the way it actually happens.
    // A server sends pretty-printed JSON and signs those bytes; a handler
    // parses it and re-serialises compactly. Same data, different bytes, and
    // from then on every genuine payment is rejected.
    const asSent = JSON.stringify(JSON.parse(BODY), null, 2);
    const signedAsSent = sign(TS, asSent);
    // Proof the signature is right for what was sent.
    expect(await verifySnippeSignature(asSent, signedAsSent, TS, SECRET, NOW_MS))
      .toEqual({ ok: true });
    // And wrong the moment the handler rebuilds the body itself.
    const rebuilt = JSON.stringify(JSON.parse(asSent));
    expect(rebuilt).not.toBe(asSent);
    expect(await verifySnippeSignature(rebuilt, signedAsSent, TS, SECRET, NOW_MS))
      .toEqual({ ok: false, reason: 'mismatch' });
  });
});

describe('reading the event', () => {
  it('takes the fields we act on', () => {
    expect(readSnippeEvent(JSON.parse(BODY))).toMatchObject({
      id: 'evt_a1b2c3',
      type: 'payment.completed',
      reference: 'pi_a1b2c3',
      externalReference: '11111111-2222-3333-4444-555555555555',
      status: 'completed',
      amountValue: 39999,
      amountCurrency: 'TZS',
      netValue: 38999,
    });
  });

  it('refuses a body with no id or no type', () => {
    expect(readSnippeEvent({ type: 'payment.completed' })).toBeNull();
    expect(readSnippeEvent({ id: 'evt_1' })).toBeNull();
    expect(readSnippeEvent(null)).toBeNull();
  });

  it('reads a missing amount as null rather than as zero', () => {
    // Zero is a number a shop could be charged. Absent is not.
    const out = readSnippeEvent({ id: 'e', type: 'payment.failed', data: {} });
    expect(out?.amountValue).toBeNull();
    expect(out?.netValue).toBeNull();
  });

  it('refuses an amount that is not a number', () => {
    const out = readSnippeEvent({
      id: 'e', type: 'payment.completed',
      data: { amount: { value: '39999; drop table', currency: 'TZS' } },
    });
    expect(out?.amountValue).toBeNull();
  });
});

describe('the function that uses it', () => {
  const fn = readFileSync(
    resolve(process.cwd(), 'supabase/functions/snippe-webhook/index.ts'), 'utf8');

  it('reads the body as raw text before anything else', () => {
    expect(fn).toContain('const rawBody = await req.text();');
    expect(fn.indexOf('await req.text()')).toBeLessThan(fn.indexOf('JSON.parse(rawBody)'));
  });

  it('refuses before it touches the database', () => {
    expect(fn.indexOf('return json(401')).toBeLessThan(fn.indexOf('createClient('));
  });

  it('tells a stranger nothing about why they failed', () => {
    expect(fn).toContain("json(401, { error: 'invalid signature' })");
    expect(fn).not.toContain('verdict.reason }');
  });

  it('records the event before it decides anything', () => {
    expect(fn.indexOf("from('subscription_events').insert"))
      .toBeLessThan(fn.indexOf("from('subscription_invoices')\n"));
  });

  it('treats a retried delivery as a no-op', () => {
    expect(fn).toContain("seen.code === '23505'");
    expect(fn).toContain('duplicate: true');
  });

  it('never reopens an invoice that is already paid', () => {
    expect(fn).toContain("invoice.status === 'paid'");
    expect(fn).toContain("already: 'paid'");
  });

  it('buys the period the invoice named, not a period from today', () => {
    expect(fn).toContain('current_period_end: invoice.period_end,');
  });

  it('cannot create a subscription or change a plan', () => {
    // A stranger past the signature should find nothing worth having.
    expect(fn).not.toContain("from('subscriptions').insert");
    expect(fn).not.toContain('plan:');
    expect(fn).not.toContain('amount_tzs:');
  });
});

describe('what the first live payment taught us', () => {
  const fn = readFileSync(
    resolve(process.cwd(), 'supabase/functions/snippe-webhook/index.ts'), 'utf8');

  it('handles payment.cancelled, which the docs do not list', () => {
    // It arrived at 07:41:50 on the first live test, for a push that expired
    // unpaid. An undocumented event that changes what a shop owes cannot be
    // quietly dropped.
    expect(fn).toContain("event.type === 'payment.cancelled'");
  });

  it('moves BOTH ends of the period', () => {
    // The first live payment left a subscription reading 27 August to 3
    // October: five weeks nobody had bought, because only the end moved.
    expect(fn).toContain('current_period_start: invoice.period_start,');
    expect(fn).toContain('current_period_end: invoice.period_end,');
  });

  it('reads period_start, or the fix above cannot work', () => {
    expect(fn).toContain('status, period_start, period_end, amount_tzs');
  });

  it('records that Snippe ignores our external_reference', () => {
    // Snippe returned "e62DOYL0BHqV" instead of our invoice id. The match
    // survives only because snippe_reference is stored at creation time.
    expect(fn).toContain('Snippe IGNORES the external_reference');
  });
});
