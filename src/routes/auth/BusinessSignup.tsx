import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { buildSignupConfirmUrl } from '@/features/whatsapp/publicWhatsApp';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getLang } from '@/lib/lang';

/**
 * Business signup, asked on the web instead of over six WhatsApp round trips.
 *
 * The questions, their order and their examples are copied from the WhatsApp
 * flow (supabase/functions/_shared/whatsappOnboarding.ts) so the two doors ask
 * the same things. Two steps that flow needs are missing here on purpose:
 * language, because the site already knows it, and the "new business / join one
 * / already have an account" menu, because being on /signup answers it.
 *
 * Nothing is created here. The answers are stored as a draft and the person
 * finishes on WhatsApp, which is the only place a phone number can be proved to
 * be theirs. See migration 0170.
 */

const COPY = {
  sw: {
    of: 'Hatua {n} ya 6',
    back: 'Nyuma',
    next: 'Endelea',
    finish: 'Maliza',
    steps: [
      {
        q: 'Biashara yako inaitwaje?',
        hint: 'Hili ndilo jina litakaloonekana kwenye ripoti zako.',
        placeholder: 'Mfano: Duka la Asha',
        error: 'Naomba jina kamili la biashara, mfano "Duka la Asha".',
      },
      {
        q: 'Biashara yako inauza nini au inatoa huduma gani?',
        hint: 'Andika kwa maneno yako mwenyewe, mfano "nauza daftari, kalamu na kutoa photocopy".',
        placeholder: 'Nauza...',
        error: 'Nitajie bidhaa au huduma kuu mbili au tatu.',
      },
      {
        q: 'Wewe unaitwa nani?',
        hint: 'Utakuwa owner wa biashara hii: unaona kila kitu na unaweza kualika wafanyakazi.',
        placeholder: 'Mfano: Asha Mkwawa',
        error: 'Naomba jina lako, mfano "Asha Mkwawa".',
      },
      {
        q: 'Biashara yako inapatikana wapi?',
        hint: 'Andika eneo, mfano "Mwenge, Dar es Salaam".',
        placeholder: 'Mfano: Mwenge, Dar es Salaam',
        error: 'Naomba eneo la biashara.',
      },
      {
        q: 'Unafungua biashara saa ngapi?',
        hint: 'Chagua muda unaofungua kila siku.',
        placeholder: '',
        error: 'Chagua muda wa kufungua.',
      },
      {
        q: 'Unafunga biashara saa ngapi?',
        hint: 'Chagua muda unaofunga kila siku.',
        placeholder: '',
        error: 'Chagua muda wa kufunga.',
      },
    ],
    doneTitle: 'Karibu umemaliza',
    doneBody: 'Tumehifadhi majibu yako. Bonyeza chini kufungua WhatsApp na kuthibitisha namba yako. Hatutakuuliza maswali haya tena.',
    doneWhy: 'Tunamalizia WhatsApp kwa sababu ndiyo njia pekee ya kuhakikisha namba ni yako kweli. Akaunti itafunguliwa kwa namba itakayotuma ujumbe huu.',
    open: 'Fungua WhatsApp kuthibitisha',
    codeLabel: 'Kodi yako',
    expires: 'Kodi hii inaisha baada ya saa 1.',
    summary: { business: 'Biashara', owner: 'Owner', place: 'Eneo' },
    haveAccount: 'Una akaunti tayari?',
    login: 'Ingia',
    failed: 'Imeshindikana kuhifadhi sasa. Jaribu tena.',
    rateLimited: 'Umejaribu mara nyingi. Subiri kidogo kisha ujaribu tena.',
  },
  en: {
    of: 'Step {n} of 6',
    back: 'Back',
    next: 'Continue',
    finish: 'Finish',
    steps: [
      {
        q: 'What is your business called?',
        hint: 'This is the name that appears on your reports.',
        placeholder: 'For example: Asha’s Shop',
        error: 'Please send the full business name, for example "Asha’s Shop".',
      },
      {
        q: 'What does your business sell or what service does it provide?',
        hint: 'In your own words, for example "I sell books and stationery and offer photocopying".',
        placeholder: 'I sell...',
        error: 'Name two or three main products or services.',
      },
      {
        q: 'What is your name?',
        hint: 'You will be the owner of this business: you see everything and can invite staff.',
        placeholder: 'For example: Asha Mkwawa',
        error: 'Please send your name, for example "Asha Mkwawa".',
      },
      {
        q: 'Where is your business located?',
        hint: 'Write the area, for example "Mwenge, Dar es Salaam".',
        placeholder: 'For example: Mwenge, Dar es Salaam',
        error: 'Please give the business location.',
      },
      {
        q: 'What time do you open?',
        hint: 'Choose the time you open each day.',
        placeholder: '',
        error: 'Choose your opening time.',
      },
      {
        q: 'What time do you close?',
        hint: 'Choose the time you close each day.',
        placeholder: '',
        error: 'Choose your closing time.',
      },
    ],
    doneTitle: 'Almost done',
    doneBody: 'Your answers are saved. Open WhatsApp to confirm your number. We will not ask these questions again.',
    doneWhy: 'It finishes on WhatsApp because that is the only way to prove the number is yours. The account is created for whichever number sends this message.',
    open: 'Open WhatsApp to confirm',
    codeLabel: 'Your code',
    expires: 'This code expires in 1 hour.',
    summary: { business: 'Business', owner: 'Owner', place: 'Location' },
    haveAccount: 'Already have an account?',
    login: 'Sign in',
    failed: 'We could not save that just now. Please try again.',
    rateLimited: 'That is a lot of tries. Wait a moment and try again.',
  },
} as const;

