// Deletes one business, but never deletes the caller's login.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';
import { collectCompanyStorage, removeStoragePlan } from '../_shared/permanentDeletion.ts';

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

  let body: { company_id?: string; confirmation?: string };
  try { body = await req.json(); } catch { return bad('invalid JSON body'); }
  if (!body.company_id || body.confirmation !== 'DELETE PERMANENTLY') {
    return bad('type DELETE PERMANENTLY in the second confirmation step');
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
  const { data: membership, error: membershipErr } = await admin
    .from('company_members')
    .select('company_id, role')
    .eq('profile_id', uid)
    .eq('company_id', body.company_id)
    .eq('role', 'owner')
    .is('deactivated_at', null)
    .maybeSingle();
  if (membershipErr) return bad(`authorization lookup failed: ${membershipErr.message}`, 500);
  if (!membership) return bad('only an active owner can delete this business', 403);

  let storagePlan;
  try {
    storagePlan = await collectCompanyStorage(admin, body.company_id);
  } catch (error) {
    return bad(`storage inventory failed: ${error instanceof Error ? error.message : 'unknown error'}`, 500);
  }
  const { data: deletion, error: deletionErr } = await admin.rpc('delete_company_data', {
    p_company_id: body.company_id,
    p_allow_orphan_profiles: false,
  });
  if (deletionErr) {
    const hint = deletionErr.code === 'P0001'
      ? ' This business is the only active home for a member; use Delete my Risip account or move that member first.'
      : '';
    return bad(`delete failed: ${deletionErr.message}${hint}`, 409);
  }
  const storage = await removeStoragePlan(admin, storagePlan);
  return json({
    deleted: true,
    company_id: body.company_id,
    storage,
    provider_backups: 'Live application data was deleted. Provider backup retention is outside Risip control.',
    ...(deletion ?? {}),
  });
});
