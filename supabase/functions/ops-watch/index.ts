// THE THING THAT TELLS YOU TO LOOK.
//
// The admin console already shows failures, stale work, latency, cost and
// per-company limits, and it shows them well. What it cannot do is reach you.
// It is a page you have to open, and the one time this service went down
// completely, the owner found it himself — after every message had been
// failing for a while.
//
// MEASURED, over the first 711 messages: ten died as
// worker_ended_before_completion with nobody told, and one full outage was
// found by the shopkeeper rather than by us.
//
// EMAIL, not WhatsApp, and that is deliberate. A business-initiated WhatsApp
// message needs an approved template and a 24-hour window; an alarm that fires
// at two in the morning would find that window shut. Email has no window.
//
// Two modes, one function:
//   ?mode=watch   every few minutes  -> writes nothing unless something is wrong
//   ?mode=digest  once a day         -> the numbers, whether or not they are bad
//
// It reads only counts and codes. No message text, no phone numbers, no
// customer names, no amounts.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

type Finding = { severity: 'down' | 'warn'; title: string; detail: string };

function admin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('supabase env not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Is the front door answering?
 *
 * An unsigned POST must come back 401. That single fact proves the module
 * parsed, booted, and reached its signature check — which is exactly what a
 * BOOT_ERROR breaks. A 503 here is the outage nobody noticed last time.
 */
async function probeWebhook(): Promise<Finding | null> {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) return null;
  const url = `${base}/functions/v1/whatsapp-webhook`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (res.status === 401) return null;
    const body = (await res.text()).slice(0, 200);
    return {
      severity: 'down',
      title: `WhatsApp webhook answered ${res.status}, expected 401`,
      detail: body.includes('BOOT_ERROR')
        ? 'BOOT_ERROR — the function failed to parse. Every incoming message is being dropped right now.'
        : `Unexpected response: ${body}`,
    };
  } catch (err) {
    return {
      severity: 'down',
      title: 'WhatsApp webhook did not answer',
      detail: err instanceof Error ? err.message : 'no response within 10s',
    };
  }
}

const since = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function healthFindings(db: ReturnType<typeof admin>): Promise<Finding[]> {
  const found: Finding[] = [];

  // Work that started and never finished. This is the silent failure: the
  // shopkeeper typed and got nothing back.
  const { count: stuck } = await db.from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'processing'])
    .lt('created_at', since(15));
  if ((stuck ?? 0) > 0) {
    found.push({
      severity: 'down',
      title: `${stuck} message${stuck === 1 ? '' : 's'} stuck for over 15 minutes`,
      detail: 'Someone typed and has not been answered. Check the WhatsApp ops page.',
    });
  }

  // A burst of failures is different from the occasional one.
  const { count: failed } = await db.from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('updated_at', since(60));
  if ((failed ?? 0) >= 3) {
    found.push({
      severity: 'warn',
      title: `${failed} messages failed in the last hour`,
      detail: 'Above the normal rate. Look at the failure breakdown before it becomes a pattern.',
    });
  }

  // The model or the provider having a bad hour.
  const { count: providerFailed } = await db.from('whatsapp_ai_interpretations')
    .select('id', { count: 'exact', head: true })
    .eq('backend_outcome', 'provider_failed')
    .gte('created_at', since(60));
  if ((providerFailed ?? 0) >= 3) {
    found.push({
      severity: 'warn',
      title: `${providerFailed} AI provider failures in the last hour`,
      detail: 'Check the Anthropic status and the account credit balance.',
    });
  }

  return found;
}

/** The numbers, once a day, whether or not anything is wrong. */
async function digestLines(db: ReturnType<typeof admin>): Promise<string[]> {
  const day = since(24 * 60);
  const week = since(7 * 24 * 60);

  const [messages, failed, aiTurns, records, companies, activeCompanies] = await Promise.all([
    db.from('whatsapp_messages').select('id', { count: 'exact', head: true })
      .gte('created_at', day),
    db.from('whatsapp_messages').select('id', { count: 'exact', head: true })
      .eq('status', 'failed').gte('updated_at', day),
    db.from('whatsapp_ai_interpretations').select('id', { count: 'exact', head: true })
      .gte('created_at', day),
    db.from('daily_records').select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed').gte('created_at', day),
    db.from('companies').select('id', { count: 'exact', head: true }),
    db.from('whatsapp_messages').select('company_id').gte('created_at', week),
  ]);

  // A shop that linked a number and then went quiet is churn before it is
  // anything else. For a pilot this is the line worth reading first.
  const spokeThisWeek = new Set(
    ((activeCompanies.data ?? []) as Array<{ company_id: string | null }>)
      .map((row) => row.company_id).filter(Boolean),
  );
  const quiet = Math.max(0, (companies.count ?? 0) - spokeThisWeek.size);

  return [
    `Messages handled: ${messages.count ?? 0}`,
    `Messages failed: ${failed.count ?? 0}`,
    `AI turns: ${aiTurns.count ?? 0}`,
    `Records confirmed: ${records.count ?? 0}`,
    `Shops silent 7+ days: ${quiet} of ${companies.count ?? 0}`,
  ];
}

async function sendEmail(subject: string, body: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Risip <onboarding@resend.dev>';
  const to = Deno.env.get('OPS_ALERT_EMAIL');
  if (!apiKey || !to) {
    console.error('ops-watch: RESEND_API_KEY or OPS_ALERT_EMAIL not set');
    return false;
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });
  if (!res.ok) {
    console.error('ops-watch: resend rejected', res.status);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  // Not a public endpoint. Cron cannot carry a JWT, so it carries a secret.
  const url = new URL(req.url);
  const expected = Deno.env.get('OPS_WATCH_SECRET') ?? '';
  const given = url.searchParams.get('secret') ?? req.headers.get('x-ops-secret') ?? '';
  if (!expected || given !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  const mode = url.searchParams.get('mode') === 'digest' ? 'digest' : 'watch';
  let db: ReturnType<typeof admin>;
  try { db = admin(); } catch { return new Response('misconfigured', { status: 500 }); }

  if (mode === 'digest') {
    const lines = await digestLines(db);
    const findings = await healthFindings(db);
    const body = [
      'Risip — last 24 hours',
      '',
      ...lines,
      '',
      findings.length === 0
        ? 'Nothing needs attention right now.'
        : `Needs attention:\n${findings.map((f) => `- ${f.title}`).join('\n')}`,
    ].join('\n');
    const sent = await sendEmail('Risip — daily digest', body);
    return Response.json({ ok: true, mode, sent, findings: findings.length });
  }

  // Probed once. Calling it twice to build the array would double every alarm
  // and, on a slow day, time the function out on its own health check.
  const probe = await probeWebhook();
  const findings: Finding[] = [
    ...(probe ? [probe] : []),
    ...(await healthFindings(db)),
  ];

  // Silence when healthy. An alarm that fires every five minutes whether or not
  // anything is wrong is an alarm nobody reads by the end of the week.
  if (findings.length === 0) return Response.json({ ok: true, mode, findings: 0 });

  const worst = findings.some((f) => f.severity === 'down') ? 'DOWN' : 'WARNING';
  const body = [
    `Risip — ${worst}`,
    '',
    ...findings.map((f) => `${f.title}\n  ${f.detail}`),
    '',
    'Admin console: check WhatsApp ops and AI ops.',
  ].join('\n');
  const sent = await sendEmail(`Risip ${worst}: ${findings[0].title}`, body);
  return Response.json({ ok: true, mode, findings: findings.length, sent });
});
