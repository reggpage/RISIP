import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  proactiveSendPayload,
  type ClaimedNotification,
} from '../_shared/whatsappNotifications.ts';

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

  const claims = (data ?? []) as ClaimedNotification[];
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
