// Permanently deletes the authenticated person's Risip account and every
// business they explicitly selected and own. Businesses they only joined stay.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';
import { collectCompanyStorage, removeStoragePlan, type StoragePlan } from '../_shared/permanentDeletion.ts';

function bad(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, { status });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return bad('method not allowed', 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) return bad('server misconfigured', 500);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return bad('missing bearer token', 401);

  let body: { owned_company_ids?: unknown; confirmation?: string };
  try { body = await req.json(); } catch { return bad('invalid JSON body'); }
  if (body.confirmation !== 'DELETE PERMANENTLY' || !Array.isArray(body.owned_company_ids)
      || body.owned_company_ids.some((id) => typeof id !== 'string')) {
    return bad('type DELETE PERMANENTLY and explicitly select every owned business');
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return bad('invalid session', 401);
  const uid = userData.user.id;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: owned, error: ownedErr } = await admin
    .from('company_members')
    .select('company_id')
    .eq('profile_id', uid)
    .eq('role', 'owner');
  if (ownedErr) return bad(`authorization lookup failed: ${ownedErr.message}`, 500);
  const ownedIds = (owned ?? []).map((row) => String(row.company_id)).sort();
  const requestedIds = (body.owned_company_ids as string[]).slice().sort();
  if (ownedIds.length !== requestedIds.length || ownedIds.some((id, i) => id !== requestedIds[i])) {
    return bad('every business you own must be explicitly selected; nothing was deleted', 409);
  }

  const storagePlan: StoragePlan = new Map();
  try {
    for (const companyId of ownedIds) {
      const plan = await collectCompanyStorage(admin, companyId);
      for (const [bucket, paths] of plan) {
        const combined = storagePlan.get(bucket) ?? new Set<string>();
        for (const path of paths) combined.add(path);
        storagePlan.set(bucket, combined);
      }
    }
  } catch (error) {
    return bad(`storage inventory failed: ${error instanceof Error ? error.message : 'unknown error'}`, 500);
  }

  const { data: deletion, error: deletionErr } = await admin.rpc('delete_account_data', {
    p_profile_id: uid,
    p_owned_company_ids: ownedIds,
  });
  if (deletionErr) return bad(`delete failed: ${deletionErr.message}`, 409);

  const storage = await removeStoragePlan(admin, storagePlan);
  const { error: authErr } = await admin.auth.admin.deleteUser(uid);
  if (authErr) {
    return bad('application data was deleted, but the login provider did not finish removing the login. Contact support before registering again.', 500, {
      deleted: true,
      auth_deleted: false,
      storage,
      auth_error: authErr.message,
    });
  }
  return json({
    deleted: true,
    auth_deleted: true,
    storage,
    provider_backups: 'Live application data was deleted. Provider backup retention is outside Risip control.',
    ...(deletion ?? {}),
  });
});