type Answers = {
  business_name: string;
  business_description: string;
  full_name: string;
  location: string;
  opening_time: string;
  closing_time: string;
};

const FIELDS: (keyof Answers)[] = [
  'business_name', 'business_description', 'full_name', 'location', 'opening_time', 'closing_time',
];

/** The same minimums the WhatsApp state machine enforces, so neither door is looser. */
function stepIsAnswered(index: number, value: string): boolean {
  const said = value.replace(/\s+/g, ' ').trim();
  if (index === 1) return said.length >= 3;
  if (index >= 4) return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(said);
  return said.length >= 2;
}

export default function BusinessSignup() {
  const auth = useAuth();
  const lang = getLang();
  const c = COPY[lang];

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    business_name: '', business_description: '', full_name: '',
    location: '', opening_time: '08:00', closing_time: '18:00',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ code: string; waUrl: string } | null>(null);

  if (auth.status === 'signed-in' && auth.profile) return <Navigate to="/dashboard" replace />;

  const field = FIELDS[step];
  const value = answers[field];
  const isTime = step >= 4;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{ code: string }>(
        'web-signup-draft',
        { body: { ...answers, lang } },
      );
      if (fnError || !data?.code) throw fnError ?? new Error('no code');
      setDone({ code: data.code, waUrl: buildSignupConfirmUrl(data.code) });
    } catch (caught) {
      const message = String((caught as { message?: string })?.message ?? '');
      setError(message.includes('429') ? c.rateLimited : c.failed);
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!stepIsAnswered(step, value)) {
      setError(c.steps[step].error);
      return;
    }
    setError(null);
    if (step < FIELDS.length - 1) {
      setStep(step + 1);
      return;
    }
    void save();
  }

  if (done) {
    return (
      <AuthShell>
        <div className="rp-auth-centre">
          <span className="rp-auth-mark"><WhatsAppIcon /></span>
          <h1 className="rp-auth-title">{c.doneTitle}</h1>
          <p className="rp-auth-lead">{c.doneBody}</p>

          <dl className="rp-auth-summary">
            {([[c.summary.business, answers.business_name], [c.summary.owner, answers.full_name], [c.summary.place, answers.location]] as const).map(([label, said]) => (
              <div key={label}>
                <dt>{label}:</dt>
                <dd>{said}</dd>
              </div>
            ))}
          </dl>

          <a href={done.waUrl} target="_blank" rel="noopener noreferrer" className="rp-auth-wa">
            <WhatsAppIcon />{c.open}
          </a>

          <p className="rp-auth-code">
            <span>{c.codeLabel}:</span>
            <b>{done.code}</b>
            <span>{c.expires}</span>
          </p>
          <p className="rp-auth-why">{c.doneWhy}</p>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <div className="rp-auth-progress" aria-hidden="true">
        {FIELDS.map((name, index) => (
          <span key={name} className={index <= step ? 'is-done' : undefined} />
        ))}
      </div>

      <form onSubmit={submit}>
        <p className="rp-auth-step">{c.of.replace('{n}', String(step + 1))}</p>
        <h1 className="rp-auth-question">{c.steps[step].q}</h1>
        <p className="rp-auth-hint">{c.steps[step].hint}</p>

        <div className="rp-auth-form">
          {step === 1 ? (
            <textarea
              key={field}
              autoFocus
              rows={3}
              value={value}
              onChange={(event) => setAnswers({ ...answers, [field]: event.target.value })}
              placeholder={c.steps[step].placeholder}
              className="rp-auth-input"
            />
          ) : (
            <input
              key={field}
              autoFocus
              type={isTime ? 'time' : 'text'}
              value={value}
              onChange={(event) => setAnswers({ ...answers, [field]: event.target.value })}
              placeholder={c.steps[step].placeholder}
              className="rp-auth-input"
            />
          )}

          {error && (
            <p role="alert" className="rp-auth-error">
              <AlertCircle size={15} aria-hidden="true" />{error}
            </p>
          )}

          <div className="rp-auth-actions">
            {step > 0 && (
              <button
                type="button"
                onClick={() => { setError(null); setStep(step - 1); }}
                className="rp-auth-button rp-auth-ghost"
              >
                <ArrowLeft size={16} />{c.back}
              </button>
            )}
            <button type="submit" className="rp-auth-button rp-auth-submit" disabled={saving}>
              {saving && <Loader2 className="rp-auth-spinner" />}
              {step === FIELDS.length - 1 ? c.finish : c.next}
            </button>
          </div>
        </div>
      </form>

      <p className="rp-auth-alt">
        {c.haveAccount}{' '}
        <Link to="/login" className="rp-auth-link">{c.login}</Link>
      </p>
    </AuthShell>
  );
}
