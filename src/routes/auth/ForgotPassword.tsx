import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordField from '@/components/ui/PasswordField';
import OtpInput, { OTP_LENGTH } from '@/components/ui/OtpInput';
import { supabase } from '@/lib/supabase';

const CODE_TTL = 600; // 10 minutes — display countdown for the recovery code.

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'verify' | 'password'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const codeReady = code.trim().length === OTP_LENGTH;
  const expired = step !== 'request' && secondsLeft === 0;

  useEffect(() => {
    if (step !== 'verify' || secondsLeft <= 0) return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [step, secondsLeft]);

  function mmss(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function sendCode() {
    if (!email.trim()) { setError('Enter your email.'); return false; }
    setBusy(true); setError(null);
    const { error: reqErr } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (reqErr) { setError(reqErr.message); return false; }
    setSecondsLeft(CODE_TTL);
    setInfo(`We've sent an ${OTP_LENGTH}-digit code to your email.`);
    return true;
  }

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (await sendCode()) setStep('verify');
  }

  async function resend() {
    setCode(''); setPassword(''); setConfirm('');
    if (await sendCode()) setStep('verify');
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    if (!codeReady) { setError(`Enter the ${OTP_LENGTH}-digit code.`); return; }
    if (expired) { setError('Code expired. Please resend code.'); return; }
    setBusy(true); setError(null);
    const { error: vErr } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    setBusy(false);
    if (vErr) { setError(vErr.message); return; }
    setInfo(null);
    setStep('password');
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (step !== 'password') { setError(`Confirm the ${OTP_LENGTH}-digit code first.`); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (uErr) { setError(uErr.message); return; }
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {step === 'request'
            ? "Enter your email and we'll send you a code."
            : step === 'verify'
              ? `Enter the ${OTP_LENGTH}-digit code sent to your email.`
              : 'Choose a strong password for your account.'}
        </p>
      </div>

      {step === 'request' ? (
        <form onSubmit={requestCode} className="flex flex-col gap-4">
          <Input type="email" label="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" tint="admin" fullWidth disabled={busy}>{busy ? 'Sending…' : 'Send code'}</Button>
        </form>
      ) : step === 'verify' ? (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          {info && <p className="text-sm text-emerald-700">{info}</p>}

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label className="text-sm font-medium text-ink">Code ({OTP_LENGTH} digits)</label>
              <span className={`text-xs font-medium ${expired ? 'text-red-600' : 'text-ink-muted'}`}>
                {expired ? 'Code expired' : `Expires in ${mmss(secondsLeft)}`}
              </span>
            </div>
            <OtpInput
              value={code}
              onChange={(next) => {
                setCode(next.slice(0, OTP_LENGTH));
                if (error) setError(null);
              }}
              disabled={busy}
              error={!!error}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" tint="admin" fullWidth disabled={busy || !codeReady || expired}>
            {busy ? 'Confirming…' : 'Confirm code'}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => void resend()} disabled={busy}
              className="font-medium text-ink-muted hover:text-ink disabled:opacity-50">
              Resend code
            </button>
            <Link to="/login" className="font-medium text-role-admin hover:underline">Back to login</Link>
          </div>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="flex flex-col gap-4">
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters"
          />
          <PasswordField
            label="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirm.length > 0 && password !== confirm ? 'Passwords do not match' : undefined}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" tint="admin" fullWidth disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>

          <div className="text-center text-sm">
            <Link to="/login" className="font-medium text-role-admin hover:underline">Back to login</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
