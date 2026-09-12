import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { signOut, DEV_PREVIEW } from '@/lib/auth';
import { getLang } from '@/lib/lang';
import { sw } from '@/i18n/sw';
import RisipLogo from '@/components/ui/RisipLogo';
import LegalCheckbox from './LegalCheckbox';
import { LEGAL_VERSION } from '../../../supabase/functions/_shared/risipLegal';
import '@/routes/legal/legal.css';

export default function LegalGate({ children }: { children: ReactNode }) {
  // TEMP DEV PREVIEW: skip the legal gate — as an anonymous preview session the
  // `my_legal_acceptance` RPC can never be satisfied. Remove with DEV_PREVIEW.
  if (DEV_PREVIEW) return <>{children}</>;
  const c = sw.legal;
  const [accepted, setAccepted] = useState(false), [checked, setChecked] = useState(false), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const { data, error } = await (supabase as any).rpc('my_legal_acceptance');
        if (!live) return;
        setAccepted(!error && data?.version === LEGAL_VERSION && data?.accepted === true);
        setError(Boolean(error));
      } catch { if (live) setError(true); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, []);
  async function accept() { if (!checked) return; setSaving(true); setError(false); try { const { data, error } = await (supabase as any).rpc('accept_legal_terms', { p_version: LEGAL_VERSION, p_accept: checked, p_language: getLang() }); if (error || data !== true) throw error; setAccepted(true); } catch { setError(true); } finally { setSaving(false); } }
  if (loading) return <div className="legal-accept" role="status">{c.loading}</div>;
  if (accepted) return <>{children}</>;
  return <main className="legal-accept"><section><Link to="/" className="text-role-admin"><RisipLogo className="w-20" /></Link><h1>{c.acceptTitle}</h1><p>{c.acceptBody}</p><p>{c.version} {LEGAL_VERSION}</p><form onSubmit={(e) => { e.preventDefault(); void accept(); }}><LegalCheckbox checked={checked} onChange={setChecked} />{error && <p role="alert">{c.error}</p>}<button className="mt-7" type="submit" disabled={!checked || saving}>{saving ? c.saving : c.continue}</button></form><button onClick={() => void signOut()}>{c.signout}</button></section></main>;
}
