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

// ── TEMP DEV PREVIEW ────────────────────────────────────────────────────
// Lets you open the installed app straight into the signed-in owner UI
// without going through WhatsApp. Cosmetic only: RLS still treats the
// webview as anonymous, so screens backed by real data render empty.
// Flip DEV_PREVIEW back to `true` to restore WhatsApp-only auth.
export const DEV_PREVIEW = false;
const DEV_PREVIEW_OWNER: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  company_id: '00000000-0000-4000-8000-000000000002',
  full_name: 'Mmiliki Preview',
  phone: '255700000000',
  role: 'owner',
};
// ── end TEMP DEV PREVIEW ────────────────────────────────────────────────

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

  // TEMP DEV PREVIEW: pretend to be a signed-in owner so the app's UI can be
  // walked through without WhatsApp. Remove with the DEV_PREVIEW flag above.
  if (!session && DEV_PREVIEW) {
    publish({
      status: 'signed-in',
      session: {
        access_token: 'dev-preview',
        refresh_token: 'dev-preview',
        expires_in: 3600,
        expires_at: 0,
        token_type: 'bearer',
        user: { id: DEV_PREVIEW_OWNER.id } as Session['user'],
      } as Session,
      profile: DEV_PREVIEW_OWNER,
    });
    return;
  }

  if (!session) {
    lastProfileUserId = null;
    lastProfile = null;
    publish({ status: 'signed-out' });
    return;
  }

  // A newly completed signup can create the profile after the auth session was
  // first hydrated. Re-query when the cached profile is still null so the app
  // does not keep treating a completed signup as an unlinked account.
  if (lastProfileUserId === session.user.id && lastProfile) {
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
