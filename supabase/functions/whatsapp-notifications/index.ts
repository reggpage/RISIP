import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  proactiveSendPayload,
  type ClaimedNotification,
} from '../_shared/whatsappNotifications.ts';
import { formatDailySummary, type DailySummaryItem } from '../_shared/whatsappDailySummary.ts';

const GRAPH_VERSION = Deno.env.get('WHATSAPP_API_VERSION') || 'v22.0';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function configured(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function serviceRequest(req: Request, serviceKey: string): boolean {
  return req.headers.get('authorization') === `Bearer ${serviceKey}`;
}

const keyOf = (value: string) => value.toLocaleLowerCase('sw-TZ')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function dayBounds(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00+03:00`);
  return { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() };
}

function dateLabel(date: string, lang: 'sw' | 'en'): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function isCurrentBusinessDate(date: string): boolean {
  return date === new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Add the detailed body without changing the approved template contract. */
async function enrichDailySummary(db: ReturnType<typeof createClient>, claim: ClaimedNotification): Promise<ClaimedNotification> {
  if (claim.notification_kind !== 'daily_summary') return claim;
  const p = claim.parameters ?? {};
  const businessDate = String(p.business_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return claim;
  const { data: delivery } = await db.from('whatsapp_notification_deliveries')
    .select('company_id').eq('id', claim.delivery_id).maybeSingle();
  const companyId = String((delivery as { company_id?: string } | null)?.company_id ?? '');
  if (!companyId) return claim;
  const bounds = dayBounds(businessDate);
  const [{ data: rawRows }, { data: rawCosts }, { data: stockRows }] = await Promise.all([
    db.from('daily_records').select('id, kind, amount, occurred_at, party_name')
      .eq('company_id', companyId).eq('status', 'confirmed')
      .gte('occurred_at', bounds.from).lt('occurred_at', bounds.to).limit(5000),
    db.from('product_costs').select('product_key, unit_cost, effective_from')
      .eq('company_id', companyId).order('effective_from', { ascending: true }).limit(10000),
    db.rpc('wa_stock_on_hand', { p_company_id: companyId, p_product: null }),
  ]);
  const rows = (rawRows ?? []) as Array<{ id: string; kind: string; amount: number; occurred_at: string; party_name: string | null }>;
  const ids = rows.map((row) => row.id);
  const { data: rawLines } = ids.length > 0
    ? await db.from('daily_record_lines').select('daily_record_id, description, quantity, line_total')
      .in('daily_record_id', ids).order('line_number', { ascending: true }).limit(20000)
    : { data: [] as Array<Record<string, unknown>> };
  const costs = ((rawCosts ?? []) as Array<Record<string, unknown>>).map((row) => ({
    key: keyOf(String(row.product_key ?? '')), cost: Number(row.unit_cost ?? 0), at: String(row.effective_from ?? ''),
  }));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const salesRows = rows.filter((row) => row.kind === 'sale' || row.kind === 'debt_issued');
  const sales = salesRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const expenses = rows.filter((row) => row.kind === 'expense').reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const losses = rows.filter((row) => row.kind === 'stock_loss').reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  let cogs = 0;
  const saleItems: DailySummaryItem[] = [];
  for (const raw of (rawLines ?? []) as Array<Record<string, unknown>>) {
    const record = rowById.get(String(raw.daily_record_id));
    if (!record || (record.kind !== 'sale' && record.kind !== 'debt_issued')) continue;
    const name = String(raw.description ?? '').trim();
    const quantity = Number(raw.quantity ?? 0);
    const total = Number(raw.line_total ?? 0);
    const historical = costs.filter((cost) => cost.key === keyOf(name) && cost.at <= record.occurred_at).at(-1);
    if (historical && quantity > 0) cogs += quantity * historical.cost;
    if (name && quantity > 0 && total >= 0) {
      saleItems.push({ name, quantity, total, unitPrice: total / quantity });
    }
  }
  const expenseItems: DailySummaryItem[] = rows.filter((row) => row.kind === 'expense').map((row) => ({
    name: row.party_name?.trim() || 'Matumizi', quantity: 1, total: Number(row.amount ?? 0), unitPrice: null,
  }));
  const alerts = ((stockRows ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({ name: String(row.product_name ?? '').trim(), quantity: Number(row.on_hand ?? 0), hasCount: Boolean(row.has_count) }))
    .filter((row) => row.name && row.hasCount);
  const outOfStock = alerts.filter((row) => row.quantity <= 0).map(({ name, quantity }) => ({ name, quantity }));
  const lowStock = alerts.filter((row) => row.quantity > 0 && row.quantity <= 5).map(({ name, quantity }) => ({ name, quantity }));
  const summaryText = formatDailySummary({
    businessName: String(p.business_name ?? 'Risip'), dateLabel: dateLabel(businessDate, claim.lang),
    isToday: isCurrentBusinessDate(businessDate),
    sales, cogs, expenses, profit: sales - cogs - expenses - losses,
    salesItems, expenseItems, outOfStock, lowStock, records: rows.length,
  }, claim.lang);
  return { ...claim, parameters: { ...p, summary_text: summaryText } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let supabaseUrl: string;
  let serviceKey: string;
  let accessToken: string;
  let phoneNumberId: string;
  try {
    supabaseUrl = configured('SUPABASE_URL');
    serviceKey = configured('SUPABASE_SERVICE_ROLE_KEY');
    accessToken = configured('WHATSAPP_ACCESS_TOKEN');
    phoneNumberId = configured('WHATSAPP_PHONE_NUMBER_ID');
  } catch (error) {
    console.error('notification sender misconfigured', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'misconfigured' }, 500);
  }

  if (!serviceRequest(req, serviceKey)) return json({ error: 'forbidden' }, 403);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const input = await req.json().catch(() => ({})) as { limit?: number; debt_stale_days?: number };
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 50));
  const staleDays = Math.max(1, Math.min(365, Number(input.debt_stale_days) || 7));

  // Drop drafts nobody ever answered.
  //
  // A pending row has never been counted anywhere, so this removes a question
  // and never a figure — but a question from last Tuesday reaching somebody's
  // batch this morning is exactly what happened, and it carried a week-old
  // misreading with it.
  const { error: sweepError } = await db.rpc('wa_sweep_abandoned_drafts', { p_older_than_hours: 12 });
  if (sweepError) {
    console.error('draft sweep failed', sweepError.code, sweepError.message);
  }

  // Queue the evening close reminders before claiming, so they go out on the
  // same run rather than waiting for the next one. Failure here must not stop
  // the daily summaries, which are the reason this endpoint exists.
  const { error: reminderError } = await db.rpc('wa_queue_close_reminders', { p_limit: limit });
  if (reminderError) {
    console.error('close reminder queue failed', reminderError.code, reminderError.message);
  }

  const { data, error } = await db.rpc('claim_whatsapp_notification_deliveries', {
    p_now: new Date().toISOString(),
    p_debt_stale_days: staleDays,
    p_limit: limit,
  });
  if (error) {
    console.error('notification claim failed', error.code, error.message);
    return json({ error: 'claim_failed' }, 500);
  }

  const claims = await Promise.all((data ?? []).map((row) => enrichDailySummary(
    db, row as ClaimedNotification,
  )));
  const result = { claimed: claims.length, sent: 0, failed: 0, unknown: 0 };

  for (const claim of claims) {
    let completion: 'sent' | 'failed' | 'unknown' = 'unknown';
    let providerMessageId: string | null = null;
    let safeError: string | null = null;
    try {
      const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(proactiveSendPayload(claim)),
      });
      const provider = await response.json().catch(() => ({})) as {
        messages?: Array<{ id?: string }>;
        error?: { code?: number; message?: string };
      };
      if (response.ok) {
        completion = 'sent';
        providerMessageId = String(provider.messages?.[0]?.id ?? '') || null;
        result.sent += 1;
      } else {
        completion = 'failed';
        safeError = `meta_${response.status}_${provider.error?.code ?? 'unknown'}`;
        result.failed += 1;
      }
    } catch (error) {
      // A transport error can happen after Meta accepted the request. Never
      // retry automatically: one missing summary is safer than a duplicate.
      completion = 'unknown';
      safeError = error instanceof Error ? error.name : 'network_error';
      result.unknown += 1;
    }

    const { error: completionError } = await db.rpc('complete_whatsapp_notification_delivery', {
      p_delivery_id: claim.delivery_id,
      p_status: completion,
      p_provider_message_id: providerMessageId,
      p_error: safeError,
    });
    if (completionError) {
      console.error('notification completion failed', completionError.code, claim.delivery_id);
    }
  }

  return json(result);
});
