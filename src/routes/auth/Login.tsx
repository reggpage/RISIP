import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Building2, Search } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordField from '@/components/ui/PasswordField';
import { useCompanySearch } from '@/features/find/useCompanySearch';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';

type FormValues = { email: string; password: string };

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
          {tab === 'admin' ? sw.auth.adminLogin : sw.find.title}
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
        <CompanyFinderPane onOpenFinder={() => navigate('/find-company')} />
      )}
    </AuthShell>
  );
}

function CompanyFinderPane({ onOpenFinder }: { onOpenFinder: () => void }) {
  const [q, setQ] = useState('');
  const { results, loading, error } = useCompanySearch(q);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={sw.find.searchPlaceholder}
          className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-center text-sm text-ink-muted">{sw.common.loading}</p>}
      {q.trim().length > 1 && !loading && results.length === 0 && (
        <p className="text-center text-sm text-ink-muted">{sw.find.noResults}</p>
      )}
      {q.trim().length < 2 && (
        <p className="text-center text-sm text-ink-muted">{sw.find.typeToSearch}</p>
      )}

      <div className="flex flex-col gap-2">
        {results.slice(0, 4).map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={onOpenFinder}
            className="flex w-full items-center gap-3 rounded-lg border border-surface-border bg-surface px-3 py-3 text-left transition hover:border-role-admin/40 hover:bg-surface-muted"
          >
            {company.logo_url ? (
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-surface-border bg-surface">
                <img src={company.logo_url} alt="" className="h-full w-full object-cover" />
              </span>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-role-admin/10 text-role-admin">
                <Building2 className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{company.name}</span>
          </button>
        ))}
      </div>

      <Button type="button" tint="admin" fullWidth onClick={onOpenFinder}>
        Continue to company login
      </Button>
    </div>
  );
}
