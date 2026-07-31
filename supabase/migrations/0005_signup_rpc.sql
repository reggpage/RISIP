-- Risip · atomic company signup RPC.
-- Called by the signup-company edge function AFTER supabase.auth.signUp on the client has
-- produced an auth.users row. We insert the company + owner profile in one transaction.
--
-- security definer so it can bypass RLS on companies/profiles at signup time.
-- Refuses to run if the passed user_id already has a profile (idempotent guard).

create or replace function signup_company_v1(
  p_user_id       uuid,
  p_full_name     text,
  p_phone         text,
  p_company_name  text,
  p_hq_location   text,
  p_sector        text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_company_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_id does not exist in auth.users';
  end if;
  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'profile already exists for this user';
  end if;
  if coalesce(trim(p_company_name), '') = '' or coalesce(trim(p_hq_location), '') = '' then
    raise exception 'company_name and hq_location are required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name is required';
  end if;

  insert into companies (name, hq_location, sector)
  values (trim(p_company_name), trim(p_hq_location), nullif(trim(p_sector), ''))
  returning id into new_company_id;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, new_company_id, trim(p_full_name), nullif(trim(p_phone), ''), 'owner');

  return new_company_id;
end;
$$;

-- Only the service_role (edge function) may call this. The client must never call it directly
-- because it trusts p_user_id — the edge function derives that from the caller's JWT.
revoke all on function signup_company_v1(uuid, text, text, text, text, text) from public, authenticated, anon;
grant execute on function signup_company_v1(uuid, text, text, text, text, text) to service_role;
