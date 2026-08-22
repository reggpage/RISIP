import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import WhatsAppFloatingButton from '@/components/whatsapp/WhatsAppFloatingButton';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { buildRisipWhatsAppUrl } from '@/features/whatsapp/publicWhatsApp';
import { useAuth } from '@/lib/auth';
import { getLang } from '@/lib/lang';

type Mode = 'login' | 'register';
type Phase = 'form' | 'sending' | 'sent';

const COPY = {
  sw: {
    loginTitle: 'Ingia kupitia WhatsApp',
    registerTitle: 'Anza kutumia Risip',
    loginLead: 'Weka namba yako. Risip itakutumia link salama ya kuingia kupitia WhatsApp.',
    registerLead: 'Weka namba yako. Risip itaanzisha usajili wako moja kwa moja kwenye WhatsApp.',
    phone: 'Namba ya WhatsApp',
    submitLogin: 'Nitume link ya kuingia',
    submitRegister: 'Anza usajili WhatsApp',
    sentTitle: 'Angalia WhatsApp yako',
    sentBody: 'Tumepokea ombi lako. Kama namba hii imeunganishwa, utapata link ya dakika 5. Kama ni mpya, Risip itakuongoza kusajili biashara.',
    openWhatsApp: 'Fungua WhatsApp',
    newHere: 'Huna akaunti?',
    haveAccount: 'Una akaunti tayari?',
    register: 'Jisajili',
    login: 'Ingia',
    privacy: 'Hatutaonyesha kama namba ina akaunti. Link ya kuingia inatumika mara moja na inaisha baada ya dakika 5.',
    invalid: 'Weka namba sahihi ya WhatsApp.',
    error: 'Hatukuweza kutuma ujumbe sasa. Fungua WhatsApp moja kwa moja au jaribu tena.',
  },
  en: {
    loginTitle: 'Sign in with WhatsApp',
    registerTitle: 'Start using Risip',
    loginLead: 'Enter your number. Risip will send a secure sign-in link on WhatsApp.',
    registerLead: 'Enter your number. Risip will start your registration directly on WhatsApp.',
    phone: 'WhatsApp number',
    submitLogin: 'Send my sign-in link',
    submitRegister: 'Start on WhatsApp',
    sentTitle: 'Check your WhatsApp',
    sentBody: 'We received your request. If the number is linked, you will get a five-minute link. If it is new, Risip will guide you through business registration.',
    openWhatsApp: 'Open WhatsApp',
    newHere: 'New to Risip?',
    haveAccount: 'Already have an account?',
    register: 'Register',
    login: 'Sign in',
    privacy: 'We never reveal whether a number has an account. Sign-in links work once and expire after five minutes.',
    invalid: 'Enter a valid WhatsApp number.',
    error: 'We could not send the message right now. Open WhatsApp directly or try again.',
  },
} as const;

function plausiblePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export default function WhatsAppAuth({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const lang = getLang();
  const c = COPY[lang];
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const directUrl = buildRisipWhatsAppUrl(mode, lang);

  if (auth.status === 'signed-in' && auth.profile) {
    return <Navigate to="/dashboard" replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!plausiblePhone(phone)) {
      setError(c.invalid);
      return;
    }

    setPhase('sending');
    try {
      const response = await fetch('/api/auth/whatsapp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_number: phone, purpose: mode, language: lang }),
      });
      if (!response.ok) throw new Error('request failed');
      setPhase('sent');
    } catch {
      setError(c.error);
      setPhase('form');
    }
  }

  return (
    <AuthShell>
      <div className="px-2 py-6 sm:px-6">
        {phase === 'sent' ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-11 w-11 text-[#25D366]" />
            <h1 className="mt-4 text-2xl font-semibold text-ink">{c.sentTitle}</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{c.sentBody}</p>
            {directUrl && (
              <a href={directUrl} target="_blank" rel="noopener noreferrer" className="mt-6 block">
                <Button tint="admin" fullWidth className="justify-center gap-2">
                  <WhatsAppIcon className="h-5 w-5" /> {c.openWhatsApp}
                </Button>
              </a>
            )}
            <button type="button" onClick={() => setPhase('form')} className="mt-4 text-sm font-medium text-role-admin hover:underline">
              {lang === 'sw' ? 'Tumia namba nyingine' : 'Use another number'}
            </button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <WhatsAppIcon className="mx-auto h-12 w-12 text-[#25D366]" />
              <h1 className="mt-4 text-2xl font-semibold text-ink">{mode === 'login' ? c.loginTitle : c.registerTitle}</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{mode === 'login' ? c.loginLead : c.registerLead}</p>
            </div>

            <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                label={c.phone}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+255 7xx xxx xxx"
              />
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <Button type="submit" tint="admin" fullWidth disabled={phase === 'sending'} className="justify-center gap-2">
                {phase === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-5 w-5" />}
                {mode === 'login' ? c.submitLogin : c.submitRegister}
              </Button>
            </form>

            <div className="mt-5 flex items-start justify-center gap-2 text-xs leading-relaxed text-ink-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-role-admin" />
              <span>{c.privacy}</span>
            </div>

            <p className="mt-6 text-center text-sm text-ink-muted">
              {mode === 'login' ? c.newHere : c.haveAccount}{' '}
              <Link to={mode === 'login' ? '/signup' : '/login'} className="font-semibold text-role-admin hover:underline">
                {mode === 'login' ? c.register : c.login}
              </Link>
            </p>
          </>
        )}
      </div>
      <WhatsAppFloatingButton />
    </AuthShell>
  );
}
