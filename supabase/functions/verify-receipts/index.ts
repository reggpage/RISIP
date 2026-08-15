// Re-checking receipts that were filed before verification existed.
//
// The QR and TRA lookup added in extract-receipt only run when a receipt
// arrives. Everything already filed still carries whatever the model read, and
// on one real receipt that was five fields wrong including the total — 58,000
// booked as 50,000, and a verification code the duplicate guard could never
// match. Those receipts are already in the expense figures.
//
// So this walks the ones that can be checked: decode the QR from the stored
// photo where there is one, ask TRA, and write back what TRA says.
//
// MONEY IS NOT MOVED BEHIND A LOCK. If a receipt has already been booked
// against petty cash, the database refuses to change its amount, and rightly:
// the ledger entry would no longer match. Those are reported as needing a
// reversal rather than quietly skipped or forced.
//
// Owner and accountant only. Read-only for everyone else, since this rewrites
// stored figures.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';
import { compareWithTra, fetchTraReceipt } from '../_shared/traVerify.ts';
import { readReceiptQr } from '../_shared/receiptQr.ts';

declare const Deno: { env: { get(name: string): string | undefined } };

/** TRA's portal is a public page, not an API. One at a time, with a pause. */
const BATCH_LIMIT = 25;
const PAUSE_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = {
  receipt_id: string;
  vendor: string | null;
  result: 'verified' | 'not_found' | 'unreachable' | 'locked';
  changed: { field: string; from: unknown; to: unknown }[];
};

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST required' }, { status: 405 });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: 'not configured' }, { status: 500 });

  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization) return json({ error: 'sign in first' }, { status: 401 });

  // Who is asking, resolved from their own token rather than from the request body.
  const caller = createClient(url, anonKey, { global: { headers: { authorization } } });
  const { data: userData } = await caller.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json({ error: 'sign in first' }, { status: 401 });

  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin
    .from('profiles').select('active_company_id').eq('id', userId).maybeSingle();
  const companyId = (profile as { active_company_id?: string } | null)?.active_company_id;
  if (!companyId) return json({ error: 'no active business' }, { status: 403 });

  const { data: membership } = await admin
    .from('company_members').select('role')
    .eq('profile_id', userId).eq('company_id', companyId).is('deactivated_at', null).maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'accountant') {
    return json({ error: 'only an owner or accountant can verify receipts' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // By default only what has never been checked; `recheck` also revisits the
  // ones the portal could not reach last time.
  const recheck = body?.recheck === true;

  let query = admin
    .from('receipts')
    .select('id, vendor_name, vendor_tin, receipt_number, receipt_date, receipt_time, total_amount, verification_code, image_url, tra_status')
    .eq('company_id', companyId)
    .not('verification_code', 'is', null)
    .not('receipt_time', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_LIMIT);
  query = recheck
    ? query.or('tra_status.is.null,tra_status.eq.unreachable,tra_status.eq.not_found')
    : query.is('tra_status', null);

  const { data: receipts, error } = await query;
  if (error) return json({ error: 'could not load receipts' }, { status: 500 });

  const outcomes: Outcome[] = [];

  for (const row of (receipts ?? []) as Record<string, any>[]) {
    // The QR first: the code is the second factor for the lookup, and it is the
    // field the model most often reads wrong, so a decoded one is worth having
    // before asking at all.
    let code = String(row.verification_code ?? '');
    if (row.image_url) {
      const { data: blob } = await admin.storage.from('receipts').download(String(row.image_url));
      if (blob) {
        const fromQr = readReceiptQr(new Uint8Array(await blob.arrayBuffer()), blob.type);
        if (fromQr) code = fromQr;
      }
    }

    const lookup = await fetchTraReceipt(code, String(row.receipt_time));
    await sleep(PAUSE_MS);

    if (!lookup.ok) {
      await admin.from('receipts')
        .update({ tra_status: lookup.reason === 'unreachable' ? 'unreachable' : 'not_found' })
        .eq('id', row.id);
      outcomes.push({
        receipt_id: row.id, vendor: row.vendor_name,
        result: lookup.reason === 'unreachable' ? 'unreachable' : 'not_found', changed: [],
      });
      continue;
    }

    const official = lookup.receipt;
    const differences = compareWithTra({
      vendorName: row.vendor_name,
      vendorTin: row.vendor_tin,
      receiptNumber: row.receipt_number,
      totalInclTax: row.total_amount === null ? null : Number(row.total_amount),
      verificationCode: row.verification_code,
      receiptDate: row.receipt_date,
    }, official);

    const money = {
      total_amount: official.totalInclTax ?? undefined,
      tax_amount: official.totalTax ?? undefined,
    };
    const rest = {
      vendor_name: official.vendorName ?? undefined,
      vendor_tin: official.vendorTin ?? undefined,
      vendor_vrn: official.vendorVrn ?? undefined,
      receipt_number: official.receiptNumber ?? undefined,
      receipt_date: official.receiptDate ?? undefined,
      verification_code: official.verificationCode ?? undefined,
      tra_status: 'verified',
      tra_verified_at: new Date().toISOString(),
      tra_differences: differences.length ? differences : null,
    };

    let result: Outcome['result'] = 'verified';
    const { error: updateError } = await admin.from('receipts')
      .update({ ...rest, ...money }).eq('id', row.id);

    if (updateError) {
      // A booked receipt refuses to have its amount changed, and should: the
      // petty-cash entry would stop matching. Everything else is still worth
      // correcting, and the difference is recorded so somebody can decide.
      const booked = String(updateError.message ?? '').includes('booked');
      const { error: retryError } = await admin.from('receipts').update(rest).eq('id', row.id);
      result = booked && !retryError ? 'locked' : 'verified';
      if (retryError) {
        outcomes.push({ receipt_id: row.id, vendor: row.vendor_name, result: 'unreachable', changed: [] });
        continue;
      }
    }

    outcomes.push({
      receipt_id: row.id,
      vendor: official.vendorName ?? row.vendor_name,
      result,
      changed: differences.map((d) => ({ field: d.field, from: d.extracted, to: d.official })),
    });
  }

  const verified = outcomes.filter((o) => o.result === 'verified').length;
  const corrected = outcomes.filter((o) => o.changed.length > 0).length;
  return json({
    checked: outcomes.length,
    verified,
    corrected,
    locked: outcomes.filter((o) => o.result === 'locked').length,
    not_found: outcomes.filter((o) => o.result === 'not_found').length,
    unreachable: outcomes.filter((o) => o.result === 'unreachable').length,
    outcomes,
  }, { status: 200 });
});
