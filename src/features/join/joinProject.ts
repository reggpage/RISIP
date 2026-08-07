import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/db';

export class EmailVerificationRequiredError extends Error {
  constructor(public readonly email: string) {
    super('Email verification is required before joining this project.');
  }
}

// Join flow (no OTP): the invite token IS the authorization.
// 1. Create the auth user with the password they chose (signUp returns a session
//    immediately if "Confirm email" is OFF in Supabase Auth settings).
// 2. Call join-project — service-role RPC validates the token and creates
//    the profile + (for workers) project_members row atomically.
export async function joinWithPassword(input: {
  token: string;
  company_password: string;
  full_name: string;
  phone?: string;
  email: string;
  password: string;
}): Promise<{ project_id: string; role: UserRole }> {
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name } },
  });
  if (signUpErr) {
    const message = signUpErr.message.toLowerCase();
    if (message.includes('already registered') || message.includes('already exists')) {
      throw new Error('This email is already registered. Choose “I already have an account” and log in instead.');
    }
    throw signUpErr;
  }
  if (!signUpData.session) {
    if (signUpData.user?.identities?.length === 0) {
      throw new Error('This email is already registered. Choose “I already have an account” and log in instead.');
    }
    throw new EmailVerificationRequiredError(input.email);
  }

  return joinVerifiedWithInvite({
    token: input.token,
    company_password: input.company_password,
    full_name: input.full_name,
    phone: input.phone,
  });
}

export async function verifyInviteSignupOtp(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'signup',
  });
  if (error) throw error;
}

export async function resendInviteSignupOtp(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
  });
  if (error) throw error;
}

export async function joinVerifiedWithInvite(input: {
  token: string;
  company_password: string;
  full_name: string;
  phone?: string;
}): Promise<{ project_id: string; role: UserRole }> {
  const { data, error } = await supabase.functions.invoke<{ project_id: string; role: UserRole }>(
    'join-project',
    {
      body: {
        token: input.token,
        company_password: input.company_password,
        full_name: input.full_name,
        phone: input.phone,
      },
    },
  );
  if (error) throw await readableFunctionError(error);
  if (!data?.project_id) throw new Error('join-project returned no project_id');
  return data;
}

export async function joinExistingWithInvite(input: {
  token: string;
  company_password: string;
  email: string;
  password: string;
}): Promise<{ project_id: string; role: UserRole }> {
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (signInErr) throw signInErr;

  const { data, error } = await supabase.functions.invoke<{ project_id: string; role: UserRole }>(
    'join-project',
    {
      body: {
        token: input.token,
        company_password: input.company_password,
      },
    },
  );
  if (error) throw await readableFunctionError(error);
  if (!data?.project_id) throw new Error('join-project returned no project_id');
  return data;
}

async function readableFunctionError(error: unknown): Promise<Error> {
  const message = error instanceof Error ? error.message : 'Could not join project';
  const context = error && typeof error === 'object'
    ? (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } }).context
    : null;
  const payload = await context?.json?.().catch(() => null);
  const code = payload?.error ?? payload?.message ?? message;

  const friendly: Record<string, string> = {
    company_password_not_set: 'Company password is not set yet. Ask the admin to set it in Settings.',
    invalid_company_password: 'Invalid company password.',
    'token required': 'Invite token is missing.',
    'company_password required': 'Company password is required.',
    'missing bearer token': 'Please log in again before joining this project.',
    'invalid session': 'Your login session expired. Please log in again.',
    'account belongs to another company': 'This email already belongs to another company.',
  };

  return new Error(friendly[code] ?? code);
}
