-- Supabase hosts pgcrypto in the extensions schema. These security-definer
-- functions previously searched only public, so crypt/gen_salt failed during signup.
create extension if not exists pgcrypto with schema extensions;

alter function public.verify_company_password(uuid, text)
  set search_path = public, extensions;

alter function public.set_company_password(text)
  set search_path = public, extensions;

alter function public.set_company_password_v1(text)
  set search_path = public, extensions;

alter function public.join_company_by_password_v1(uuid, uuid, text, text, text)
  set search_path = public, extensions;

alter function public.signup_company_v1(uuid, text, text, text, text, text, text)
  set search_path = public, extensions;
