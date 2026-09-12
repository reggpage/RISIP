import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import WhatsAppFloatingButton from '@/components/whatsapp/WhatsAppFloatingButton';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { buildRisipWhatsAppUrl } from '@/features/whatsapp/publicWhatsApp';
import { useAuth } from '@/lib/auth';
import { getLang } from '@/lib/lang';
import { apiUrl, isNative } from '@/lib/native';

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
    another: 'Tumia namba nyingine',
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
    another: 'Use another number',
  },
} as const;

/**
 * The country code is printed on the field, not typed, so this keeps only the
 * national part. People write their number every way there is: 0712...,
 * +255712..., 255 712..., and all three mean the same nine digits.
 */
function nationalDigits(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('255')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
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
    if (phone.length !== 9) {
      setError(c.invalid);
      return;
    }

    setPhase('sending');
    try {
      const response = await fetch(apiUrl('/api/auth/whatsapp/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_number: `+255${phone}`, purpose: mode, language: lang }),
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
      {phase === 'sent' ? (
        <div className="rp-auth-centre">
          <span className="rp-auth-mark"><CheckCircle2 /></span>
          <h1 className="rp-auth-title">{c.sentTitle}</h1>
          <p className="rp-auth-lead">{c.sentBody}</p>
          {directUrl && (
            <a href={directUrl} target="_blank" rel="noopener noreferrer" className="rp-auth-wa">
              <WhatsAppIcon />{c.openWhatsApp}
            </a>
          )}
          <p className="rp-auth-alt">
            <button type="button" onClick={() => setPhase('form')} className="rp-auth-link">{c.another}</button>
          </p>
        </div>
      ) : (
        <>
          {/* Two routes, one component: the segments are links, so the URL
              still says which page you are on. The installed app hides the
              segment tabs — the switch link at the foot of the card is enough,
              and the screen reads cleaner like a real app. */}
          {!isNative() && (
          <div className="rp-auth-tabs">
            {([['login', '/login', c.login], ['register', '/signup', c.register]] as const).map(([key, to, label]) => (
              <Link key={key} to={to} aria-current={mode === key ? 'page' : undefined} className="rp-auth-tab">
                {label}
              </Link>
            ))}
          </div>
          )}

          <div className="rp-auth-centre">
            <span className="rp-auth-mark"><WhatsAppIcon /></span>
            <h1 className="rp-auth-title">{mode === 'login' ? c.loginTitle : c.registerTitle}</h1>
            <p className="rp-auth-lead">{mode === 'login' ? c.loginLead : c.registerLead}</p>
          </div>

          <form onSubmit={submit} className="rp-auth-form">
            <div>
              <label htmlFor="wa-phone" className="rp-auth-label">{c.phone}</label>
              <div className="rp-auth-phone">
                <span aria-hidden="true" className="rp-auth-prefix">+255</span>
                <input
                  id="wa-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(event) => setPhone(nationalDigits(event.target.value))}
                  placeholder="7xx xxx xxx"
                  aria-describedby="wa-phone-privacy"
                  className="rp-auth-input"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="rp-auth-error">
                <AlertCircle size={15} aria-hidden="true" />{error}
              </p>
            )}

            <button type="submit" className="rp-auth-button rp-auth-submit" disabled={phase === 'sending'}>
              {phase === 'sending' ? <Loader2 className="rp-auth-spinner" /> : <WhatsAppIcon />}
              {mode === 'login' ? c.submitLogin : c.submitRegister}
            </button>
          </form>

          <p id="wa-phone-privacy" className="rp-auth-note">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>{c.privacy}</span>
          </p>

          <p className="rp-auth-alt">
            {mode === 'login' ? c.newHere : c.haveAccount}{' '}
            <Link to={mode === 'login' ? '/signup' : '/login'} className="rp-auth-link">
              {mode === 'login' ? c.register : c.login}
            </Link>
          </p>
        </>
      )}
      <WhatsAppFloatingButton />
    </AuthShell>
  );
}
