import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordField from '@/components/ui/PasswordField';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';

type FormValues = { email: string; password: string };

export default function Login() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">{sw.auth.adminLogin}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          type="email"
          label={sw.auth.email}
          autoComplete="email"
          {...register('email', { required: true })}
          error={errors.email && sw.common.error}
        />
        <PasswordField
          label={sw.auth.password}
          autoComplete="current-password"
          {...register('password', { required: true, minLength: 6 })}
          error={errors.password && sw.common.error}
        />
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        <Button type="submit" tint="admin" disabled={isSubmitting} fullWidth>
          {isSubmitting ? sw.common.loading : sw.auth.login}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/signup" className="font-medium text-role-admin hover:underline">
          {sw.auth.signupCompany}
        </Link>
      </p>
    </AuthShell>
  );
}
