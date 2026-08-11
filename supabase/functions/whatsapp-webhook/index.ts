// whatsapp-webhook · Meta WhatsApp Cloud API webhook for receipt capture.
//
//   GET  → Meta's subscription challenge (hub.verify_token / hub.challenge).
//   POST → message events. We verify the signature against the RAW body, record
//          the message idempotently, and return 200 fast. No AI runs here: Meta
//          retries anything slow or non-200, which would double-file receipts.
//
// Two message shapes matter:
//   "LINK <token>" text → binds this WhatsApp number to a Risip profile.
//   image               → queued as a job for whatsapp-worker.
//
// verify_jwt = false — this is a public webhook. Security is the HMAC signature
// plus the fact that an unlinked number can do nothing but read a help message.
//
// Env: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
//      WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION?, RISIP_PUBLIC_APP_URL,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildUnlinkedReply,
  evaluateLinkToken,
  linkFailureMessage,
  maskPhone,
  normalizeE164,
  parseLinkToken,
  sha256Hex,
  verifyMetaSignature,
} from '../_shared/whatsapp.ts';
import { sendWhatsAppText } from '../_shared/whatsappApi.ts';

type Admin = ReturnType<typeof createClient>;

function admin(): Admin {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('server misconfigured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Best-effort reply. A send failure must never turn into a non-200 for Meta. */
async function replyQuietly(to: string, body: string): Promise<void> {
  try {
    await sendWhatsAppText(to, body);
  } catch (err) {
    console.error('reply failed', maskPhone(to), err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Bind a verified WhatsApp number to a profile using a single-use token.
 * The token is compared by hash, so the plaintext never has to be stored.
 */
async function handleLink(db: Admin, phone: string, waId: string, token: string): Promise<string> {
  const hash = await sha256Hex(token);
  const { data: row } = await db
    .from('whatsapp_link_tokens')
    .select('id, profile_id, company_id, expires_at, used_at, revoked_at, attempts')
    .eq('token_hash', hash)
    .maybeSingle();

  const verdict = evaluateLinkToken(row ?? null);
  if (!verdict.ok) {
    // Record the failed attempt so token probing is visible in the data.
    if (row?.id) {
      await db.from('whatsapp_link_tokens')
        .update({ attempts: Number(row.attempts ?? 0) + 1 })
        .eq('id', row.id);
    }
    return linkFailureMessage(verdict.reason);
  }

  // The employee must still be active in their company.
  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, company_id, deactivated_at')
    .eq('id', row.profile_id)
    .maybeSingle();
  if (!profile || profile.deactivated_at) {
    return 'That Risip account is no longer active. Contact your administrator.';
  }

  // A number may only ever point at one live profile.
  const { data: clash } = await db
    .from('whatsapp_identities')
    .select('id, profile_id')
    .eq('phone_e164', phone)
    .is('revoked_at', null)
    .maybeSingle();
  if (clash && clash.profile_id !== profile.id) {
    return 'This WhatsApp number is already connected to a different Risip account. Revoke it there first.';
  }

  // Replace any previous identity for this profile, then link.
  await db.from('whatsapp_identities')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('profile_id', profile.id)
    .is('revoked_at', null);

  const { error: insErr } = await db.from('whatsapp_identities').insert({
    profile_id: profile.id,
    company_id: profile.company_id,
    phone_e164: phone,
    wa_id: waId,
  });
  if (insErr) {
    console.error('identity insert failed', insErr.message);
    return 'Could not connect this number right now. Please try again.';
  }

  await db.from('whatsapp_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id);

  return [
    'Connected. This number now files receipts into Risip for your company.',
    '',
    'Send a photo of any receipt and I will read it, then give you a link to confirm the details.',
  ].join('\n');
}

/** Fire-and-forget: nudge the worker without blocking the 200 back to Meta. */
function nudgeWorker(): void {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  void fetch(`${url}/functions/v1/whatsapp-worker`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sweep: true }),
  }).catch(() => undefined);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Meta subscription challenge ──────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // ── Signature over the raw body ──────────────────────────────────────────
  const raw = await req.text();
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
  const ok = await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), appSecret);
  if (!ok) {
    console.error('rejected: bad signature');
    return new Response('invalid signature', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }

  let db: Admin;
  try { db = admin(); } catch { return new Response('misconfigured', { status: 500 }); }

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      // Delivery/read receipts carry `statuses`, not `messages` — ignore them.
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        const waMessageId = String(message?.id ?? '');
        const phone = normalizeE164(message?.from);
        if (!waMessageId || !phone) continue;

        // Idempotency gate: Meta delivers at least once, so a repeat delivery must
        // collide here rather than create a second job. Unique index does the work.
        const { error: dupErr } = await db.from('whatsapp_messages').insert({
          wa_message_id: waMessageId,
          phone_e164: phone,
          kind: String(message?.type ?? 'unknown'),
          status: 'pending',
        });
        if (dupErr) {
          if (dupErr.code === '23505') continue; // already seen — nothing to do
          console.error('message insert failed', dupErr.message);
          continue;
        }

        // Resolve identity once; used by both branches below.
        const { data: identity } = await db
          .from('whatsapp_identities')
          .select('profile_id, company_id, revoked_at')
          .eq('phone_e164', phone)
          .is('revoked_at', null)
          .maybeSingle();

        // ── Linking ──────────────────────────────────────────────────────
        if (message?.type === 'text') {
          const token = parseLinkToken(message?.text?.body);
          const reply = token
            ? await handleLink(db, phone, String(message?.from ?? ''), token)
            : identity
              ? 'Send a photo of a receipt and I will file it into Risip for you.'
              : buildUnlinkedReply();
          await replyQuietly(phone, reply);
          await db.from('whatsapp_messages')
            .update({ status: 'skipped', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('wa_message_id', waMessageId);
          continue;
        }

        // ── Receipt image ────────────────────────────────────────────────
        if (message?.type === 'image' && message?.image?.id) {
          if (!identity) {
            await replyQuietly(phone, buildUnlinkedReply());
            await db.from('whatsapp_messages')
              .update({ status: 'skipped', last_error: 'unlinked', processed_at: new Date().toISOString() })
              .eq('wa_message_id', waMessageId);
            continue;
          }
          await db.from('whatsapp_messages').update({
            profile_id: identity.profile_id,
            company_id: identity.company_id,
            media_id: String(message.image.id),
            media_mime: message.image.mime_type ? String(message.image.mime_type) : null,
            updated_at: new Date().toISOString(),
          }).eq('wa_message_id', waMessageId);
          continue; // worker takes it from here
        }

        // ── Anything else: one short message, no receipt row ─────────────
        await replyQuietly(
          phone,
          identity
            ? 'Please send the receipt as a photo. Documents, voice notes and videos are not supported yet.'
            : buildUnlinkedReply(),
        );
        await db.from('whatsapp_messages')
          .update({ status: 'skipped', last_error: 'unsupported_message_type', processed_at: new Date().toISOString() })
          .eq('wa_message_id', waMessageId);
      }
    }
  }

  nudgeWorker();
  // Always 200: a non-200 makes Meta retry a payload we have already recorded.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
