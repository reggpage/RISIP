import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export type CompanyDetails = {
  full_name: string;
  phone?: string;
  email: string;
  company_name: string;
  hq_location: string;
  sector?: string;
  company_password: string;
};

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

// Step 1 -> create a pending auth user with their personal password, then send OTP.
// The Send Email Auth hook brands the email before it leaves Supabase.
export async function startCompanySignup(email: string, fullName: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email: cleanEmail(email),
    password,
    options: {
      data: { full_name: fullName },
    },
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already registered') || message.includes('already exists')) {
      throw new Error('This email is already registered. Log in instead or use a different email address.');
    }
    if (error.status === 429) {
      throw new Error('Too many signup attempts. Please wait a few minutes before trying again.');
    }
    throw error;
  }
}

export async function resendSignupOtp(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail(email) });
  if (error) throw error;
}

// Step 2 -> verify the OTP. On success we have a session for the pending user.
export async function verifySignupOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail(email),
    token: token.trim(),
    type: 'signup',
  });
  if (error) throw error;
  if (!data.session) throw new Error('Verification did not return a session.');
  return data.session;
}

// Step 3 -> create the company + owner profile after the email is verified.
export async function createCompanyAfterVerification(
  details: Omit<CompanyDetails, 'email'>,
  accessToken?: string,
): Promise<{ company_id: string }> {
  const { data, error } = await supabase.functions.invoke<{ company_id: string }>('signup-company', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      full_name: details.full_name,
      phone: details.phone,
      company_name: details.company_name,
      hq_location: details.hq_location,
      sector: details.sector,
      company_password: details.company_password,
    },
  });
  if (error) throw await readableFunctionError(error);
  if (!data?.company_id) throw new Error('signup-company returned no company_id');
  return data;
}

async function readableFunctionError(error: unknown): Promise<Error> {
  const fallback = error instanceof Error ? error.message : 'Could not finish company setup.';
  const context = error && typeof error === 'object'
    ? (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } }).context
    : null;
  const payload = await context?.json?.().catch(() => null);
  const code = payload?.error ?? payload?.message;

  const friendly: Record<string, string> = {
    'profile already exists for this user': 'This account already has a company profile. Please log in.',
    'company_name and hq_location are required': 'Company name and location are required.',
    'company_password is required': 'Company access password is required.',
    'invalid session': 'Your verified session expired. Please start signup again.',
  };

  return new Error(friendly[code ?? ''] ?? code ?? fallback);
}
