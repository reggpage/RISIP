// whatsapp-worker · Background processing for receipts sent over WhatsApp.
//
// The webhook only records the message and returns 200. This function does the
// slow work: download the media from Meta, store it under the normal receipts
// convention, and hand off to the EXISTING extract-receipt function (we invoke it
// rather than re-implementing the prompt, duplicate guard or merchant memory).
//
// Reliability without a queue extension: whatsapp_messages IS the job table.
// Jobs are claimed atomically, retried with a cap, and any job left 'processing'
// by a crashed run is swept back to 'pending' on the next call. pg_cron/pg_net
// are not installed on this project, so the webhook nudges us and each nudge also
// sweeps — see docs/whatsapp-setup.md for the trade-off and the cron upgrade.
//
// verify_jwt = true — only callers holding the service-role key may run it.
//
// Env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION?,
//      RISIP_PUBLIC_APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildFailureReply,
  buildReceiptReply,
  buildReviewUrl,
  maskPhone,
  validateMedia,
} from '../_shared/whatsapp.ts';
import { downloadMedia, getMediaMeta, sendWhatsAppText } from '../_shared/whatsappApi.ts';

const MAX_RETRIES = 3;
const STALE_MINUTES = 5;
const BATCH = 5;

type Admin = ReturnType<typeof createClient>;

function appUrl(): string {
  return Deno.env.get('RISIP_PUBLIC_APP_URL') || 'https://risip.online';
}

