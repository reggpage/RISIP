// send-email · Supabase Auth "Send Email" hook implementation, backed by Resend.
//
// Wiring (one-time, done in Supabase Dashboard):
//   Auth → Hooks → Send Email hook → HTTPS → point at this function's URL,
//   generate a "webhook secret" and set it as this function's SEND_EMAIL_HOOK_SECRET env.
//
// Env vars (set with `supabase secrets set ...`):
//   RESEND_API_KEY           — from https://resend.com/api-keys
//   RESEND_FROM              — verified From address, e.g. "Risip <noreply@risip.co.tz>"
//                              Fallback: "Risip <onboarding@resend.dev>" (Resend sandbox — only
//                              delivers to the Resend account owner's inbox; use for smoke tests).
//   SEND_EMAIL_HOOK_SECRET   — the "v1,whsec_..." string Supabase gave when you created the hook.
//
// Deploy with verify_jwt=false because Supabase Auth doesn't attach a JWT to hook calls;
// authenticity is proved by the standard-webhooks HMAC signature.

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

interface HookPayload {
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type:
      | 'signup'
      | 'magiclink'
      | 'recovery'
      | 'invite'
      | 'email_change_current'
      | 'email_change_new'
      | 'reauthentication';
    site_url: string;
  };
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderEmail(payload: HookPayload): { subject: string; html: string } {
  const { token } = payload.email_data;
  const action = payload.email_data.email_action_type;

  const heading =
    action === 'recovery' ? 'Weka nenosiri jipya'
    : action === 'invite' ? 'Umealikwa Risip'
    : action === 'reauthentication' ? 'Thibitisha kitendo'
    : 'Thibitisha barua pepe';

  const preface =
    action === 'recovery'
      ? 'Tumia msimbo huu kubadilisha nenosiri lako:'
      : action === 'invite'
        ? 'Tumia msimbo huu kumaliza usajili wako:'
        : action === 'reauthentication'
          ? 'Tumia msimbo huu kuthibitisha kitendo:'
          : 'Tumia msimbo huu wa tarakimu 6 kuthibitisha barua pepe yako:';

  const subject =
    action === 'recovery' ? 'Risip · Msimbo wa kubadilisha nenosiri'
    : action === 'invite' ? 'Risip · Umealikwa'
    : 'Risip · Msimbo wa uthibitisho';

  const html = `
    <!doctype html>
    <html lang="sw">
      <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0f172a">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
          <tr>
            <td align="center">
              <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="padding:28px 32px 8px">
                    <div style="font-size:20px;font-weight:600;color:#DD2D4A">Risip</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 32px 24px">
                    <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">${heading}</h1>
                    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.5">${preface}</p>
                    <div style="margin:24px auto;padding:16px 24px;background:#f1f5f9;border-radius:10px;text-align:center">
                      <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#0f172a;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace">
                        ${token}
                      </div>
                    </div>
                    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">
                      Msimbo huu unaisha muda baada ya dakika chache. Kama hukuomba, puuza barua pepe hii.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
                    Risip · scan risiti, tengeneza ankara.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return bad('method not allowed', 405);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Risip <onboarding@resend.dev>';
  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  if (!apiKey) return bad('RESEND_API_KEY not set', 500);
  if (!hookSecret) return bad('SEND_EMAIL_HOOK_SECRET not set', 500);

  // Verify the standard-webhooks signature so only Supabase Auth can trigger us.
  const rawBody = await req.text();
  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    payload = wh.verify(rawBody, Object.fromEntries(req.headers)) as HookPayload;
  } catch (err) {
    console.error('signature verification failed', err);
    return bad('invalid signature', 401);
  }

  const { subject, html } = renderEmail(payload);

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: payload.user.email,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('resend error', res.status, text);
    return bad(`resend rejected: ${res.status}`, 502);
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { 'content-type': 'application/json' },
  });
});
