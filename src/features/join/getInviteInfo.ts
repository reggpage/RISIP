import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/db';

export type InviteInfo = {
  project_id: string | null;
  project_name: string | null;
  company_id: string | null;
  company_name: string | null;
  role: UserRole | null;
  is_valid: boolean;
  reason: 'not_found' | 'revoked' | 'expired' | 'project_inactive' | null;
};

export function useInviteInfo(token: string | undefined) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; info: InviteInfo } | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_invite_info', { p_token: token });
      if (cancelled) return;
      if (error) {
        setState({ status: 'error', message: error.message });
        return;
      }
      // rpc returning table → array; take the first row.
      const row = Array.isArray(data) ? data[0] : data;
      setState({ status: 'ready', info: (row ?? null) as InviteInfo });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
