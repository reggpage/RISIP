import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { supabase } from '@/lib/supabase';
import { getLang } from '@/lib/lang';

// Signing in from a link sent over WhatsApp.
//
// The token in the URL is the whole credential, so this page's job is to spend it
// immediately and get it out of the address bar. It is five minutes old at most,
// works once, and is stored server-side only as a SHA-256 hash.
//
// Two hops, on purpose:
//   1. the wa-login edge function verifies the token and, with the service-role
//      key, mints a one-time magic-link hash for that account;
//   2. this page exchanges that hash for a session.
// The browser never sees a password, because these accounts do not have one.

type Phase = 'working' | 'failed';

const COPY = {
  sw: {
    working: 'Tunakuingiza…',
    workingNote: 'Tunathibitisha link yako ya WhatsApp. Usifunge ukurasa huu.',
    failedTitle: 'Link haifanyi kazi',
    expired: 'Link imeisha muda. Rudi WhatsApp uandike "ingia" upate mpya.',
    used: 'Link hii ilishatumika. Andika "ingia" WhatsApp upate mpya.',
    invalid: 'Link hii si sahihi. Andika "ingia" WhatsApp upate mpya.',
    missing: 'Hakuna link hapa. Fungua ile uliyotumiwa WhatsApp.',
    toLogin: 'Omba link mpya WhatsApp',
    why: 'Kila link ya kuingia inatumika mara moja tu na inaisha baada ya dakika 5. Hii inalinda akaunti yako kama ujumbe ukisambazwa kwa mtu mwingine.',
    eyebrow: 'KUINGIA KWA WHATSAPP',
  },
  en: {
    working: 'Signing you in…',
    workingNote: 'We are checking your WhatsApp link. Please keep this page open.',
    failedTitle: 'That link did not work',
    expired: 'The link has expired. Send "login" on WhatsApp for a fresh one.',
    used: 'That link has already been used. Send "login" on WhatsApp for a fresh one.',
    invalid: 'That link is not valid. Send "login" on WhatsApp for a fresh one.',
    missing: 'There is no link here. Open the one sent to you on WhatsApp.',
    toLogin: 'Request a new WhatsApp link',
    why: 'Every sign-in link works once and expires after five minutes. That is what protects your account if the message is ever forwarded to somebody else.',
    eyebrow: 'WHATSAPP SIGN IN',
  },
} as const;

export default function WaLogin() {
  const navigate = useNavigate();
  const lang = getLang() === 'sw' ? 'sw' : 'en';
  const c = COPY[lang];
  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState('');
  // React 18 StrictMode mounts twice in development, and this token works once.
  const spent = useRef(false);

  useEffect(() => {
    if (spent.current) return;
    spent.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('t');
    // Where to land. An ALLOW-LIST, not a validated string: anything else here
    // is an open redirect wearing a login token, and this link arrives over
    // WhatsApp where a forwarded message is one tap from a stranger.
    const asked = params.get('n') ?? '';
    const next = (['/scan', '/sell', '/products', '/receipts', '/daily-records', '/dashboard'] as const)
      .find((path) => path === asked) ?? '/dashboard';
    // Out of the address bar before anything else, so it cannot be shared by a
    // pasted URL, leak through a referrer header, or sit in browser history.
    window.history.replaceState({}, '', '/wa-login');

    if (!token) {
      setPhase('failed');
      setMessage(c.missing);
      return;
    }

    void (async () => {
      try {
        // Plain fetch, not functions.invoke: the function answers a spent or
        // expired token with 401, and invoke() throws away the body on a non-2xx,
        // leaving only "non-2xx status code". Reading the body is what lets us
        // tell somebody their link expired rather than a flat "not valid".
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wa-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as { token_hash?: string; error?: string };

        if (!res.ok || !data.token_hash) {
          const serverError = data.error ?? '';
          setPhase('failed');
          setMessage(
            /expired/i.test(serverError) ? c.expired
              : /already been used/i.test(serverError) ? c.used
              : c.invalid,
          );
          return;
        }

        const { error: otpErr } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: data.token_hash,
        });
        if (otpErr) {
          setPhase('failed');
          setMessage(c.invalid);
          return;
        }

        navigate(next, { replace: true });
      } catch {
        setPhase('failed');
        setMessage(c.invalid);
      }
    })();
  }, [c, navigate]);

  // Mostly a spinner, but a real customer lands here straight from WhatsApp, so
  // it wears the same paper, bar and brand red as every other public page.
  return (
    <AuthShell>
      {phase === 'working' ? (
        <div className="rp-auth-status" role="status">
          <Loader2 className="rp-auth-spinner" aria-hidden="true" />
          <h1 className="rp-auth-title">{c.working}</h1>
          <p className="rp-auth-lead">{c.workingNote}</p>
        </div>
      ) : (
        <div className="rp-auth-centre">
          <span className="rp-auth-mark rp-auth-mark-warn"><ShieldAlert /></span>
          <p className="rp-auth-eyebrow">{c.eyebrow}</p>
          <h1 className="rp-auth-title">{c.failedTitle}</h1>
          <p className="rp-auth-lead" role="alert">{message}</p>

          <Link to="/login" className="rp-auth-button rp-auth-submit rp-auth-full">
            <WhatsAppIcon />{c.toLogin}
          </Link>

          <p className="rp-auth-why">{c.why}</p>
        </div>
      )}
    </AuthShell>
  );
}
