import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
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
    failedTitle: 'Link haifanyi kazi',
    expired: 'Link imeisha muda. Rudi WhatsApp uandike "ingia" upate mpya.',
    used: 'Link hii ilishatumika. Andika "ingia" WhatsApp upate mpya.',
    invalid: 'Link hii si sahihi. Andika "ingia" WhatsApp upate mpya.',
    missing: 'Hakuna link hapa. Fungua ile uliyotumiwa WhatsApp.',
    toLogin: 'Ingia kwa barua pepe',
  },
  en: {
    working: 'Signing you in…',
    failedTitle: 'That link did not work',
    expired: 'The link has expired. Send "login" on WhatsApp for a fresh one.',
    used: 'That link has already been used. Send "login" on WhatsApp for a fresh one.',
    invalid: 'That link is not valid. Send "login" on WhatsApp for a fresh one.',
    missing: 'There is no link here. Open the one sent to you on WhatsApp.',
    toLogin: 'Sign in with email instead',
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

    const token = new URLSearchParams(window.location.search).get('t');
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
        const { data, error } = await supabase.functions.invoke<{ token_hash?: string; error?: string }>(
          'wa-login',
          { body: { token } },
        );
        const serverError = error?.message ?? data?.error;
        if (serverError || !data?.token_hash) {
          setPhase('failed');
          setMessage(
            /expired/i.test(serverError ?? '') ? c.expired
              : /already been used/i.test(serverError ?? '') ? c.used
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

        navigate('/dashboard', { replace: true });
      } catch {
        setPhase('failed');
        setMessage(c.invalid);
      }
    })();
  }, [c, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-sm">
        {phase === 'working' ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-role-admin" />
            <p className="mt-4 text-sm text-ink-muted">{c.working}</p>
          </>
        ) : (
          <>
            <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" />
            <h1 className="mt-4 text-lg font-semibold text-ink">{c.failedTitle}</h1>
            <p className="mt-2 text-sm text-ink-muted">{message}</p>
            <Link to="/login" className="mt-5 block">
              <Button variant="secondary" tint="admin" className="w-full justify-center">
                {c.toLogin}
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