async function replyQuietly(to: string | null, body: string): Promise<void> {
  if (!to) return;
  try {
    await sendWhatsAppText(to, body);
  } catch (err) {
    console.error('reply failed', maskPhone(to), err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Pick the project this receipt should land in. The employee confirms or changes
 * it in the web app; we only need a valid, in-company home for the row. Members
 * get their own most recent project, finance falls back to the company's.
 */
async function pickProject(db: Admin, profileId: string, companyId: string): Promise<string | null> {
  const { data: memberships } = await db
    .from('project_members')
    .select('project_id')
    .eq('profile_id', profileId);

  const ids = (memberships ?? []).map((m) => m.project_id as string);
  if (ids.length > 0) {
    const { data } = await db
      .from('projects')
      .select('id')
      .in('id', ids)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data: fallback } = await db
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (fallback?.id as string) ?? null;
}

/** Tell the company's finance people that something is waiting, in-app only. */
async function notifyReviewers(
  db: Admin,
  companyId: string,
  actorId: string,
  receiptId: string,
  vendor: string | null,
  total: number | null,
): Promise<void> {
  const { data: reviewers } = await db
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .in('role', ['owner', 'accountant'])
    .is('deactivated_at', null);
  if (!reviewers?.length) return;

  const { data: actor } = await db.from('profiles').select('full_name').eq('id', actorId).maybeSingle();
  const amount = total == null ? '' : ` · TZS ${Number(total).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  await db.from('app_notifications').insert(
    reviewers.map((r) => ({
      company_id: companyId,
      recipient_id: r.id as string,
      actor_id: actorId,
      type: 'receipt_pending_review',
      title: 'Receipt sent via WhatsApp',
      body: `${actor?.full_name ?? 'A staff member'} sent ${vendor ?? 'a receipt'}${amount}. It is pending review.`,
      metadata: { receipt_id: receiptId, source: 'whatsapp' },
    })),
  );
}

async function processJob(db: Admin, job: any): Promise<void> {
  const phone = job.phone_e164 as string | null;
  const reviewUrl = buildReviewUrl(appUrl());

  // Re-check the identity at processing time: it may have been revoked, or the
  // employee deactivated, between the webhook and now.
  const { data: identity } = await db
    .from('whatsapp_identities')
    .select('profile_id, company_id')
    .eq('phone_e164', phone ?? '')
    .is('revoked_at', null)
    .maybeSingle();
  if (!identity) {
    await db.from('whatsapp_messages').update({
      status: 'skipped', last_error: 'identity_revoked',
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return;
  }
  const { data: profile } = await db
    .from('profiles').select('id, company_id, deactivated_at')
    .eq('id', identity.profile_id).maybeSingle();
  if (!profile || profile.deactivated_at) {
    await db.from('whatsapp_messages').update({
      status: 'skipped', last_error: 'profile_inactive',
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return;
  }

  // 1. Media metadata + validation before we spend bandwidth.
  const meta = await getMediaMeta(String(job.media_id));
  const check = validateMedia(meta.mimeType || job.media_mime, meta.fileSize);
  if (!check.ok) {
    await db.from('whatsapp_messages').update({
      status: 'skipped', last_error: check.reason,
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    await replyQuietly(phone, buildFailureReply(reviewUrl, check.reason));
    return;
  }

  const { bytes } = await downloadMedia(meta.url);
  const recheck = validateMedia(check.mediaType, bytes.byteLength);
  if (!recheck.ok) {
    await db.from('whatsapp_messages').update({
      status: 'skipped', last_error: recheck.reason,
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    await replyQuietly(phone, buildFailureReply(reviewUrl, recheck.reason));
    return;
  }

  // 2. Store under the existing receipts convention: <project_id>/<receipt_id>.jpg
  const projectId = await pickProject(db, profile.id as string, identity.company_id as string);
  if (!projectId) {
    await db.from('whatsapp_messages').update({
      status: 'failed', last_error: 'no_active_project',
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    await replyQuietly(phone, `Your company has no active project yet, so I could not file this receipt.\n\n${reviewUrl}`);
    return;
  }

  const receiptId = crypto.randomUUID();
  const path = `${projectId}/${receiptId}.jpg`;
  const { error: upErr } = await db.storage
    .from('receipts')
    .upload(path, bytes, { contentType: check.mediaType, upsert: false });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  // 3. Insert the receipt row. company_id is filled by the existing trigger.
  const { error: insErr } = await db.from('receipts').insert({
    id: receiptId,
    project_id: projectId,
    company_id: identity.company_id,
    uploaded_by: profile.id,
    image_url: path,
    status: 'processing',
    source: 'whatsapp',
    payment_method: 'cash_personal',
  });
  if (insErr) throw new Error(`receipt insert failed: ${insErr.message}`);

  await db.from('whatsapp_messages')
    .update({ receipt_id: receiptId, updated_at: new Date().toISOString() })
    .eq('id', job.id);

  // 4. Reuse the existing extraction pipeline verbatim.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    await fetch(`${supabaseUrl}/functions/v1/extract-receipt`, {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ receipt_id: receiptId, storage_path: path }),
    });
  } catch (err) {
    console.error('extract invoke failed', err instanceof Error ? err.message : 'unknown');
  }

  // 5. Read back whatever extraction produced.
  const { data: receipt } = await db
    .from('receipts')
    .select('vendor_name, total_amount, status')
    .eq('id', receiptId)
    .maybeSingle();

  // A WhatsApp receipt always needs the employee to pick project, category and
  // payment source, so it must never leave here as 'confirmed' — that would let it
  // count towards approved project spend before anyone reviewed it.
  if (receipt?.status === 'confirmed') {
    await db.from('receipts').update({ status: 'pending_review' }).eq('id', receiptId);
  }

  const isDuplicate = receipt?.status === 'duplicate';
  await db.from('whatsapp_messages').update({
    status: 'done', processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', job.id);

  // 6. Exactly one reply.
  if (isDuplicate) {
    // Deliberately says nothing about which company or employee filed the original —
    // the duplicate guard is global, and that would leak across tenants.
    await replyQuietly(
      phone,
      `This receipt has already been recorded, so I did not file it again.\n\nYou can check your receipts here:\n${reviewUrl}`,
    );
  } else {
    await notifyReviewers(
      db, identity.company_id as string, profile.id as string,
      receiptId, receipt?.vendor_name ?? null, receipt?.total_amount ?? null,
    );
    await replyQuietly(
      phone,
      buildReceiptReply({
        vendor: receipt?.vendor_name ?? null,
        total: receipt?.total_amount ?? null,
        reviewUrl: buildReviewUrl(appUrl(), receiptId),
      }),
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response('misconfigured', { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Self-healing: anything stuck in 'processing' past the stale window is returned
  // to the pool so a crashed invocation cannot park a job forever.
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  await db.from('whatsapp_messages')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', staleBefore);

  const { data: jobs } = await db
    .from('whatsapp_messages')
    .select('*')
    .eq('status', 'pending')
    .not('media_id', 'is', null)
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  let processed = 0;
  for (const job of jobs ?? []) {
    // Atomic claim: the status filter means two concurrent workers cannot both
    // take the same job.
    const { data: claimed } = await db
      .from('whatsapp_messages')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      await processJob(db, job);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const retries = Number(job.retry_count ?? 0) + 1;
      const exhausted = retries >= MAX_RETRIES;
      await db.from('whatsapp_messages').update({
        status: exhausted ? 'failed' : 'pending',
        retry_count: retries,
        last_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
        ...(exhausted ? { processed_at: new Date().toISOString() } : {}),
      }).eq('id', job.id);

      if (exhausted) {
        await replyQuietly(job.phone_e164, buildFailureReply(buildReviewUrl(appUrl())));
      }
      console.error('job failed', job.id, message);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
