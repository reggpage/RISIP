import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import OtpInput, { OTP_LENGTH } from '@/components/ui/OtpInput';
import PasswordField, { PasswordStrengthBar, scorePassword } from '@/components/ui/PasswordField';
import StepProgress from '@/components/ui/StepProgress';
import {
  startCompanySignup,
  resendSignupOtp,
  verifySignupOtp,
  createCompanyAfterVerification,
  type CompanyDetails,
} from '@/features/auth/signupCompany';
import { sw } from '@/i18n/sw';
import { supabase } from '@/lib/supabase';

type Step1Fields = Pick<
  CompanyDetails,
  'company_name' | 'hq_location' | 'sector' | 'full_name' | 'phone' | 'email' | 'company_password'
>;

const STEP_LABELS = [sw.auth.stepCompany, sw.auth.stepVerify] as const;
const RESEND_COOLDOWN_SECONDS = 60;
const SIGNUP_DRAFT_KEY = 'risip:companySignupDraft';

type SignupDraft = Pick<Step1Fields, 'company_name' | 'hq_location' | 'sector' | 'full_name' | 'phone' | 'email'>;

function readSignupDraft(): SignupDraft | null {
  try {
    const raw = window.localStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupDraft & { saved_at?: number };
    if (parsed.saved_at && Date.now() - parsed.saved_at > 24 * 60 * 60 * 1000) {
      window.localStorage.removeItem(SIGNUP_DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSignupDraft(values: Step1Fields) {
  const draft: SignupDraft & { saved_at: number } = {
    company_name: values.company_name ?? '',
    hq_location: values.hq_location ?? '',
    sector: values.sector ?? '',
    full_name: values.full_name ?? '',
    phone: values.phone ?? '',
    email: values.email ?? '',
    saved_at: Date.now(),
  };
  window.localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
}

export default function SignupCompany() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifiedAccessToken, setVerifiedAccessToken] = useState<string | null>(null);
  const [needsCompanyPassword, setNeedsCompanyPassword] = useState(false);

  const {
    register,
    trigger,
    getValues,
    reset,
    formState: { errors },
  } = useForm<Step1Fields>({ mode: 'onTouched' });

  // Keep only non-sensitive signup details. If the browser is refreshed after OTP
  // verification, the session can resume setup without storing either password.
  useEffect(() => {
    const draft = readSignupDraft();
    if (!draft) return;
    reset({ ...draft, company_password: '' });
    void supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session?.user.email_confirmed_at || session.user.email?.toLowerCase() !== draft.email.toLowerCase()) return;
      setVerifiedAccessToken(session.access_token);
      setNeedsCompanyPassword(true);
      setStep(2);
    });
  }, [reset]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  async function goStep2() {
    setSubmitError(null);
    const ok = await trigger(['company_name', 'hq_location', 'full_name', 'email', 'company_password']);
    if (!ok) return;
    if (password.length < 8) {
      setSubmitError(sw.auth.personalPasswordHint);
      return;
    }
    if (password !== passwordConfirm) {
      setSubmitError(sw.auth.passwordMismatch);
      return;
    }
    const { email, full_name } = getValues();
    saveSignupDraft(getValues());
    setSubmitting(true);
    try {
      await startCompanySignup(email, full_name, password);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStep(2);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(code: string) {
    setOtpError(null);
    setSubmitError(null);
    const v = getValues();
    setSubmitting(true);
    try {
      const session = await verifySignupOtp(v.email, code);
      setVerifiedAccessToken(session.access_token);
      saveSignupDraft(v);
      setNeedsCompanyPassword(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : sw.auth.otp.invalid;
      setOtpError(message.includes('Invalid') || message.includes('expired') ? sw.auth.otp.invalid : null);
      if (!message.includes('Invalid') && !message.includes('expired')) setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function finishCompanySetup(accessToken = verifiedAccessToken) {
    const v = getValues();
    if (!accessToken) throw new Error('Your verified session is missing. Please verify the email again.');
    if (!v.company_password?.trim()) {
      setNeedsCompanyPassword(true);
      throw new Error('Enter your company access password to finish setup.');
    }
    await createCompanyAfterVerification({
        full_name: v.full_name,
        phone: v.phone,
        company_name: v.company_name,
        hq_location: v.hq_location,
        sector: v.sector,
        company_password: v.company_password,
      }, accessToken);
    window.localStorage.removeItem(SIGNUP_DRAFT_KEY);
    navigate('/dashboard', { replace: true });
  }

  async function resendOtp() {
    if (resendIn > 0 || submitting || verifiedAccessToken) return;
    setSubmitError(null);
    const { email } = getValues();
    setSubmitting(true);
    try {
      await resendSignupOtp(email);
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  const pwScore = scorePassword(password);
  const strengthLabel =
    pwScore >= 4 ? sw.auth.passwordStrength.strong
    : pwScore >= 3 ? sw.auth.passwordStrength.good
    : pwScore >= 2 ? sw.auth.passwordStrength.fair
    : sw.auth.passwordStrength.weak;

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">{sw.auth.signupCompany}</h1>
      </div>

      <StepProgress step={step} labels={STEP_LABELS} />

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <Input
              label={sw.auth.companyName}
              {...register('company_name', { required: true })}
              error={errors.company_name && sw.common.error}
            />
            <Input
              label={sw.auth.hqLocation}
              {...register('hq_location', { required: true })}
              error={errors.hq_location && sw.common.error}
            />
            <Input label={sw.auth.sector} {...register('sector')} />
            <Input
              label={sw.auth.companyAccessPassword}
              hint={sw.auth.companyPasswordHint}
              {...register('company_password', { required: true, minLength: 6 })}
              error={errors.company_password && sw.auth.companyPasswordHint}
            />

            <div className="my-1 h-px bg-surface-border" />

            <Input
              label={sw.auth.adminName}
              autoComplete="name"
              hint={sw.auth.adminNameHint}
              {...register('full_name', { required: true })}
              error={errors.full_name && sw.common.error}
            />
            <Input label={sw.auth.phone} autoComplete="tel" {...register('phone')} />
            <Input
              type="email"
              label={sw.auth.email}
              autoComplete="email"
              {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
              error={errors.email && sw.common.error}
            />
            <PasswordField
              label={sw.auth.personalPassword}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={sw.auth.personalPasswordHint}
            />
            {password.length > 0 && (
              <div className="flex flex-col gap-1">
                <PasswordStrengthBar score={pwScore} />
                <span className="text-xs text-ink-muted">{strengthLabel}</span>
              </div>
            )}
            <PasswordField
              label={sw.auth.passwordConfirm}
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              error={
                passwordConfirm.length > 0 && password !== passwordConfirm
                  ? sw.auth.passwordMismatch
                  : undefined
              }
            />

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <Button type="button" tint="admin" fullWidth disabled={submitting} onClick={goStep2}>
              {submitting ? sw.common.loading : sw.auth.next}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-ink">{sw.auth.otp.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {sw.auth.otp.subtitle}{' '}
                <span className="font-medium text-ink">{getValues('email')}</span>
              </p>
            </div>

            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (v.length === OTP_LENGTH && !verifiedAccessToken && !submitting) void verifyOtp(v);
              }}
              disabled={submitting}
              error={!!otpError}
            />

            {verifiedAccessToken ? (
              <p className="text-center text-sm text-emerald-700">Email verified. Finish setup when you are ready.</p>
            ) : otpError ? (
              <p className="text-center text-sm text-red-600">{otpError}</p>
            ) : null}

            <div className="text-center text-sm">
              {verifiedAccessToken ? (
                <span className="text-ink-muted">Your company details are ready to finish.</span>
              ) : resendIn > 0 ? (
                <span className="text-ink-muted">{sw.auth.otp.resendIn(resendIn)}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void resendOtp()}
                  className="font-medium text-role-admin hover:underline disabled:opacity-50"
                  disabled={submitting}
                >
                  {sw.auth.otp.resend}
                </button>
              )}
            </div>

            {submitError && <p className="text-center text-sm text-red-600">{submitError}</p>}

            {verifiedAccessToken && (
              <>
                {needsCompanyPassword && (
                  <Input
                    label={sw.auth.companyAccessPassword}
                    hint="Re-enter the shared password to finish setting up this company."
                    {...register('company_password', { required: true, minLength: 6 })}
                    error={errors.company_password && sw.auth.companyPasswordHint}
                  />
                )}
                <Button
                  type="button"
                  tint="admin"
                  fullWidth
                  disabled={submitting}
                  onClick={() => {
                    setSubmitError(null);
                    setSubmitting(true);
                    void finishCompanySetup().catch((err) => {
                      setSubmitError(err instanceof Error ? err.message : sw.common.error);
                    }).finally(() => setSubmitting(false));
                  }}
                >
                  {submitting ? sw.common.loading : 'Finish company setup'}
                </Button>
              </>
            )}

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="font-medium text-ink-muted hover:text-ink disabled:opacity-50"
                disabled={submitting}
              >
                {sw.auth.back}
              </button>
              <Link to="/login" className="font-medium text-role-admin hover:underline">
                {sw.auth.login}
              </Link>
            </div>
          </div>
        )}
    </AuthShell>
  );
}
