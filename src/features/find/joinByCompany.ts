import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/db';

export class CompanyAuthError extends Error {
  reason:
    | 'invalid_password'
    | 'password_not_set'
    | 'user_not_found'
    | 'already_exists'
    | 'invalid_credentials'
    | 'not_company_member'
    | 'deactivated'
    | 'email_verification_required'
    | 'unknown';
  constructor(message: string, reason: CompanyAuthError['reason']) {
    super(message);
    this.reason = reason;
  }
}

export class CompanyEmailVerificationRequiredError extends CompanyAuthError {
  constructor(public readonly email: string) {
    super('Check your inbox for the verification code.', 'email_verification_required');
  }
}

function classify(msg: string): CompanyAuthError['reason'] {
  const m = msg.toLowerCase();
  if (m.includes('invalid_company_password') || m.includes('invalid password')) return 'invalid_password';
  if (m.includes('company_password_not_set')) return 'password_not_set';
  if (m.includes('user_not_found')) return 'user_not_found';
  if (m.includes('already exists') || m.includes('already registered')) return 'already_exists';
  if (m.includes('invalid login credentials')) return 'invalid_credentials';
  return 'unknown';
}

async function bodyErrorMessage(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      return body?.error ?? err.message;
    } catch {
      return err.message;
    }
  }
  return err instanceof Error ? err.message : 'unknown error';
}

// Quick password check without side effects — used to decide which pane to show next.
export async function checkCompanyPassword(companyId: string, password: string): Promise<boolean> {
  if (!password.trim()) return false;
  const { data, error } = await supabase.rpc('verify_company_password', {
    p_company_id: companyId,
    p_password: password,
  });
  if (error) throw error;
  return Boolean(data);
}

// Existing staff: company access password opens the company pane; personal
// email/password is still the only way to create a real user session.
export async function loginByCompany(input: {
  company_id: string;
  email: string;
  password: string;
}): Promise<{ role: UserRole }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) {
    throw new CompanyAuthError(error.message, classify(error.message));
  }

  const userId = data.user?.id;
  if (!userId) throw new CompanyAuthError('user_not_found', 'user_not_found');

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('company_id, role, deactivated_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr || !profile) {
    await supabase.auth.signOut();
    throw new CompanyAuthError(profileErr?.message ?? 'user_not_found', 'user_not_found');
  }
  if (profile.company_id !== input.company_id) {
    await supabase.auth.signOut();
    throw new CompanyAuthError('not_company_member', 'not_company_member');
  }
  if (profile.deactivated_at) {
    await supabase.auth.signOut();
    throw new CompanyAuthError('deactivated', 'deactivated');
  }

  return { role: profile.role };
}

// New staff: create auth user with their personal password, then join-company edge fn
// verifies the shared password and creates the profile.
export async function registerByCompany(input: {
  company_id: string;
  company_password: string;
  full_name: string;
  phone?: string;
  email: string;
  password: string;
}): Promise<{ role: UserRole }> {
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name } },
  });
  if (signUpErr) {
    const message = signUpErr.message.toLowerCase();
    if (message.includes('already registered') || message.includes('already exists')) {
      throw new CompanyAuthError(
        'This email is already registered. Switch to “I already have an account” and log in instead.',
        'already_exists',
      );
    }
    throw new CompanyAuthError(signUpErr.message, 'unknown');
  }
  if (!signUpData.session) {
    // A confirmed account belongs in the sign-in tab. An unconfirmed account
    // (including a just-created one) must stay in this flow and receive an OTP.
    if (signUpData.user?.email_confirmed_at) {
      throw new CompanyAuthError(
        'This email is already registered. Switch to “I already have an account” and log in instead.',
        'already_exists',
      );
    }
    throw new CompanyEmailVerificationRequiredError(input.email);
  }

  return finishCompanyRegistration(input);
}

export async function verifyCompanySignupOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'signup',
  });
  if (error) throw error;
}

export async function resendCompanySignupOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function finishCompanyRegistration(input: {
  company_id: string;
  company_password: string;
  full_name: string;
  phone?: string;
}): Promise<{ role: UserRole }> {
  const { data, error } = await supabase.functions.invoke<{ role: UserRole }>('join-company', {
    body: {
      company_id: input.company_id,
      company_password: input.company_password,
      full_name: input.full_name,
      phone: input.phone,
    },
  });
  if (error) {
    const msg = await bodyErrorMessage(error);
    throw new CompanyAuthError(msg, classify(msg));
  }
  return { role: data?.role ?? 'worker' };
}
