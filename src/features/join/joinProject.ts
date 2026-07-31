import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/db';

// Join flow (no OTP): the invite token IS the authorization.
// 1. Create the auth user with the password they chose (signUp returns a session
//    immediately if "Confirm email" is OFF in Supabase Auth settings).
// 2. Call join-project — service-role RPC validates the token and creates
//    the profile + (for workers) project_members row atomically.
export async function joinWithPassword(input: {
  token: string;
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
  if (signUpErr) throw signUpErr;
  if (!signUpData.session) {
    throw new Error(
      'Session haijarudi — hakikisha "Confirm email" imezimwa kwenye Supabase Auth.',
    );
  }

  const { data, error } = await supabase.functions.invoke<{ project_id: string; role: UserRole }>(
    'join-project',
    {
      body: {
        token: input.token,
        full_name: input.full_name,
        phone: input.phone,
      },
    },
  );
  if (error) throw error;
  if (!data?.project_id) throw new Error('join-project returned no project_id');
  return data;
}
