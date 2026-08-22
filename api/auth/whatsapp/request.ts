import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeWhatsAppNumber } from '../../../src/features/whatsapp/webAuthPhone';

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

type RequestBody = {
  whatsapp_number?: unknown;
  purpose?: unknown;
  language?: unknown;
};

const GENERIC_ACCEPTED = {
  ok: true,
  message: 'If this number can receive Risip messages, WhatsApp will guide the next step.',
};

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function requestIp(req: VercelRequest): string {
  const forwarded = firstHeader(req.headers['x-forwarded-for']).split(',')[0]?.trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function secretHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

async function sendTemplate(input: {
  to: string;
  template: string;
  language: 'en' | 'sw';
  parameters?: string[];
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_VERSION || process.env.WHATSAPP_API_VERSION || 'v22.0';
  if (!token || !phoneId) throw new Error('WhatsApp delivery is not configured');

  const components = input.parameters?.length
    ? [{
        type: 'body',
        parameters: input.parameters.map((text) => ({ type: 'text', text })),
      }]
    : undefined;

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: input.template,
        language: { code: input.language === 'sw' ? 'sw' : 'en_US' },
        ...(components ? { components } : {}),
      },
    }),
  });

  if (!response.ok) {
    const providerMessage = await response.text().catch(() => '');
    console.error('WhatsApp template delivery failed', response.status, providerMessage.slice(0, 500));
    throw new Error('WhatsApp delivery failed');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = firstHeader(req.headers.origin);
  const allowedOrigins = new Set(['https://risip.online', 'https://www.risip.online']);
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://127.0.0.1:5173');
  }
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Request origin is not allowed' });
    return;
  }

  let body: RequestBody = {};
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as RequestBody;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const phone = normalizeWhatsAppNumber(body.whatsapp_number);
  if (!phone) {
    res.status(400).json({ error: 'Enter a valid WhatsApp number' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rateSecret = process.env.LOGIN_RATE_LIMIT_SECRET;
  if (!supabaseUrl || !serviceKey || !rateSecret
      || !process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.error('WhatsApp web auth is missing required server configuration');
    res.status(503).json({ error: 'WhatsApp sign-in is temporarily unavailable' });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const phoneHash = secretHash(phone, rateSecret);
  const ipHash = secretHash(requestIp(req), rateSecret);
  const { data: allowed, error: rateError } = await admin.rpc('wa_allow_web_auth_request', {
    p_phone_hash: phoneHash,
    p_ip_hash: ipHash,
  });
  if (rateError) {
    console.error('WhatsApp web auth rate check failed', rateError.message);
    res.status(503).json({ error: 'WhatsApp sign-in is temporarily unavailable' });
    return;
  }
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests. Wait a few minutes and try again.' });
    return;
  }

  const language: 'en' | 'sw' = body.language === 'sw' ? 'sw' : 'en';
  const { data: identity, error: identityError } = await admin
    .from('whatsapp_identities')
    .select('profile_id')
    .eq('phone_e164', phone)
    .is('revoked_at', null)
    .maybeSingle();

  if (identityError) {
    console.error('WhatsApp identity lookup failed', identityError.message);
    res.status(503).json({ error: 'WhatsApp sign-in is temporarily unavailable' });
    return;
  }

  try {
    if (identity?.profile_id) {
      const { data: token, error: tokenError } = await admin.rpc('wa_issue_login_token', { p_phone: phone });
      if (tokenError || typeof token !== 'string') throw new Error(tokenError?.message || 'Could not issue login token');
      const appUrl = (process.env.RISIP_PUBLIC_APP_URL || 'https://risip.online').replace(/\/$/, '');
      await sendTemplate({
        to: phone,
        template: process.env.WHATSAPP_LOGIN_TEMPLATE || 'risip_login_link',
        language,
        parameters: [`${appUrl}/wa-login?t=${token}`],
      });
    } else {
      const { data: onboarding, error: onboardingReadError } = await admin
        .from('whatsapp_onboarding')
        .select('expires_at')
        .eq('phone_e164', phone)
        .maybeSingle();
      if (onboardingReadError) throw new Error(onboardingReadError.message);

      // A web request must not erase a conversation that is already halfway
      // through a business name, invite code or person name.
      if (!onboarding || new Date(onboarding.expires_at).getTime() <= Date.now()) {
        const { error: onboardingError } = await admin.from('whatsapp_onboarding').upsert({
          phone_e164: phone,
          step: 'lang',
          lang: language,
          draft: { source: 'web_auth_request', purpose: body.purpose === 'register' ? 'register' : 'login' },
          attempts: 0,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'phone_e164' });
        if (onboardingError) throw new Error(onboardingError.message);
      }
      await sendTemplate({
        to: phone,
        template: process.env.WHATSAPP_ONBOARDING_TEMPLATE || 'risip_start_onboarding',
        language,
      });
    }
  } catch (error) {
    console.error('WhatsApp web auth request failed', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'WhatsApp sign-in is temporarily unavailable' });
    return;
  }

  // The same response for linked and unlinked numbers prevents account discovery.
  res.status(202).json(GENERIC_ACCEPTED);
}
