// signup-company · POST
// Flow: the client signs up with supabase.auth.signUp first, then invokes this function
// with the returned session. This function derives auth.uid() from the JWT, then calls
// signup_company_v1() with the service_role key to create the company + owner profile
// atomically. RLS on companies/profiles stays locked for the anon/authenticated roles.
//
// Request body: { full_name, phone, company_name, hq_location, sector?, company_password }
// Response:     { company_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, preflight } from '../_shared/cors.ts';

interface SignupBody {
  full_name?: string;
  phone?: string;
  company_name?: string;
  hq_location?: string;
  sector?: string;
  company_password?: string;
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

  // Verify the caller's JWT by asking the auth server whom it belongs to.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return bad('invalid session', 401);

  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return bad('invalid json');
  }

  const full_name = body.full_name?.trim();
  const company_name = body.company_name?.trim();
  const hq_location = body.hq_location?.trim();
  const company_password = body.company_password?.trim();
  if (!full_name) return bad('full_name required');
  if (!company_name) return bad('company_name required');
  if (!hq_location) return bad('hq_location required');
  if (!company_password) return bad('company_password required');

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: companyId, error: rpcErr } = await admin.rpc('signup_company_v1', {
    p_user_id: userData.user.id,
    p_full_name: full_name,
    p_phone: body.phone ?? null,
    p_company_name: company_name,
    p_hq_location: hq_location,
    p_sector: body.sector ?? null,
    p_company_password: company_password,
  });

  if (rpcErr) {
    const status = /already exists/i.test(rpcErr.message) ? 409 : 400;
    return bad(rpcErr.message, status);
  }

  return json({ company_id: companyId }, { status: 201 });
});
