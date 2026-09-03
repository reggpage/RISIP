// Raising invoices, and asking Snippe for the money.
//
// Two actions, deliberately separate, because they carry different risk:
//
//   sweep   Reads subscriptions whose period is ending and writes an invoice
//           for each. Touches no money and calls nothing outside Supabase.
//           Safe to run twice, safe to run every hour, safe to run by mistake.
//
//   pay     Asks Snippe to push a USSD prompt for ONE invoice. This is the
//           action that can take money off somebody, so it names the invoice
//           explicitly, refuses anything already paid, and refuses an amount
//           above a hard ceiling no plan can legitimately reach.
//
// AUTHENTICATION. verify_jwt is false because a cron caller cannot hold a
// Supabase JWT, exactly as with ops-watch. The shared secret is the whole gate,
// so it is compared in constant time and a wrong one is answered with 403 and
// nothing else.
//
// THE OPEN QUESTION THIS FUNCTION EXISTS TO ANSWER. Snippe's docs say amounts
// are "integer, smallest unit", minimum 500. Their own example shows a fee of
// 1000 on an amount of 50000, which is 2 per cent, and that reads as shillings
// rather than cents. Both readings fit. One test payment settles it, and until
// it is settled MAX_CHARGE_TZS keeps a hundredfold mistake off a shop's phone.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { timingSafeEqualHex } from '../_shared/whatsapp.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const snippeKey = Deno.env.get('SNIPPE_API_KEY') ?? '';
const secret = Deno.env.get('BILLING_SECRET') ?? '';

const SNIPPE_BASE = 'https://api.snippe.sh';
const WEBHOOK_URL = `${url}/functions/v1/snippe-webhook`;

/** No plan costs this much. A bug that multiplies by 100 stops here. */
const MAX_CHARGE_TZS = 200_000;

/** How many days before a period ends the invoice is raised. */
const RAISE_DAYS_AHEAD = 3;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function authorised(req: Request): boolean {
  if (!secret) return false;
  const given = new URL(req.url).searchParams.get('secret')
    ?? req.headers.get('x-billing-secret') ?? '';
  // Compared as hex-safe strings of equal length only; anything else is false
  // without revealing how close it was.
  return given.length === secret.length && timingSafeEqualHex(given, secret);
}

type Invoice = {
  id: string;
  company_id: string;
  subscription_id: string;
  amount_tzs: number;
  status: string;
  snippe_reference: string | null;
  attempts: number;
};

Deno.serve(async (req) => {
  if (!authorised(req)) return json(403, { error: 'forbidden' });

  const params = new URL(req.url).searchParams;
  const action = params.get('action') ?? 'sweep';
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ── sweep: write the invoices that are due ─────────────────────────────
  if (action === 'sweep') {
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + RAISE_DAYS_AHEAD);
    const cutoff = horizon.toISOString().slice(0, 10);

    const { data: due, error } = await db
      .from('subscriptions')
      .select('id, company_id, plan, cycle, current_period_end, status')
      .in('status', ['trialing', 'active', 'past_due'])
      .lte('current_period_end', cutoff)
      .limit(200);
    if (error) return json(500, { error: 'could not read subscriptions' });

    const { data: plans } = await db
      .from('billing_plans')
      .select('code, monthly_tzs, yearly_tzs');
    const priceOf = (code: string, cycle: string) => {
      const plan = (plans ?? []).find((p) => p.code === code);
      if (!plan) return null;
      return cycle === 'yearly' ? Number(plan.yearly_tzs) : Number(plan.monthly_tzs);
    };

    const raised: string[] = [];
    const skipped: string[] = [];
    for (const sub of due ?? []) {
      const amount = priceOf(String(sub.plan), String(sub.cycle));
      if (!amount || amount <= 0 || amount > MAX_CHARGE_TZS) {
        skipped.push(`${sub.id}:price`);
        continue;
      }
      // The new period starts where the old one ends, so a late payment still
      // buys the month it was for rather than a month from today.
      const start = String(sub.current_period_end);
      const end = new Date(`${start}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + (sub.cycle === 'yearly' ? 12 : 1));

      const { error: dup } = await db.from('subscription_invoices').insert({
        subscription_id: sub.id,
        company_id: sub.company_id,
        plan: sub.plan,
        cycle: sub.cycle,
        amount_tzs: amount,
        period_start: start,
        period_end: end.toISOString().slice(0, 10),
      });
      // 23505 is the one-invoice-per-period index doing its job. A sweep that
      // runs twice raises nothing the second time, which is the point.
      if (dup) { skipped.push(`${sub.id}:${dup.code === '23505' ? 'exists' : 'error'}`); continue; }
      raised.push(String(sub.id));
    }
    return json(200, { action, due: (due ?? []).length, raised: raised.length, skipped });
  }

  // ── pay: ask Snippe to push one USSD prompt ────────────────────────────
  if (action === 'pay') {
    if (!snippeKey) return json(500, { error: 'SNIPPE_API_KEY is not set' });

    const invoiceId = params.get('invoice') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return json(400, { error: 'invoice id required' });

    const phone = (params.get('phone') ?? '').replace(/[^0-9]/g, '');
    if (!/^255[0-9]{9}$/.test(phone)) {
      return json(400, { error: 'phone must be 255XXXXXXXXX' });
    }

    const { data: invoice } = await db
      .from('subscription_invoices')
      .select('id, company_id, subscription_id, amount_tzs, status, snippe_reference, attempts')
      .eq('id', invoiceId)
      .maybeSingle<Invoice>();
    if (!invoice) return json(404, { error: 'no such invoice' });
    if (invoice.status === 'paid') return json(409, { error: 'already paid' });

    // An override exists ONLY so the first live test can be a small amount.
    // It can lower the charge and never raise it.
    const asked = Number(params.get('amount') ?? invoice.amount_tzs);
    const amount = Math.min(
      Number.isFinite(asked) && asked > 0 ? Math.round(asked) : invoice.amount_tzs,
      invoice.amount_tzs,
    );
    if (amount < 500 || amount > MAX_CHARGE_TZS) {
      return json(400, { error: `amount out of range: ${amount}` });
    }

    const response = await fetch(`${SNIPPE_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${snippeKey}`,
        'content-type': 'application/json',
        // The invoice id, so a retry of THIS request can never become a second
        // charge on the same shop for the same month.
        'idempotency-key': invoice.id,
      },
      body: JSON.stringify({
        payment_type: 'mobile',
        details: { amount, currency: 'TZS' },
        phone_number: phone,
        // Sent so the webhook can name the invoice directly. If Snippe ignores
        // either field the flow still works, because the reference they return
        // is stored below and the webhook matches on that too.
        external_reference: invoice.id,
        webhook_url: WEBHOOK_URL,
      }),
    });

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* keep the text */ }
    const data = (payload.data ?? payload) as Record<string, unknown>;
    const reference = data.reference ? String(data.reference) : null;

    await db.from('subscription_invoices').update({
      attempts: invoice.attempts + 1,
      snippe_reference: reference,
      snippe_status: data.status ? String(data.status) : null,
    }).eq('id', invoice.id);

    await db.from('subscription_events').insert({
      company_id: invoice.company_id,
      invoice_id: invoice.id,
      kind: `payment.requested.${response.status}`,
      payload: { sent: { amount, currency: 'TZS' }, received: payload },
    });

    return json(response.ok ? 200 : 502, {
      action,
      invoice: invoice.id,
      requested_amount: amount,
      snippe_status: response.status,
      reference,
      // Echoed so the first live test can be read without a second lookup.
      body: payload,
    });
  }

  return json(400, { error: 'action must be sweep or pay' });
});
