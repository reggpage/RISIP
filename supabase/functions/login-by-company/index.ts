import { json, preflight } from '../_shared/cors.ts';

function bad(msg: string, status = 400) {
  return json({ error: msg }, { status });
}

Deno.serve((req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return bad('method not allowed', 405);

  return bad('login_by_company_disabled_use_personal_password', 410);
});
