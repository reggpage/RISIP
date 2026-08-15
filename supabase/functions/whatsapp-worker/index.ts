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
  buildReviewUrl,
  buildNoActiveProjectReply,
  maskPhone,
  validateMedia,
} from '../_shared/whatsapp.ts';
import {
  buildReceiptReplyV2,
  resolvePaymentSource,
  resolveProject,
  type Lang,
  type ProjectRef,
} from '../_shared/whatsappIntent.ts';
import { downloadMedia, getMediaMeta, sendWhatsAppText, showTyping } from '../_shared/whatsappApi.ts';
import { readReceiptQr } from '../_shared/receiptQr.ts';
import { compareWithTra, fetchTraReceipt } from '../_shared/traVerify.ts';
import { askForQrCloseUp, qrCorrectionReply } from '../_shared/qrFollowUp.ts';
import { askForTypedCode } from '../_shared/typedCode.ts';

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
 * Every active project this person is actually allowed to file against. Workers
 * get the projects they are a member of; owners and accountants see the whole
 * company, which mirrors auth_can_see_project. An unauthorised project is simply
 * absent from this list, so a caption naming one is indistinguishable from a
 * caption naming a project that does not exist — we never confirm or deny it.
 */
async function authorizedProjects(
  db: Admin,
  profileId: string,
  companyId: string,
  role: string,
): Promise<ProjectRef[]> {
  if (role === 'owner' || role === 'accountant') {
    const { data } = await db
      .from('projects')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    return (data ?? []) as ProjectRef[];
  }

  const { data: memberships } = await db
    .from('project_members')
    .select('project_id')
    .eq('profile_id', profileId);
  const ids = (memberships ?? []).map((m) => m.project_id as string);
  if (ids.length === 0) return [];

  const { data } = await db
    .from('projects')
    .select('id, name')
    .in('id', ids)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return (data ?? []) as ProjectRef[];
}

