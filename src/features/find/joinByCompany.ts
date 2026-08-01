import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/db';

export class CompanyAuthError extends Error {
  reason: 'invalid_password' | 'password_not_set' | 'user_not_found' | 'already_exists' | 'unknown';
  constructor(message: string, reason: CompanyAuthError['reason']) {
    super(message);
    this.reason = reason;
  }
}

function classify(msg: string): CompanyAuthError['reason'] {
  const m = msg.toLowerCase();
  if (m.includes('invalid_company_password') || m.includes('invalid password')) return 'invalid_password';
  if (m.includes('company_password_not_set')) return 'password_not_set';
  if (m.includes('user_not_found')) return 'user_not_found';
  if (m.includes('already exists')) return 'already_exists';
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
  const { data, error } = await supabase.rpc('verify_company_password', {
    p_company_id: companyId,
    p_password: password,
  });
  if (error) throw error;
  return Boolean(data);
}

// Existing staff: name + company password → session (via magic-link token).
export async function loginByCompany(input: {
  company_id: string;
  name: string;
  company_password: string;
}): Promise<{ role: UserRole }> {
  const { data, error } = await supabase.functions.invoke<{
    token_hash: string;
    role: UserRole;
    email: string;
  }>('login-by-company', { body: input });
  if (error) {
    const msg = await bodyErrorMessage(error);
    throw new CompanyAuthError(msg, classify(msg));
  }
  if (!data?.token_hash) throw new CompanyAuthError('no token', 'unknown');

  // Materialize the session in this browser.
  const { error: vErr } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: 'magiclink',
  });
  if (vErr) throw new CompanyAuthError(vErr.message, 'unknown');
  return { role: data.role };
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
  if (signUpErr) throw new CompanyAuthError(signUpErr.message, 'unknown');
  if (!signUpData.session) {
    throw new CompanyAuthError(
      'Session missing — make sure "Confirm email" is OFF in Supabase Auth.',
      'unknown',
    );
  }

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
