// send-email · Supabase Auth "Send Email" hook implementation, backed by Resend.
//
// Wiring (one-time, done in Supabase Dashboard):
//   Auth → Hooks → Send Email hook → HTTPS → point at this function's URL,
//   generate a "webhook secret" and set it as this function's SEND_EMAIL_HOOK_SECRET env.
//
// Env vars (set with `supabase secrets set ...`):
//   RESEND_API_KEY           — from https://resend.com/api-keys
//   RESEND_FROM              — verified From address, e.g. "Risip <noreply@risip.online>"
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
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Lora:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body style="margin:0;padding:0;background:#f6f7f9;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
          <tr>
            <td align="center">
              <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e8ebef;border-radius:16px;overflow:hidden">
                <!-- Brand header: logo badge + wordmark -->
                <tr>
                  <td style="padding:28px 32px 20px">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:middle">
                          <div style="width:40px;height:40px;border-radius:10px;background:#DD2D4A;color:#ffffff;font-family:'Lora',Georgia,serif;font-weight:700;font-size:22px;text-align:center;line-height:40px">R</div>
                        </td>
                        <td style="vertical-align:middle;padding-left:12px">
                          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;color:#DD2D4A;letter-spacing:-0.3px">Risip</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:3px;background:#DD2D4A;line-height:3px;font-size:0">&nbsp;</td></tr>
                <!-- Body -->
                <tr>
                  <td style="padding:28px 32px 8px">
                    <h1 style="margin:0 0 8px;font-family:'Outfit',sans-serif;font-size:20px;font-weight:600;color:#0f172a">${heading}</h1>
                    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">${preface}</p>
                    <div style="margin:0 auto 20px;padding:18px 24px;background:#fdf2f4;border:1px solid #f6c9d2;border-radius:12px;text-align:center">
                      <div style="font-family:'Outfit',sans-serif;font-size:34px;letter-spacing:10px;font-weight:700;color:#DD2D4A">${token}</div>
                    </div>
                    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">
                      Msimbo huu unaisha muda baada ya dakika chache. Kama hukuomba, puuza barua pepe hii.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding:20px 32px;border-top:1px solid #eef1f4;font-size:11px;color:#94a3b8;line-height:1.6">
                    <strong style="color:#64748b">Risip</strong> · Scan risiti, tengeneza ankara.<br />
                    <span style="color:#cbd5e1">risip.online</span>
                  </td>
                </tr>
              </table>
              <div style="margin-top:16px;font-size:11px;color:#cbd5e1;font-family:'Outfit',sans-serif">© Risip · Tanzania</div>
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
