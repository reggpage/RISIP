// Snippe tells us a subscription was paid.
//
// Same shape as the Meta webhook, for the same reasons, and the reasons are
// worth restating because this one moves money:
//
//   verify_jwt=false      Snippe cannot hold a Supabase JWT. The HMAC is the
//                         authentication, and it is the ONLY authentication.
//   200 immediately       Snippe gives us 30 seconds and then retries. Work
//                         that takes longer than the reply belongs after it.
//   raw body, once        The signature covers the exact bytes. Reading the
//                         body as JSON first breaks every real payment.
//   event id is the key   Snippe retries up to five times. One payment must
//                         land once, and that is a unique index, not a flag.
//
// WHAT THIS FUNCTION IS ALLOWED TO DO: mark an invoice paid and move the
// subscription period forward. Nothing else. It never creates a subscription,
// never changes a plan and never touches a price, because a stranger who ever
// gets past the signature should find nothing here worth having.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  readSnippeEvent,
  verifySnippeSignature,
} from '../_shared/snippeSignature.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const signingKey = Deno.env.get('SNIPPE_WEBHOOK_SECRET') ?? '';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  // THE RAW BYTES, READ ONCE. Everything below works from this string.
  const rawBody = await req.text();

  const verdict = await verifySnippeSignature(
    rawBody,
    req.headers.get('x-webhook-signature'),
    req.headers.get('x-webhook-timestamp'),
    signingKey,
  );

  if (!verdict.ok) {
    // Deliberately uninformative to the caller. A stranger probing this address
    // learns that it exists and nothing else: not whether the secret is set,
    // not whether their timestamp was the problem, not how close they were.
    console.warn(`snippe-webhook rejected: ${verdict.reason}`);
    return json(401, { error: 'invalid signature' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Signed but unreadable. 200 so Snippe stops retrying something that will
    // never parse, and a line in the log so we find out.
    console.error('snippe-webhook: signed body was not JSON');
    return json(200, { received: true });
  }

  const event = readSnippeEvent(parsed);
  if (!event) {
    console.error('snippe-webhook: signed body had no id or type');
    return json(200, { received: true });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ── The event is recorded BEFORE anything is decided ─────────────────
  //
  // If the work below fails, the evidence still exists and the payment can be
  // reconciled by hand. The unique index on external_event_id is what makes a
  // fifth retry a no-op rather than a fifth payment.
  const { error: seen } = await db.from('subscription_events').insert({
    external_event_id: event.id,
    kind: event.type,
    payload: parsed as Record<string, unknown>,
  });
  if (seen && seen.code === '23505') {
    return json(200, { received: true, duplicate: true });
  }

  const reference = event.externalReference ?? event.reference;
  if (!reference) return json(200, { received: true });

  // Our invoice id travels as external_reference, so a payment always names the
  // period it settles. Falling back to Snippe's own reference covers a payment
  // created before that convention existed.
  const { data: invoice } = await db
    .from('subscription_invoices')
    .select('id, subscription_id, company_id, status, period_end, amount_tzs')
    .or(`id.eq.${/^[0-9a-f-]{36}$/i.test(reference) ? reference : '00000000-0000-0000-0000-000000000000'},`
      + `snippe_reference.eq.${event.reference ?? '-'}`)
    .maybeSingle();

  if (!invoice) {
    console.warn(`snippe-webhook: no invoice matches ${event.type}`);
    return json(200, { received: true, matched: false });
  }

  const outcome = event.type === 'payment.completed' ? 'paid'
    : event.type === 'payment.failed' ? 'failed'
    : event.type === 'payment.voided' || event.type === 'payment.expired' ? 'void'
    : null;
  if (!outcome) return json(200, { received: true });

  // ALREADY SETTLED IS NOT AN ERROR. A late duplicate must never reopen a paid
  // period or take a shop's access away after it has been granted.
  if (invoice.status === 'paid') {
    return json(200, { received: true, already: 'paid' });
  }

  await db.from('subscription_invoices').update({
    status: outcome,
    snippe_reference: event.reference,
    snippe_status: event.status,
    paid_at: outcome === 'paid' ? new Date().toISOString() : null,
  }).eq('id', invoice.id);

  await db.from('subscription_events')
    .update({ company_id: invoice.company_id, invoice_id: invoice.id })
    .eq('external_event_id', event.id);

  if (outcome === 'paid') {
    // The period the shop just bought is the one the invoice named. Reading it
    // from the invoice rather than from "today" means a payment that arrives
    // three days late still buys the month it was for, not a month from now.
    await db.from('subscriptions').update({
      status: 'active',
      current_period_end: invoice.period_end,
      grace_until: null,
      updated_at: new Date().toISOString(),
    }).eq('id', invoice.subscription_id);
  }

  return json(200, { received: true });
});
