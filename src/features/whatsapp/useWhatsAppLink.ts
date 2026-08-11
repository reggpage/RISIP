import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Connect/revoke the signed-in employee's WhatsApp number.
//
// The token is minted server-side, returned in plaintext exactly once, and only
// ever stored as a hash. We put it straight into a wa.me deep link and never
// persist it in the browser.

export type WhatsAppIdentity = {
  id: string;
  phone_e164: string;
  verified_at: string;
};

/** Digits only — wa.me rejects a leading '+'. */
const RISIP_WHATSAPP_NUMBER = (import.meta.env.VITE_RISIP_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');

export function useWhatsAppLink() {
  const [identity, setIdentity] = useState<WhatsAppIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    // RLS limits this to the caller's own row.
    const { data, error: err } = await supabase
      .from('whatsapp_identities')
      .select('id, phone_e164, verified_at')
      .is('revoked_at', null)
      .maybeSingle();
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setIdentity((data as WhatsAppIdentity | null) ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { identity, loading, error, refresh, configured: RISIP_WHATSAPP_NUMBER.length > 0 };
}

/**
 * Mint a one-time token and build the wa.me link that carries it. The user sends
 * the prefilled "LINK <token>" message, which proves they control the number.
 */
export async function createWhatsAppLinkUrl(): Promise<string> {
  if (!RISIP_WHATSAPP_NUMBER) throw new Error('Risip WhatsApp number is not configured yet.');
  const { data, error } = await supabase.rpc('create_whatsapp_link_token');
  if (error) throw error;
  const token = String(data ?? '');
  if (!token) throw new Error('Could not create a link code.');
  return `https://wa.me/${RISIP_WHATSAPP_NUMBER}?text=${encodeURIComponent(`LINK ${token}`)}`;
}

export async function revokeWhatsApp(): Promise<number> {
  const { data, error } = await supabase.rpc('revoke_whatsapp_identity');
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Display helper: +255754123456 → +255*******456. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  if (e164.length <= 7) return '***';
  return `${e164.slice(0, 4)}${'*'.repeat(Math.max(0, e164.length - 7))}${e164.slice(-3)}`;
}
