import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PasswordField, { PasswordStrengthBar, scorePassword } from '@/components/ui/PasswordField';
import { useInviteInfo } from '@/features/join/getInviteInfo';
import { joinWithPassword } from '@/features/join/joinProject';
import { roleColorClass, roleLabel } from '@/lib/roles';
import { sw } from '@/i18n/sw';

type FormFields = {
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
    if (values.password !== values.password_confirm) {
      setSubmitError(sw.auth.passwordMismatch);
      return;
    }
    setSubmitting(true);
    try {
      await joinWithPassword({
        token,
        full_name: values.full_name,
        phone: values.phone,
        email: values.email,
        password: values.password,
      });
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
        <Input
          label={sw.auth.fullName}
          autoComplete="name"
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
          label={sw.auth.password}
          autoComplete="new-password"
          hint={sw.auth.passwordHint}
          {...register('password', { required: true, minLength: 8 })}
          error={errors.password && sw.auth.passwordHint}
        />
        {password.length > 0 && (
          <div className="-mt-2 flex flex-col gap-1">
            <PasswordStrengthBar score={pwScore} />
            <span className="text-xs text-ink-muted">{strengthLabel}</span>
          </div>
        )}
        <PasswordField
          label={sw.auth.passwordConfirm}
          autoComplete="new-password"
          {...register('password_confirm', { required: true })}
          error={
            passwordConfirm.length > 0 && password !== passwordConfirm
              ? sw.auth.passwordMismatch
              : undefined
          }
        />

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <Button
          type="submit"
          tint="admin"
          fullWidth
          disabled={submitting || password.length < 8 || password !== passwordConfirm}
        >
          {submitting ? sw.common.loading : sw.join.finish}
        </Button>
      </form>
    </AuthShell>
  );
}

