// wa-login · GET/POST ?t=<token>
//
// Turns a one-shot token sent over WhatsApp into a web session. This exists
// because a Kariakoo trader may have no email address, so an email magic link
// cannot be the only way in.
//
// verify_jwt = false: the token IS the credential. Which is exactly why it is
//   * five minutes long — shorter than the 15-minute account-linking token,
//     because this one hands over a session rather than binding a number,
//   * single use, enforced in wa_consume_login_token under a row lock,
//   * stored only as a SHA-256 hash, so a database leak yields nothing usable,
//   * superseded on issue, so an older link sitting in the chat history is dead.
//
// No password is ever sent through WhatsApp, and none is set on these accounts.
//
// The plaintext token is never logged, never echoed, and never written anywhere.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'server misconfigured' }, 500);

  let token: string | null = null;
  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('t');
  } else {
    const body = await req.json().catch(() => ({}));
    token = typeof body?.token === 'string' ? body.token : null;
  }
  if (!token) return json({ error: 'missing token' }, 400);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Every check — validity, expiry, single use — happens here, under a row lock.
  const { data: claim, error: claimErr } = await db.rpc('wa_consume_login_token', { p_token: token });
  if (claimErr || !claim) {
    // The RPC's message is written for the person reading it.
    return json({ error: claimErr?.message ?? 'that link is not valid' }, 401);
  }

  const profileId = (claim as { profile_id: string }).profile_id;

  const { data: user, error: userErr } = await db.auth.admin.getUserById(profileId);
  if (userErr || !user?.user) return json({ error: 'account not found' }, 404);

  // A one-time e-mail-less sign-in link for this user. The client exchanges the
  // hashed token for a session; we never hold their password because there is
  // none to hold.
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: user.user.email ?? `${profileId}@wa.risip.local`,
  });
  if (linkErr || !link?.properties) {
    console.error('generateLink failed', linkErr?.message);
    return json({ error: 'could not start a session' }, 500);
  }

  return json({
    ok: true,
    // Consumed by the browser with supabase.auth.verifyOtp({ type: 'magiclink' }).
    token_hash: link.properties.hashed_token,
  });
});
