// login-by-company · POST { company_id, name, company_password }
//
// Lets existing staff log in by their full name + the shared company password,
// without needing an email/password. Returns a magic-link token_hash the client
// exchanges via supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

interface LoginBody {
  company_id?: string;
  name?: string;
  company_password?: string;
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

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return bad('invalid json');
  }

  const company_id = body.company_id?.trim();
  const name = body.name?.trim();
  const company_password = body.company_password;
  if (!company_id) return bad('company_id required');
  if (!name) return bad('name required');
  if (!company_password) return bad('company_password required');

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  // Find the profile by exact full_name within this company.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('company_id', company_id)
    .ilike('full_name', name)
    .is('deactivated_at', null)
    .maybeSingle();

  if (!profile) return bad('user_not_found', 404);

  // Get the auth user's email so we can generate a magic link.
  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  if (!authUser.user?.email) return bad('user_not_found', 404);

  // Generate a magic link — the client will exchange token_hash for a session.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    return bad(`could not generate link: ${linkErr?.message ?? 'unknown'}`, 500);
  }

  return json(
    {
      token_hash: linkData.properties.hashed_token,
      role: profile.role,
      email: authUser.user.email,
    },
    { status: 200 },
  );
});
