import { supabase } from '@/lib/supabase';

export type CompanyDetails = {
  full_name: string;
  phone?: string;
  email: string;
  company_name: string;
  hq_location: string;
  sector?: string;
  company_password: string;
};

// Step 1 -> create a pending auth user with their personal password, then send OTP.
// The Send Email Auth hook brands the email before it leaves Supabase.
export async function startCompanySignup(email: string, fullName: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });
  if (error) throw error;
}

export async function resendSignupOtp(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

// Step 2 -> verify the OTP. On success we have a session for the pending user.
export async function verifySignupOtp(email: string, token: string) {
  const first = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  let data = first.data;
  let error = first.error;

  // During the signup-flow changeover, some emails may still have tokens created
  // by signInWithOtp. Accept those too so users do not get trapped mid-signup.
  if (error) {
    const fallback = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  if (!data.session) throw new Error('Verification did not return a session.');
  return data.session;
}

// Step 3 -> create the company + owner profile after the email is verified.
export async function createCompanyAfterVerification(
  details: Omit<CompanyDetails, 'email'>,
): Promise<{ company_id: string }> {
  const { data, error } = await supabase.functions.invoke<{ company_id: string }>('signup-company', {
    body: {
      full_name: details.full_name,
      phone: details.phone,
      company_name: details.company_name,
      hq_location: details.hq_location,
      sector: details.sector,
      company_password: details.company_password,
    },
  });
  if (error) throw error;
  if (!data?.company_id) throw new Error('signup-company returned no company_id');
  return data;
}
