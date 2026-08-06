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

let sharedState: AuthState = { status: 'loading' };
const listeners = new Set<(state: AuthState) => void>();
let booted = false;
let authSubscription: { unsubscribe: () => void } | null = null;
let hydrateRun = 0;
let lastProfileUserId: string | null = null;
let lastProfile: Profile | null = null;
const PROFILE_TIMEOUT_MS = 8_000;

function publish(next: AuthState) {
  sharedState = next;
  for (const listener of listeners) listener(next);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function hydrate(session: Session | null) {
  const run = ++hydrateRun;
  if (!session) {
    lastProfileUserId = null;
    lastProfile = null;
    publish({ status: 'signed-out' });
    return;
  }

  if (lastProfileUserId === session.user.id) {
    publish({ status: 'signed-in', session, profile: lastProfile });
    return;
  }

  try {
    const { data: profile, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, company_id, full_name, phone, role')
        .eq('id', session.user.id)
        .maybeSingle(),
      PROFILE_TIMEOUT_MS,
      'Profile request timed out. Check your internet or proxy settings.',
    );
    if (run !== hydrateRun) return;
    if (error) throw error;
    lastProfileUserId = session.user.id;
    lastProfile = (profile ?? null) as Profile | null;
    publish({ status: 'signed-in', session, profile: lastProfile });
  } catch (err) {
    if (run !== hydrateRun) return;
    console.warn('Could not load profile; continuing with the auth session only.', err);
    lastProfileUserId = session.user.id;
    lastProfile = null;
    publish({ status: 'signed-in', session, profile: null });
  }
}

function bootAuth() {
  if (booted) return;
  booted = true;
  void supabase.auth
    .getSession()
    .then(({ data }) => hydrate(data.session))
    .catch((err) => {
      console.warn('Could not initialise auth session.', err);
      publish({ status: 'signed-out' });
    });
  const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
    void hydrate(session);
  });
  authSubscription = sub.subscription;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(sharedState);

  useEffect(() => {
    bootAuth();
    listeners.add(setState);
    setState(sharedState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    authSubscription?.unsubscribe();
    authSubscription = null;
    booted = false;
    listeners.clear();
  });
}
