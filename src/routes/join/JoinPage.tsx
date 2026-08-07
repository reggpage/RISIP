import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PasswordField, { PasswordStrengthBar, scorePassword } from '@/components/ui/PasswordField';
import { useInviteInfo } from '@/features/join/getInviteInfo';
import {
  EmailVerificationRequiredError,
  joinExistingWithInvite,
  joinVerifiedWithInvite,
  joinWithPassword,
  resendInviteSignupOtp,
  verifyInviteSignupOtp,
} from '@/features/join/joinProject';
import OtpInput, { OTP_LENGTH } from '@/components/ui/OtpInput';
import { checkCompanyPassword } from '@/features/find/joinByCompany';
import { roleColorClass, roleLabel } from '@/lib/roles';
import { sw } from '@/i18n/sw';
import { supabase } from '@/lib/supabase';

type FormFields = {
  company_password: string;
  full_name: string;
  phone?: string;
  email: string;
  password: string;
  password_confirm: string;
};

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const inviteState = useInviteInfo(token);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLoginHint, setShowLoginHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [pendingVerification, setPendingVerification] = useState<FormFields | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [fullNameNotice, setFullNameNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormFields>({ mode: 'onTouched' });

  const password = watch('password', '');
  const passwordConfirm = watch('password_confirm', '');
  const pwScore = scorePassword(password);
  const strengthLabel =
    pwScore >= 4 ? sw.auth.passwordStrength.strong
    : pwScore >= 3 ? sw.auth.passwordStrength.good
    : pwScore >= 2 ? sw.auth.passwordStrength.fair
    : sw.auth.passwordStrength.weak;

  if (inviteState.status === 'loading') {
    return (
      <AuthShell>
        <div className="text-center text-ink-muted">{sw.common.loading}</div>
      </AuthShell>
    );
  }
  if (inviteState.status === 'error') {
    return (
      <AuthShell>
        <div className="text-center text-red-600">{inviteState.message}</div>
      </AuthShell>
    );
  }

  const info = inviteState.info;
  if (!info || !info.is_valid) {
    const reasonKey = (info?.reason ?? 'not_found') as keyof typeof sw.join.invalid;
    return (
      <AuthShell>
        <Card className="text-center">
          <h1 className="mb-2 text-xl font-semibold text-ink">{sw.join.invalidTitle}</h1>
          <p className="text-sm text-ink-muted">
            {sw.join.invalid[reasonKey] ?? sw.join.invalid.not_found}
          </p>
        </Card>
      </AuthShell>
    );
  }

  const role = info.role!;
  const roleName = roleLabel[role];
  const fullNameField = register('full_name', { required: mode === 'register' });

  async function checkExistingFullName(value: string) {
    const name = value.trim();
    if (!name || !info.company_id || mode !== 'register') {
      setFullNameNotice(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', info.company_id)
      .ilike('full_name', name)
      .limit(1);
    if (error) {
      // A new invite may not have a session yet, so the lookup is best-effort.
      setFullNameNotice('Full names can be shared by team members. Your email identifies your account.');
      return;
    }
    setFullNameNotice(data && data.length > 0
      ? 'This name is already used by another team member. That is okay—your email identifies your account.'
      : null);
  }

  async function onSubmit(values: FormFields) {
    if (!token) return;
    setSubmitError(null);
    setShowLoginHint(false);
    if (!values.company_password.trim()) {
      setSubmitError('Enter the company password to continue.');
      return;
    }
    if (mode === 'register' && values.password !== values.password_confirm) {
      setSubmitError(sw.auth.passwordMismatch);
      return;
    }
    setSubmitting(true);
    try {
      if (!info.company_id) throw new Error(sw.common.error);
      const ok = await checkCompanyPassword(info.company_id, values.company_password);
      if (!ok) {
        setSubmitError('Invalid company password.');
        return;
      }
      if (mode === 'login') {
        await joinExistingWithInvite({
          token,
          company_password: values.company_password,
          email: values.email,
          password: values.password,
        });
      } else {
        await joinWithPassword({
          token,
          company_password: values.company_password,
          full_name: values.full_name,
          phone: values.phone,
          email: values.email,
          password: values.password,
        });
      }
      navigate(role === 'worker' ? '/receipts' : '/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof EmailVerificationRequiredError && mode === 'register') {
        setPendingVerification(values);
        setVerificationCode('');
        setVerificationError(null);
        return;
      }
      const message = err instanceof Error ? err.message : sw.common.error;
      setSubmitError(message);
      setShowLoginHint(message.toLowerCase().includes('already registered') || message.toLowerCase().includes('email verification'));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyAndJoin() {
    if (!token || !pendingVerification) return;
    if (verificationCode.trim().length !== OTP_LENGTH) {
      setVerificationError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }
    setVerifyingEmail(true);
    setVerificationError(null);
    try {
      await verifyInviteSignupOtp(pendingVerification.email, verificationCode);
      await joinVerifiedWithInvite({
        token,
        company_password: pendingVerification.company_password,
        full_name: pendingVerification.full_name,
        phone: pendingVerification.phone,
      });
      navigate(role === 'worker' ? '/receipts' : '/dashboard', { replace: true });
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'The code could not be verified.');
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function resendVerificationCode() {
    if (!pendingVerification) return;
    setVerificationError(null);
    try {
      await resendInviteSignupOtp(pendingVerification.email);
      setVerificationError('A new verification code was sent.');
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Could not resend the code.');
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <p className="text-sm text-ink-muted">{sw.join.invitedTo}</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">{info.project_name}</h2>
        <div className="text-sm text-ink-muted">
          {info.company_name} · <span className={roleColorClass[role]}>{sw.join.asRole} {roleName}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-md px-3 py-2 font-medium transition ${mode === 'login' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            I already have an account
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-md px-3 py-2 font-medium transition ${mode === 'register' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            Create account
          </button>
        </div>

        {pendingVerification ? (
          <Card className="border-role-admin/20 bg-surface p-5 shadow-sm">
            <div className="flex flex-col items-center gap-4 text-center">
              <div>
                <h3 className="text-lg font-semibold text-ink">Verify your email</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  We sent a {OTP_LENGTH}-digit code to <span className="font-medium text-ink">{pendingVerification.email}</span>.
                </p>
              </div>
              <OtpInput
                value={verificationCode}
                onChange={setVerificationCode}
                disabled={verifyingEmail}
                error={!!verificationError && verificationCode.length === OTP_LENGTH}
              />
              {verifyingEmail && (
                <div className="flex items-center gap-2 text-sm text-ink-muted" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying your email…
                </div>
              )}
              {verificationError && <p className={`text-sm ${verificationError.startsWith('A new') ? 'text-emerald-700' : 'text-red-600'}`}>{verificationError}</p>}
              <Button type="button" tint="admin" fullWidth disabled={verifyingEmail} onClick={() => void verifyAndJoin()}>
                {verifyingEmail ? 'Verifying…' : 'Verify and join project'}
              </Button>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <button type="button" className="font-medium text-role-admin hover:underline" onClick={() => void resendVerificationCode()} disabled={verifyingEmail}>
                  Resend code
                </button>
                <button type="button" className="text-ink-muted hover:text-ink" onClick={() => { setPendingVerification(null); setVerificationError(null); setVerificationCode(''); }} disabled={verifyingEmail}>
                  Back to account details
                </button>
              </div>
            </div>
          </Card>
        ) : <>
        <PasswordField
          label="Company password"
          autoComplete="off"
          hint="Enter the shared password for this company."
          {...register('company_password', { required: true, minLength: 6 })}
          error={errors.company_password && 'Enter the company password.'}
        />
        {mode === 'register' && (
          <>
            <Input
              label={sw.auth.fullName}
              autoComplete="name"
              {...fullNameField}
              onBlur={(event) => {
                fullNameField.onBlur(event);
                void checkExistingFullName(event.target.value);
              }}
              error={errors.full_name && 'Enter your full name.'}
            />
            {fullNameNotice && <p className="-mt-2 text-xs text-amber-700">{fullNameNotice}</p>}
            <Input label={sw.auth.phone} autoComplete="tel" {...register('phone')} />
          </>
        )}
        <Input
          type="email"
          label={sw.auth.email}
          autoComplete="email"
          {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
          error={errors.email && 'Enter a valid email address.'}
        />

        <PasswordField
          label={sw.auth.password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          hint={mode === 'register' ? sw.auth.passwordHint : undefined}
          {...register('password', { required: true, minLength: mode === 'register' ? 8 : 6 })}
          error={errors.password && (mode === 'register' ? sw.auth.passwordHint : 'Enter your password.')}
        />
        {mode === 'register' && password.length > 0 && (
          <div className="-mt-2 flex flex-col gap-1">
            <PasswordStrengthBar score={pwScore} />
            <span className="text-xs text-ink-muted">{strengthLabel}</span>
          </div>
        )}
        {mode === 'register' && (
          <PasswordField
            label={sw.auth.passwordConfirm}
            autoComplete="new-password"
            {...register('password_confirm', { required: mode === 'register' })}
            error={
              passwordConfirm.length > 0 && password !== passwordConfirm
                ? sw.auth.passwordMismatch
                : undefined
            }
          />
        )}

        {submitError && (
          <div className="space-y-2 text-sm text-red-600">
            <p>{submitError}</p>
            {showLoginHint && mode === 'register' && (
              <button
                type="button"
                className="font-medium text-role-admin underline underline-offset-2"
                onClick={() => { setMode('login'); setSubmitError(null); setShowLoginHint(false); }}
              >
                I already have an account — log in instead
              </button>
            )}
          </div>
        )}

        <Button
          type="submit"
          tint="admin"
          fullWidth
          disabled={submitting || (mode === 'register' && (password.length < 8 || password !== passwordConfirm))}
        >
          {submitting ? sw.common.loading : mode === 'login' ? 'Log in and join' : sw.join.finish}
        </Button>
        </>}
      </form>
    </AuthShell>
  );
}