/** Append-only trail. Never records message bodies, tokens or secrets. */
async function audit(
  db: Admin,
  row: {
    company_id?: string | null; profile_id?: string | null; wa_message_id?: string | null;
    intent?: string; action?: string; outcome?: string; receipt_id?: string | null;
  },
): Promise<void> {
  try {
    await db.from('whatsapp_audit_log').insert(row);
  } catch {
    // Auditing must never break the flow it is describing.
  }
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

  // Elapsed-milliseconds marks per step. Numbers only — never payload or personal
  // data — so the slowest stage is measurable without logging anything sensitive.
  const t0 = Date.now();
  const marks: Record<string, number> = { worker_start: 0 };
  const mark = (name: string) => { marks[name] = Date.now() - t0; };

  // Acknowledge immediately so the sender sees "typing…" while extraction runs.
  // Free, and it is a status update rather than a second message.
  await showTyping(String(job.wa_message_id));

  // Re-check the identity at processing time: it may have been revoked, or the
  // employee deactivated, between the webhook and now.
  const { data: identity } = await db
    .from('whatsapp_identities')
    .select('id, profile_id, company_id, lang')
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
    .from('profiles').select('id, company_id, role, deactivated_at')
    .eq('id', identity.profile_id).maybeSingle();
  if (!profile || profile.deactivated_at) {
    await db.from('whatsapp_messages').update({
      status: 'skipped', last_error: 'profile_inactive',
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return;
  }

  const lang: Lang = (identity.lang as Lang | null) ?? 'en';
  // Never download or extract a receipt when this company has no active project.
  // The webhook parks the message for owner/accountant setup; this is the race-safe
  // fallback if a project disappears between the webhook and worker invocation.
  const projects = await authorizedProjects(
    db, profile.id as string, identity.company_id as string, String(profile.role ?? 'worker'),
  );
  if (projects.length === 0) {
    await db.from('whatsapp_messages').update({
      status: 'failed', last_error: 'no_active_project',
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    await replyQuietly(phone, buildNoActiveProjectReply(reviewUrl, lang));
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
    await replyQuietly(phone, buildFailureReply(reviewUrl, check.reason, lang));
    return;
  }

  const { bytes } = await downloadMedia(meta.url);
  mark('media_downloaded');
  const recheck = validateMedia(check.mediaType, bytes.byteLength);
  if (!recheck.ok) {
    await db.from('whatsapp_messages').update({
      status: 'skipped', last_error: recheck.reason,
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    await replyQuietly(phone, buildFailureReply(reviewUrl, recheck.reason, lang));
    return;
  }

  // 1b. Is this a close-up of a QR we asked for?
  //
  // Decided by the image, not by remembered state. If it holds a TRA code, that
  // code is looked up with the PENDING receipt's own printed time — TRA needs
  // both to answer, so an answer means both matched and it is genuinely the same
  // receipt. A photo of a different receipt fails that lookup and falls straight
  // through to being filed as the new receipt it is.
  const { data: awaitingQr } = await db
    .from('receipts')
    .select('id, vendor_name, total_amount, receipt_time, verification_code')
    .eq('company_id', identity.company_id)
    .eq('uploaded_by', profile.id)
    .eq('tra_status', 'not_found')
    .not('receipt_time', 'is', null)
    .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (awaitingQr) {
    const pending = awaitingQr as Record<string, any>;
    const code = readReceiptQr(bytes, check.mediaType);
    if (code) {
      const lookup = await fetchTraReceipt(code, String(pending.receipt_time));
      if (lookup.ok) {
        const official = lookup.receipt;
        const differences = compareWithTra({
          vendorName: pending.vendor_name,
          totalInclTax: pending.total_amount === null ? null : Number(pending.total_amount),
          verificationCode: pending.verification_code,
        }, official);

        await db.from('receipts').update({
          vendor_name: official.vendorName ?? pending.vendor_name,
          vendor_tin: official.vendorTin ?? undefined,
          vendor_vrn: official.vendorVrn ?? undefined,
          receipt_number: official.receiptNumber ?? undefined,
          receipt_date: official.receiptDate ?? undefined,
          total_amount: official.totalInclTax ?? undefined,
          tax_amount: official.totalTax ?? undefined,
          verification_code: official.verificationCode ?? code,
          tra_status: 'verified',
          tra_verified_at: new Date().toISOString(),
          tra_differences: differences.length ? differences : null,
        }).eq('id', pending.id);

        await replyQuietly(phone, qrCorrectionReply(
          { vendorName: pending.vendor_name, total: pending.total_amount === null ? null : Number(pending.total_amount) },
          official,
          lang,
          buildReviewUrl(appUrl(), String(pending.id)),
        ));
        // The close-up is not a receipt of its own, so nothing is stored for it.
        await db.from('whatsapp_messages').update({
          status: 'done', receipt_id: pending.id,
          processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', job.id);
        return;
      }
    }
    // Anything else falls straight through. We cannot tell a failed close-up
    // from a genuinely new receipt, and guessing either way is worse than not
    // guessing: a wrong message on a real receipt, or a lost receipt because it
    // was assumed to be a retry. Silence here means the normal path runs and
    // nothing is lost.
  }

  // 2. Store under the existing receipts convention: <project_id>/<receipt_id>.jpg
  // The caption is untrusted text from the sender. It is only ever matched against
  // projects they are already authorised to use, so it can widen nothing.
  const caption = (job.caption as string | null) ?? null;
  const resolution = resolveProject(caption, projects);
  const paymentSuggestion = resolvePaymentSource(caption);
  const projectId = resolution.kind === 'resolved' ? resolution.projectId : null;

  const receiptId = crypto.randomUUID();
  // An unassigned receipt has no project to key its path on, so it lands in the
  // company's inbox folder. Storage RLS falls back to "readable if the receipt row
  // is readable", so the sender and finance can still open the image.
  const path = projectId
    ? `${projectId}/${receiptId}.jpg`
    : `${identity.company_id}/unassigned/${receiptId}.jpg`;
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
    // Null, never a default: nobody has said how this was paid. A suggestion
    // parsed from the caption is recorded separately and stays a suggestion —
    // it must not decide whether the company owes this person money.
    payment_method: null,
    payment_method_suggested: paymentSuggestion,
    payment_method_reason: paymentSuggestion ? 'whatsapp_caption' : null,
    details_confirmed: false,
  });
  if (insErr) throw new Error(`receipt insert failed: ${insErr.message}`);

  mark('receipt_stored');
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

  mark('extraction_done');

  // 5. Read back whatever extraction produced.
  const { data: receipt } = await db
    .from('receipts')
    .select('vendor_name, total_amount, status, tra_status')
    .eq('id', receiptId)
    .maybeSingle();

  // A WhatsApp receipt always needs the employee to pick project, category and
  // payment source, so it must never leave here as 'confirmed' — that would let it
  // count towards approved project spend before anyone reviewed it.
  if (receipt?.status === 'confirmed') {
    await db.from('receipts').update({ status: 'pending_review' }).eq('id', receiptId);
  }

  const isDuplicate = receipt?.status === 'duplicate';
  mark('reply_sent');
  await db.from('whatsapp_messages').update({
    status: 'done', timings: marks,
    processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', job.id);

  // 6. Exactly one reply.
  if (isDuplicate) {
    // Deliberately says nothing about which company or employee filed the original —
    // the duplicate guard is global, and that would leak across tenants.
    await replyQuietly(
      phone,
      lang === 'sw'
        ? `Risiti hii tayari imeshaingizwa, kwa hiyo sikuiweka tena.\n\nAngalia risiti zako hapa:\n${reviewUrl}`
        : `This receipt has already been recorded, so I did not file it again.\n\nYou can check your receipts here:\n${reviewUrl}`,
    );
    await audit(db, {
      company_id: identity.company_id as string, profile_id: profile.id as string,
      wa_message_id: String(job.wa_message_id), intent: 'submit_receipt',
      action: 'duplicate_rejected', outcome: 'skipped', receipt_id: receiptId,
    });
    return;
  }

  await notifyReviewers(
    db, identity.company_id as string, profile.id as string,
    receiptId, receipt?.vendor_name ?? null, receipt?.total_amount ?? null,
  );

  // When the project is still unknown, remember the question we are about to ask
  // so a bare "2" can be understood as the answer.
  if (!projectId) {
    const options = projects.slice(0, 9).map((p) => ({ id: p.id, name: p.name }));
    await db.from('whatsapp_conversations').upsert({
      identity_id: identity.id,
      company_id: identity.company_id,
      profile_id: profile.id,
      awaiting: 'project',
      receipt_id: receiptId,
      options,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity_id' });
  }

  const chosen = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
  await replyQuietly(
    phone,
    buildReceiptReplyV2({
      lang,
      vendor: receipt?.vendor_name ?? null,
      total: receipt?.total_amount ?? null,
      projectName: chosen?.name ?? null,
      needsProject: !projectId,
      projectOptions: projects,
      reviewUrl: buildReviewUrl(appUrl(), receiptId),
    })
    // Only when TRA actually declined to confirm it. A receipt with no code at
    // all is not a failure to verify, it is a receipt without a QR.
    + (receipt?.tra_status === 'not_found' ? askForQrCloseUp(lang) + askForTypedCode(lang) : ''),
  );

  await audit(db, {
    company_id: identity.company_id as string, profile_id: profile.id as string,
    wa_message_id: String(job.wa_message_id), intent: 'submit_receipt',
    action: [
      projectId
        ? `project:${resolution.kind === 'resolved' ? resolution.reason : 'none'}`
        : 'project:unassigned',
      `payment_suggested:${paymentSuggestion ?? 'unknown'}`,
      caption ? 'caption:present' : 'caption:absent',
    ].join(' '),
    outcome: 'pending_review · nothing confirmed, nothing counted', receipt_id: receiptId,
  });
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
        const { data: failedIdentity } = await db.from('whatsapp_identities')
          .select('lang').eq('phone_e164', job.phone_e164 ?? '').is('revoked_at', null).maybeSingle();
        const failedLang: Lang = (failedIdentity?.lang as Lang | null) ?? 'en';
        await replyQuietly(job.phone_e164, buildFailureReply(buildReviewUrl(appUrl()), undefined, failedLang));
      }
      console.error('job failed', job.id, message);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
