// join-company · POST { company_id, company_password, full_name, phone? }
//
// Called after the new user has already signed up via supabase.auth.signUp().
// Verifies the shared company password, then creates a worker profile.
// The caller must have a valid session (just signed up).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

interface JoinBody {
  company_id?: string;
  company_password?: string;
  full_name?: string;
  phone?: string;
}

function bad(msg: string, status = 400) {
  return json({ error: msg }, { status });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return bad('method not allowed', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return bad('server misconfigured', 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return bad('missing bearer token', 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the caller's session.
  const token = authHeader.slice(7);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return bad('invalid session', 401);
  const uid = userData.user.id;

  let body: JoinBody;
  try {
    body = (await req.json()) as JoinBody;
  } catch {
    return bad('invalid json');
  }

  const company_id = body.company_id?.trim();
  const company_password = body.company_password;
  const full_name = body.full_name?.trim();
  if (!company_id) return bad('company_id required');
  if (!company_password) return bad('company_password required');
  if (!full_name) return bad('full_name required');

  // Verify the shared company password.
  const { data: validPw, error: pwErr } = await admin.rpc('verify_company_password', {
    p_company_id: company_id,
    p_password: company_password,
  });
  if (pwErr) {
    const msg = pwErr.message.toLowerCase();
    if (msg.includes('not_set')) return bad('company_password_not_set', 403);
    return bad(pwErr.message, 500);
  }
  if (!validPw) return bad('invalid_company_password', 403);

  // Guard: profile must not already exist.
  const { data: existing } = await admin.from('profiles').select('id').eq('id', uid).maybeSingle();
  if (existing) return bad('already exists', 409);

  // Create the worker profile.
  const { error: insertErr } = await admin.from('profiles').insert({
    id: uid,
    company_id,
    full_name,
    phone: body.phone?.trim() ?? null,
    role: 'worker',
  });
  if (insertErr) return bad(`profile insert failed: ${insertErr.message}`, 500);

  return json({ role: 'worker' }, { status: 200 });
});
