import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { UserRole } from './roles';

export type Profile = {
  id: string;
  company_id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; profile: Profile | null };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function hydrate(session: Session | null) {
      if (!session) {
        if (!cancelled) setState({ status: 'signed-out' });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, company_id, full_name, phone, role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) setState({ status: 'signed-in', session, profile: profile ?? null });
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => hydrate(session));

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}
