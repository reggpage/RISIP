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
import {
  detectLanguage,
  parseLanguageCommand,
  parseProjectChoice,
  routeIntent,
  t,
  type Lang,
  type ProjectRef,
} from '../_shared/whatsappIntent.ts';

type Admin = ReturnType<typeof createClient>;

function admin(): Admin {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('server misconfigured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}


function appUrl(): string {
  return Deno.env.get('RISIP_PUBLIC_APP_URL') || 'https://risip.online';
}

/** Live conversation state, or null when nothing is pending or it has expired. */
async function loadConversation(db: Admin, identityId: string) {
  const { data } = await db
    .from('whatsapp_conversations')
    .select('awaiting, receipt_id, options, expires_at')
    .eq('identity_id', identityId)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await db.from('whatsapp_conversations').delete().eq('identity_id', identityId);
    return null;
  }
  return data;
}

async function clearConversation(db: Admin, identityId: string): Promise<void> {
  await db.from('whatsapp_conversations').delete().eq('identity_id', identityId);
}

/** Append-only trail: intent and outcome only, never bodies or secrets. */
async function audit(
  db: Admin, identity: any, waMessageId: string,
  intent: string, action: string, outcome: string, receiptId?: string,
): Promise<void> {
  try {
    await db.from('whatsapp_audit_log').insert({
      company_id: identity?.company_id ?? null,
      profile_id: identity?.profile_id ?? null,
      wa_message_id: waMessageId,
      intent, action, outcome,
      receipt_id: receiptId ?? null,
    });
  } catch { /* auditing must not break the flow */ }
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

  const { data: created, error: insErr } = await db.from('whatsapp_identities').insert({
    profile_id: profile.id,
    company_id: profile.company_id,
    phone_e164: phone,
    wa_id: waId,
  }).select('id').single();
  if (insErr || !created) {
    console.error('identity insert failed', insErr?.message);
    return 'Could not connect this number right now. Please try again.';
  }

  await db.from('whatsapp_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id);

  // Ask for a language once, right after linking, and park the conversation there
  // so the next message is read as the answer.
  await db.from('whatsapp_conversations').upsert({
    identity_id: created.id,
    company_id: profile.company_id,
    profile_id: profile.id,
    awaiting: 'language',
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'identity_id' });

  return `Connected.\n\n${t('chooseLanguage', 'en')}`;
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
          .select('id, profile_id, company_id, lang, revoked_at')
          .eq('phone_e164', phone)
          .is('revoked_at', null)
          .maybeSingle();

        const body: string | null = message?.text?.body ?? null;
        const lang: Lang = (identity?.lang as Lang | null) ?? detectLanguage(body) ?? 'en';
        const finish = (status: string, error?: string) =>
          db.from('whatsapp_messages')
            .update({
              status, ...(error ? { last_error: error } : {}),
              processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            })
            .eq('wa_message_id', waMessageId);

        // ── Receipt image (with its optional caption) ─────────────────────
        if (message?.type === 'image' && message?.image?.id) {
          if (!identity) {
            await replyQuietly(phone, t('notLinked', lang));
            await finish('skipped', 'unlinked');
            continue;
          }
          await db.from('whatsapp_messages').update({
            profile_id: identity.profile_id,
            company_id: identity.company_id,
            media_id: String(message.image.id),
            media_mime: message.image.mime_type ? String(message.image.mime_type) : null,
            // Untrusted text. Only ever matched against the sender's own projects.
            caption: message.image.caption ? String(message.image.caption).slice(0, 500) : null,
            updated_at: new Date().toISOString(),
          }).eq('wa_message_id', waMessageId);
          continue; // worker takes it from here
        }

        if (message?.type !== 'text') {
          await replyQuietly(phone, identity ? t('photoOnly', lang) : t('notLinked', lang));
          await finish('skipped', 'unsupported_message_type');
          continue;
        }

        // ── Text: deterministic routing, no model involved ────────────────
        const linkToken = parseLinkToken(body);
        const convo = identity ? await loadConversation(db, identity.id as string) : null;
        const intent = routeIntent({
          messageType: 'text',
          text: body,
          hasLinkToken: Boolean(linkToken),
          awaitingClarification: Boolean(convo),
        });

        if (intent === 'link_account') {
          const reply = await handleLink(db, phone, String(message?.from ?? ''), linkToken!);
          await replyQuietly(phone, reply);
          await finish('skipped');
          continue;
        }

        if (!identity) {
          await replyQuietly(phone, t('notLinked', lang));
          await finish('skipped', 'unlinked');
          continue;
        }

        if (intent === 'change_language') {
          const next = parseLanguageCommand(body)!;
          await db.from('whatsapp_identities').update({ lang: next, updated_at: new Date().toISOString() })
            .eq('id', identity.id);
          await clearConversation(db, identity.id as string);
          await replyQuietly(phone, t('languageSet', next));
          await audit(db, identity, waMessageId, 'change_language', next, 'applied');
          await finish('skipped');
          continue;
        }

        if (intent === 'cancel_action') {
          await clearConversation(db, identity.id as string);
          await replyQuietly(phone, t('cancelled', lang));
          await audit(db, identity, waMessageId, 'cancel_action', 'clear_state', 'applied');
          await finish('skipped');
          continue;
        }

        // Answering a question we asked. Language selection is handled first
        // because it is the only one a brand-new user can be in.
        if (convo?.awaiting === 'language') {
          const picked = /^1$/.test((body ?? '').trim()) ? 'sw'
            : /^2$/.test((body ?? '').trim()) ? 'en'
            : parseLanguageCommand(body);
          if (picked) {
            await db.from('whatsapp_identities').update({ lang: picked, updated_at: new Date().toISOString() })
              .eq('id', identity.id);
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, `${t('languageSet', picked)}\n\n${t('help', picked)}`);
            await finish('skipped');
            continue;
          }
          await replyQuietly(phone, t('chooseLanguage', lang));
          await finish('skipped');
          continue;
        }

        if (convo?.awaiting === 'project' && convo.receipt_id) {
          const options = (convo.options as ProjectRef[] | null) ?? [];
          const chosen = parseProjectChoice(body, options);
          if (!chosen) {
            await replyQuietly(
              phone,
              lang === 'sw'
                ? 'Sijaelewa. Jibu na namba ya mradi kutoka kwenye orodha, au andika *ghairi*.'
                : 'I did not catch that. Reply with the number of the project from the list, or type *cancel*.',
            );
            await finish('skipped');
            continue;
          }
          // Scope the write by company as well as id: a stale conversation row can
          // never be used to move a receipt belonging to another tenant.
          await db.from('receipts')
            .update({ project_id: chosen.id })
            .eq('id', convo.receipt_id)
            .eq('company_id', identity.company_id);
          await clearConversation(db, identity.id as string);
          await replyQuietly(
            phone,
            lang === 'sw'
              ? `Sawa. Risiti imewekwa kwenye ${chosen.name}. Kamilisha kategoria na chanzo cha malipo hapa:\n${appUrl()}/receipts?receipt=${convo.receipt_id}`
              : `Done. Filed under ${chosen.name}. Finish the category and payment source here:\n${appUrl()}/receipts?receipt=${convo.receipt_id}`,
          );
          await audit(db, identity, waMessageId, 'clarification_reply', 'project_selected', 'applied', convo.receipt_id as string);
          await finish('skipped');
          continue;
        }

        // Nothing pending: help, or a polite scope boundary.
        await replyQuietly(phone, intent === 'help' ? t('help', lang) : t('onlyRisip', lang));
        await finish('skipped');
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
