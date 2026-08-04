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

// Step 1 → send an OTP to email. Delivered by the send-email Auth hook (Resend).
export async function sendSignupOtp(email: string, fullName: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { full_name: fullName },
    },
  });
  if (error) throw error;
}

// Step 2 → verify the OTP. On success we have a session (auth.users row exists).
export async function verifySignupOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  if (!data.session) throw new Error('Verification did not return a session.');
  return data.session;
}

// Step 3 → set password and create the company + owner profile atomically.
export async function setPasswordAndCreateCompany(
  password: string,
  details: Omit<CompanyDetails, 'email'>,
): Promise<{ company_id: string }> {
  const { error: pwErr } = await supabase.auth.updateUser({ password });
  if (pwErr) throw pwErr;

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
