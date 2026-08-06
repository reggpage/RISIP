-- Keep company registration on the current contract:
-- personal password lives in Supabase Auth, company access password lives on companies.
-- This also preserves the friendly scanner inbox token added by 0016.

create extension if not exists pgcrypto;
create schema if not exists private;

drop function if exists signup_company_v1(uuid, text, text, text, text, text);
drop function if exists signup_company_v1(uuid, text, text, text, text, text, text);

create or replace function signup_company_v1(
  p_user_id       uuid,
  p_full_name     text,
  p_phone         text,
  p_company_name  text,
  p_hq_location   text,
  p_sector        text,
  p_company_password text
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
  if coalesce(trim(p_company_password), '') = '' then
    raise exception 'company_password is required';
  end if;

  insert into companies (name, hq_location, sector, password_hash, scanner_inbox_token)
  values (
    trim(p_company_name),
    trim(p_hq_location),
    nullif(trim(p_sector), ''),
    crypt(trim(p_company_password), gen_salt('bf')),
    private.gen_scanner_token(trim(p_company_name))
  )
  returning id into new_company_id;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, new_company_id, trim(p_full_name), nullif(trim(p_phone), ''), 'owner');

  return new_company_id;
end;
$$;

revoke all on function signup_company_v1(uuid, text, text, text, text, text, text) from public, authenticated, anon;
grant execute on function signup_company_v1(uuid, text, text, text, text, text, text) to service_role;
