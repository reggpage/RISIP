import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PasswordField, { PasswordStrengthBar, scorePassword } from '@/components/ui/PasswordField';
import { useInviteInfo } from '@/features/join/getInviteInfo';
import { joinExistingWithInvite, joinWithPassword } from '@/features/join/joinProject';
import { checkCompanyPassword } from '@/features/find/joinByCompany';
import { roleColorClass, roleLabel } from '@/lib/roles';
import { sw } from '@/i18n/sw';

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
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

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

  async function onSubmit(values: FormFields) {
    if (!token) return;
    setSubmitError(null);
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
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setSubmitting(false);
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
              {...register('full_name', { required: mode === 'register' })}
              error={errors.full_name && 'Enter your full name.'}
            />
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

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <Button
          type="submit"
          tint="admin"
          fullWidth
          disabled={submitting || (mode === 'register' && (password.length < 8 || password !== passwordConfirm))}
        >
          {submitting ? sw.common.loading : mode === 'login' ? 'Log in and join' : sw.join.finish}
        </Button>
      </form>
    </AuthShell>
  );
}
