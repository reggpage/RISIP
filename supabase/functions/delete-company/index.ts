// delete-company · POST (no body required)
//
// Verifies the caller is an owner, deletes their company (CASCADE handles
// profiles, projects, receipts, invoices, invite_links), then deletes
// the auth.users record so the account is fully cleaned up.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

function bad(msg: string, status = 400) {
  return json({ error: msg }, { status });
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

  // Verify the caller's session.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return bad('invalid session', 401);
  const uid = userData.user.id;

  // Service-role client for privileged operations.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Confirm the caller is an owner.
  const { data: profile } = await admin
    .from('profiles')
    .select('role, company_id')
    .eq('id', uid)
    .maybeSingle();

  if (!profile) return bad('no profile found', 403);
  if (profile.role !== 'owner') return bad('only the company owner can delete the company', 403);

  const companyId = profile.company_id;

  // Delete the company — cascades to profiles, projects, receipts, invoices, invite_links.
  const { error: deleteErr } = await admin
    .from('companies')
    .delete()
    .eq('id', companyId);

  if (deleteErr) return bad(`delete failed: ${deleteErr.message}`, 500);

  // Delete the auth user record for the owner (others lost their profiles via cascade).
  // We do this last so we still have a valid session during the delete above.
  const { error: authErr } = await admin.auth.admin.deleteUser(uid);
  if (authErr) {
    // Non-fatal — company is gone; auth user can be cleaned up manually.
    console.error('auth.admin.deleteUser failed:', authErr.message);
  }

  return json({ deleted: true }, { status: 200 });
});
