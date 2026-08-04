import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordField from '@/components/ui/PasswordField';
import type { CompanyHit } from '@/features/find/useCompanySearch';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';
import { AccountPane, PasswordPane, SearchPane } from '@/routes/find/FindCompany';

type FormValues = { email: string; password: string };
type CompanyLoginStage =
  | { name: 'search' }
  | { name: 'password'; company: CompanyHit }
  | { name: 'account'; company: CompanyHit; companyPassword: string; tab: 'login' | 'register' };

export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tab, setTab] = useState<'admin' | 'company'>('admin');
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

  if (auth.status === 'signed-in' && auth.profile) {
    return <Navigate to={auth.profile.role === 'worker' ? '/receipts' : '/dashboard'} replace />;
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">
          {tab === 'admin' ? sw.auth.adminLogin : 'Company access'}
        </h1>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab('admin')}
          className={`rounded-md px-3 py-2 font-medium transition ${tab === 'admin' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
        >
          Admin login
        </button>
        <button
          type="button"
          onClick={() => setTab('company')}
          className={`rounded-md px-3 py-2 font-medium transition ${tab === 'company' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
        >
          Find company
        </button>
      </div>

      {tab === 'admin' ? (
        <>
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

          <div className="mt-4 flex items-center justify-between gap-4 text-sm">
            <Link to="/forgot-password" className="font-medium text-ink-muted hover:text-ink hover:underline">
              Forgot password?
            </Link>
            <Link to="/signup" className="font-medium text-role-admin hover:underline">
              {sw.auth.signupCompany}
            </Link>
          </div>
        </>
      ) : (
        <CompanyFinderPane onDone={(role) => navigate(role === 'worker' ? '/receipts' : '/dashboard', { replace: true })} />
      )}
    </AuthShell>
  );
}

function CompanyFinderPane({ onDone }: { onDone: (role: 'worker' | 'accountant' | 'owner') => void }) {
  const [stage, setStage] = useState<CompanyLoginStage>({ name: 'search' });

  return (
    <>
      {stage.name === 'search' && (
        <SearchPane onPick={(company) => setStage({ name: 'password', company })} />
      )}
      {stage.name === 'password' && (
        <PasswordPane
          company={stage.company}
          onBack={() => setStage({ name: 'search' })}
          onVerified={(companyPassword) => setStage({ name: 'account', company: stage.company, companyPassword, tab: 'login' })}
        />
      )}
      {stage.name === 'account' && (
        <AccountPane
          company={stage.company}
          companyPassword={stage.companyPassword}
          tab={stage.tab}
          onTab={(tab) => setStage({ ...stage, tab })}
          onBack={() => setStage({ name: 'search' })}
          onDone={onDone}
        />
      )}
    </>
  );
}
