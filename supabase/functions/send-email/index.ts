// send-email · Supabase Auth "Send Email" hook implementation, backed by Resend.
// Env: RESEND_API_KEY, RESEND_FROM (e.g. "Risip <noreply@risip.online>"), SEND_EMAIL_HOOK_SECRET.
// verify_jwt=false; authenticity via standard-webhooks HMAC.

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

// Official Risip wordmark (fill set to brand red for email). Renders in most clients;
// Gmail strips inline SVG — swap for a hosted PNG once the domain serves one.
const LOGO_SVG = `<svg width="56" height="44" viewBox="0 0 396.9 311.8" fill="#DD2D4A" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Risip"><path d="M172.6,184.8c1.5-2.5,2.7-4.3,3.9-6.2c2-3.1,4.5-3.9,7.9-2.2c1.5,0.7,2.9,1.6,4.5,2.3c2.9,1.4,5.9,1.5,9,0.9c2.4-0.5,4.1-2.2,4.3-4.1c0.2-2.4-1-4-3-4.9c-2.5-1.1-5.1-1.8-7.6-2.8c-3.6-1.5-7.6-2.6-10.6-5c-9.6-7.3-7.8-22.6,3.1-28.6c9.2-5.1,24.2-3.8,32.4,2.7c0.6,0.5,1.2,1.1,2,1.7c-1.5,2.3-2.9,4.6-4.5,6.8c-1.2,1.7-3.2,1.8-5.8,0.7c-3.7-1.6-7.4-3.2-11.6-2.6c-0.9,0.1-1.9,0.4-2.7,0.8c-2.9,1.5-3.3,5.2-0.5,7c1.7,1.2,3.7,1.9,5.7,2.7c2.9,1.1,5.8,1.9,8.7,3.1c6.2,2.5,10.8,6.6,11,13.8c0.2,7.6-2.7,13.7-9.7,17.3c-9.1,4.7-18.5,4.4-27.8,0.8C178.2,188.1,175.6,186.4,172.6,184.8z"/><path d="M147.2,190.6c0-19.6,0-39,0-58.5c5.8,0,11.5,0,17.3,0c0,19.5,0,38.9,0,58.5C158.8,190.6,153.1,190.6,147.2,190.6z"/><path d="M228,132.1c5.8,0,11.6,0,17.4,0c0,19.6,0,39,0,58.6c-5.8,0-11.6,0-17.4,0C228,171.1,228,151.7,228,132.1z"/><path d="M155.8,126.1c-5.7,0.1-10.5-4.5-10.5-10.1c0-5.6,4.6-10.3,10.3-10.4c5.7-0.1,10.7,4.6,10.9,10.2C166.6,121.2,161.6,126,155.8,126.1z"/><path d="M226.2,115.6c0.1-5.6,5-10.3,10.6-10.1c5.9,0.2,10.6,4.9,10.5,10.5c-0.1,5.6-5.1,10.2-10.9,10C230.6,125.9,226.1,121.3,226.2,115.6z"/><path d="M141.1,188.6c-3.9-6.4-7.8-12.9-11.8-19.3c-3-4.8-5.3-10.1-10.7-13.1c11.2-4.9,18.8-14.3,18.8-25.2c0-15.9-16.2-28.8-36.3-28.8c-1.5,0-3,0.1-4.5,0.2c0,0-0.1,0-0.1,0c-0.2,0-0.5,0.1-0.7,0.1c-11.8,1.5-20.9,11.5-20.9,23.7v64.2h19.2v-30.3c1.2,0,2.2,0.1,3.2,0c3.9-0.4,6.4,1.3,8.2,4.8c3.9,7.2,8.1,14.2,12.1,21.3c1.2,2.2,2.9,4,5.3,4.1c6.3,0.2,12.7,0.1,19.2,0.1C141.8,189.9,141.5,189.2,141.1,188.6z M104.6,144.6c-6.5,0-11.8-5.9-11.8-13.2c0-7.3,5.3-13.2,11.8-13.2c6.5,0,11.8,5.9,11.8,13.2C116.3,138.7,111.1,144.6,104.6,144.6z"/><path d="M294.8,130.1c-2.9,0-5.6,0.5-8.2,1.5c-3,0.8-5.9,2.3-8.7,4.5c-1.2,0.9-2.3,1.9-3.6,2.9c-0.4-1.5-0.6-2.8-1.2-3.8c-0.7-1.2-1.9-2.8-2.9-2.9c-4-0.3-8.1-0.1-12.1-0.1c0,25.8,0,51.5,0,77.2c5.8,0,11.5,0,17.4,0c0-7.4,0-14.7,0-22c1.9,1.2,4.4,2.5,7.4,3.5c1.5,0.5,2.9,0.9,4.2,1.2c1.2,0.3,2.9,0.6,4.9,0.9c0,0,1.5,0.2,2.9,0.2c15,0,27.2-14.1,27.2-31.5C322,144.2,309.8,130.1,294.8,130.1z M296.2,174.6c-6.5,0-11.8-5.9-11.8-13.2c0-7.3,5.3-13.2,11.8-13.2s11.8,5.9,11.8,13.2C308,168.7,302.7,174.6,296.2,174.6z"/></svg>`;

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderEmail(payload: HookPayload): { subject: string; html: string } {
  const { token } = payload.email_data;
  const action = payload.email_data.email_action_type;
  const digitLabel = /^\d+$/.test(token) ? `${token.length}-digit ` : '';

  const heading =
    action === 'recovery' ? 'Set a new password'
    : action === 'invite' ? 'You have been invited to Risip'
    : action === 'reauthentication' ? 'Confirm this action'
    : 'Confirm your email';

  const preface =
    action === 'recovery'
      ? `Use this ${digitLabel}code to reset your password:`
      : action === 'invite'
        ? `Use this ${digitLabel}code to finish your registration:`
        : action === 'reauthentication'
          ? `Use this ${digitLabel}code to confirm the action:`
          : `Use this ${digitLabel}code to verify your email:`;

  const subject =
    action === 'recovery' ? 'Risip · Password reset code'
    : action === 'invite' ? 'Risip · You are invited'
    : 'Risip · Verification code';

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style="margin:0;padding:0;background:#f6f7f9;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
          <tr>
            <td align="center">
              <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e8ebef;border-radius:16px;overflow:hidden">
                <tr>
                  <td style="padding:24px 32px 18px">${LOGO_SVG}</td>
                </tr>
                <tr><td style="height:3px;background:#DD2D4A;line-height:3px;font-size:0">&nbsp;</td></tr>
                <tr>
                  <td style="padding:28px 32px 8px">
                    <h1 style="margin:0 0 8px;font-family:'Outfit',sans-serif;font-size:20px;font-weight:600;color:#0f172a">${heading}</h1>
                    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">${preface}</p>
                    <div style="margin:0 auto 20px;padding:18px 24px;background:#fdf2f4;border:1px solid #f6c9d2;border-radius:12px;text-align:center">
                      <div style="font-family:'Outfit',sans-serif;font-size:34px;letter-spacing:10px;font-weight:700;color:#DD2D4A">${token}</div>
                    </div>
                    <p style="margin:0;font-size:12px;color:#475569;line-height:1.6">
                      This code expires in a few minutes. If you did not request it, ignore this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 32px;border-top:1px solid #eef1f4;font-size:12px;color:#475569;line-height:1.6">
                    <strong style="color:#334155">Risip</strong> · Scan receipts, generate invoices.<br />
                    <span style="color:#94a3b8">risip.online</span>
                  </td>
                </tr>
              </table>
              <div style="margin-top:16px;font-size:11px;color:#94a3b8;font-family:'Outfit',sans-serif">© Risip · Tanzania</div>
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

  const rawBody = await req.text();
  let payload: HookPayload;
  try {
    // Supabase gives the secret as "v1,whsec_<base64>"; standardwebhooks wants the base64 part.
    const wh = new Webhook(hookSecret.replace('v1,whsec_', ''));
    payload = wh.verify(rawBody, Object.fromEntries(req.headers)) as HookPayload;
  } catch (err) {
    console.error('signature verification failed', err);
    return bad('invalid signature', 401);
  }

  const { subject, html } = renderEmail(payload);

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: payload.user.email, subject, html }),
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
