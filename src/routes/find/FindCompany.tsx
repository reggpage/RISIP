import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Building2, Loader2, Search } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PasswordField, { PasswordStrengthBar, scorePassword } from '@/components/ui/PasswordField';
import { useCompanySearch, type CompanyHit } from '@/features/find/useCompanySearch';
import {
  checkCompanyPassword,
  CompanyAuthError,
  loginByCompany,
  registerByCompany,
} from '@/features/find/joinByCompany';
import { sw } from '@/i18n/sw';

// Company icon that shows the uploaded logo when present, else a building glyph.
export function CompanyIcon({ logoUrl, size = 'md' }: { logoUrl: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-10 w-10' : 'h-9 w-9';
  const icon = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  if (logoUrl) {
    return (
      <div className={`${box} shrink-0 overflow-hidden rounded-lg border border-surface-border bg-surface`}>
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${box} flex shrink-0 items-center justify-center rounded-lg bg-role-admin/10 text-role-admin`}>
      <Building2 className={icon} />
    </div>
  );
}

type Stage =
  | { name: 'search' }
  | { name: 'password'; company: CompanyHit }
  | { name: 'account'; company: CompanyHit; companyPassword: string; tab: 'login' | 'register' };

export default function FindCompany() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ name: 'search' });

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">{sw.find.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{sw.find.subtitle}</p>
      </div>

      {stage.name === 'search' && (
        <SearchPane onPick={(company) => setStage({ name: 'password', company })} />
      )}

      {stage.name === 'password' && (
        <PasswordPane
          company={stage.company}
          onBack={() => setStage({ name: 'search' })}
          onVerified={(pw) =>
            setStage({ name: 'account', company: stage.company, companyPassword: pw, tab: 'login' })
          }
        />
      )}

      {stage.name === 'account' && (
        <AccountPane
          company={stage.company}
          companyPassword={stage.companyPassword}
          tab={stage.tab}
          onTab={(tab) => setStage({ ...stage, tab })}
          onBack={() => setStage({ name: 'search' })}
          onDone={(role) => navigate(role === 'worker' ? '/receipts' : '/dashboard', { replace: true })}
        />
      )}

      <p className="mt-6 text-center text-xs text-ink-muted">
        {sw.landing.startNew}{' '}
        <Link to="/signup" className="font-medium text-role-admin hover:underline">
          {sw.landing.startNewLink}
        </Link>
      </p>
    </AuthShell>
  );
}

export function SearchPane({ onPick }: { onPick: (c: CompanyHit) => void }) {
  const [q, setQ] = useState('');
  const { results, loading, error } = useCompanySearch(q);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
        <input
          type="search"
          autoFocus
          placeholder={sw.find.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-surface pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading && <p className="py-4 text-center text-sm text-ink-muted">{sw.common.loading}</p>}

      {q.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-muted">{sw.find.noResults}</p>
      )}

      <ul className="flex flex-col gap-2">
        {results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full items-center gap-3 rounded-lg border border-surface-border bg-surface px-3 py-3 text-left hover:border-role-admin/40 hover:bg-surface-muted"
            >
              <CompanyIcon logoUrl={c.logo_url} />
              <span className="text-sm font-medium text-ink">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PasswordPane({
  company,
  onBack,
  onVerified,
}: {
  company: CompanyHit;
  onBack: () => void;
  onVerified: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Enter the company password to continue.');
      return;
    }
    setBusy(true);
    try {
      const ok = await checkCompanyPassword(company.id, password);
      if (!ok) {
        setError(sw.find.passwordInvalid);
        return;
      }
      onVerified(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {sw.auth.back}
      </button>

      <Card className="mb-4 flex items-center gap-3">
        <CompanyIcon logoUrl={company.logo_url} size="lg" />
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{company.name}</div>
          <div className="text-xs text-ink-muted">{sw.find.passwordPromptHint}</div>
        </div>
      </Card>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <PasswordField
          label={sw.find.passwordPromptField}
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" tint="admin" fullWidth disabled={busy || !password}>
          {busy ? sw.common.loading : sw.auth.next}
        </Button>
      </form>
    </div>
  );
}

export function AccountPane({
  company,
  companyPassword,
  tab,
  onTab,
  onBack,
  onDone,
}: {
  company: CompanyHit;
  companyPassword: string;
  tab: 'login' | 'register';
  onTab: (t: 'login' | 'register') => void;
  onBack: () => void;
  onDone: (role: 'worker' | 'accountant' | 'owner') => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {sw.auth.back}
      </button>

      <Card className="mb-4 flex items-center gap-3">
        <CompanyIcon logoUrl={company.logo_url} size="lg" />
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{company.name}</div>
        </div>
      </Card>

      <div className="mb-4 flex gap-1 rounded-lg bg-surface-muted p-1">
        <TabButton active={tab === 'login'} onClick={() => onTab('login')}>
          {sw.find.tabLogin}
        </TabButton>
        <TabButton active={tab === 'register'} onClick={() => onTab('register')}>
          {sw.find.tabRegister}
        </TabButton>
      </div>

      {tab === 'login' ? (
        <LoginForm company={company} onDone={onDone} />
      ) : (
        <RegisterForm company={company} companyPassword={companyPassword} onDone={onDone} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
        (active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink')
      }
    >
      {children}
    </button>
  );
}

function LoginForm({
  company,
  onDone,
}: {
  company: CompanyHit;
  onDone: (role: 'worker' | 'accountant' | 'owner') => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    let success = false;
    try {
      const { role } = await loginByCompany({
        company_id: company.id,
        email,
        password,
      });
      success = true;
      setHandoff(true);
      onDone(role);
    } catch (err) {
      if (err instanceof CompanyAuthError && err.reason === 'invalid_credentials') {
        setError(sw.find.loginInvalid);
      } else if (err instanceof CompanyAuthError && err.reason === 'not_company_member') {
        setError(sw.find.loginWrongCompany);
      } else if (err instanceof CompanyAuthError && err.reason === 'deactivated') {
        setError(sw.find.loginDeactivated);
      } else if (err instanceof CompanyAuthError && err.reason === 'user_not_found') {
        setError(sw.find.userNotFound);
      } else {
        setError(err instanceof Error ? err.message : sw.common.error);
      }
    } finally {
      if (!success) setBusy(false);
    }
  }

  if (busy || handoff) {
    return <AuthHandoffCard title="Signing you in" body="Preparing your company workspace." />;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{sw.find.loginHint}</p>
      <Input
        type="email"
        label={sw.find.loginEmail}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <PasswordField
        label={sw.find.loginPassword}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" tint="admin" fullWidth disabled={busy || !email.trim() || !password}>
        {busy ? sw.common.loading : sw.find.loginSubmit}
      </Button>
    </form>
  );
}

function RegisterForm({
  company,
  companyPassword,
  onDone,
}: {
  company: CompanyHit;
  companyPassword: string;
  onDone: (role: 'worker' | 'accountant' | 'owner') => void;
}) {
  type FormFields = {
    full_name: string;
    phone?: string;
    email: string;
    password: string;
    password_confirm: string;
  };
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormFields>({ mode: 'onTouched' });
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const password = watch('password', '');
  const passwordConfirm = watch('password_confirm', '');
  const pwScore = scorePassword(password);
  const strengthLabel =
    pwScore >= 4 ? sw.auth.passwordStrength.strong
    : pwScore >= 3 ? sw.auth.passwordStrength.good
    : pwScore >= 2 ? sw.auth.passwordStrength.fair
    : sw.auth.passwordStrength.weak;

  async function onSubmit(values: FormFields) {
    setError(null);
    if (values.password !== values.password_confirm) {
      setError(sw.auth.passwordMismatch);
      return;
    }
    setBusy(true);
    let success = false;
    try {
      const { role } = await registerByCompany({
        company_id: company.id,
        company_password: companyPassword,
        full_name: values.full_name,
        phone: values.phone,
        email: values.email,
        password: values.password,
      });
      success = true;
      setHandoff(true);
      onDone(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      if (!success) setBusy(false);
    }
  }

  if (busy || handoff) {
    return <AuthHandoffCard title="Creating your account" body="Preparing your company workspace." />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{sw.find.registerHint}</p>
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
        label={sw.auth.personalPassword}
        autoComplete="new-password"
        hint={sw.auth.personalPasswordHint}
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        type="submit"
        tint="admin"
        fullWidth
        disabled={busy || password.length < 8 || password !== passwordConfirm}
      >
        {busy ? sw.common.loading : sw.find.registerSubmit}
      </Button>
    </form>
  );
}

function AuthHandoffCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-role-admin/10 text-role-admin">
        <Loader2 className="h-5 w-5 animate-spin" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-sm text-ink-muted">{body}</span>
      </span>
    </Card>
  );
}
