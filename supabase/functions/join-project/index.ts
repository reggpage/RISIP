// join-project · POST
// After the visitor has verified their email OTP and set a password on the client,
// this function creates their profile and (for workers) adds them to project_members.
// The invite token is validated inside join_by_invite_v1 (SECURITY DEFINER), which is
// only callable by service_role — the client cannot forge a role.
//
// Body:      { token, full_name, phone? }
// Response:  { project_id, role }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

interface JoinBody {
  token?: string;
  full_name?: string;
  phone?: string;
}

function bad(reason: string, status = 400) {
  return json({ error: reason }, { status });
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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwtToken = authHeader.slice(7);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwtToken);
  if (userErr || !userData.user) return bad('invalid session', 401);

  let body: JoinBody;
  try {
    body = (await req.json()) as JoinBody;
  } catch {
    return bad('invalid json');
  }

  const token = body.token?.trim();
  const full_name = body.full_name?.trim();
  if (!token) return bad('token required');
  if (!full_name) return bad('full_name required');

  const { data, error } = await admin.rpc('join_by_invite_v1', {
    p_user_id: userData.user.id,
    p_token: token,
    p_full_name: full_name,
    p_phone: body.phone ?? null,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    const status =
      msg.includes('already exists') ? 409
      : msg.includes('not found') ? 404
      : msg.includes('revoked') || msg.includes('expired') || msg.includes('not active') ? 410
      : 400;
    return bad(error.message, status);
  }

  // rpc returns table → array of rows; take the first.
  const row = Array.isArray(data) ? data[0] : data;
  return json({ project_id: row?.project_id, role: row?.role }, { status: 201 });
});
