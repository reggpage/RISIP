import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordField from '@/components/ui/PasswordField';
import OtpInput from '@/components/ui/OtpInput';
import { supabase } from '@/lib/supabase';

// Password recovery: request a 6-digit code by email (delivered via the send-email hook),
// then verify it and set a new password.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Weka barua pepe.'); return; }
    setBusy(true); setError(null);
    const { error: reqErr } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (reqErr) { setError(reqErr.message); return; }
    setInfo('Tumekutumia msimbo wa tarakimu 6 kwenye barua pepe yako. (Kagua na Spam.)');
    setStep('reset');
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) { setError('Weka msimbo wa tarakimu 6.'); return; }
    if (password.length < 8) { setError('Nenosiri liwe na herufi 8 au zaidi.'); return; }
    setBusy(true); setError(null);
    const { error: vErr } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (vErr) { setBusy(false); setError(vErr.message); return; }
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (uErr) { setError(uErr.message); return; }
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">Weka nenosiri jipya</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {step === 'request' ? 'Weka barua pepe yako tukutumie msimbo.' : 'Weka msimbo na nenosiri jipya.'}
        </p>
      </div>

      {step === 'request' ? (
        <form onSubmit={requestCode} className="flex flex-col gap-4">
          <Input type="email" label="Barua pepe" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" tint="admin" fullWidth disabled={busy}>{busy ? 'Inatuma…' : 'Nitumie msimbo'}</Button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="flex flex-col gap-4">
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Msimbo (tarakimu 6)</label>
            <OtpInput value={code} onChange={setCode} error={!!error} />
          </div>
          <PasswordField
            label="Nenosiri jipya"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Angalau herufi 8"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" tint="admin" fullWidth disabled={busy}>{busy ? 'Inahifadhi…' : 'Hifadhi nenosiri'}</Button>
          <button type="button" onClick={() => setStep('request')} className="text-center text-sm text-ink-muted hover:text-ink">
            Tuma tena msimbo
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/login" className="font-medium text-role-admin hover:underline">Rudi kuingia</Link>
      </p>
    </AuthShell>
  );
}
