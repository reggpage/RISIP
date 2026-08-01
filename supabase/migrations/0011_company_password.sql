-- companies.password_hash + search + join-by-password + owner setter.
-- Adds a per-company shared password so staff can find their company and self-register
-- without needing an invite link. The password is stored as bcrypt (pgcrypto).

create extension if not exists pgcrypto;

alter table companies add column if not exists password_hash text;

-- Public search — returns only id + name.
create or replace function search_companies(q text) returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from companies
  where name ilike '%' || q || '%'
  order by name
  limit 20;
$$;
revoke all on function search_companies(text) from public;
grant execute on function search_companies(text) to anon, authenticated;

create or replace function verify_company_password(p_company_id uuid, p_password text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare hash text;
begin
  select password_hash into hash from companies where id = p_company_id;
  if hash is null then return false; end if;
  return hash = crypt(p_password, hash);
end;
$$;
revoke all on function verify_company_password(uuid, text) from public;
grant execute on function verify_company_password(uuid, text) to anon, authenticated;

create or replace function set_company_password_v1(p_password text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid; r user_role;
begin
  select company_id, role into cid, r from profiles where id = auth.uid();
  if cid is null then raise exception 'no profile'; end if;
  if r <> 'owner' then raise exception 'only owner can set company password'; end if;
  if coalesce(trim(p_password),'') = '' then raise exception 'password required'; end if;
  update companies set password_hash = crypt(p_password, gen_salt('bf')) where id = cid;
end;
$$;
revoke all on function set_company_password_v1(text) from public;
grant execute on function set_company_password_v1(text) to authenticated;

-- Signup now requires company_password so search-based join works from day one.
drop function if exists signup_company_v1(uuid, text, text, text, text, text);
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
declare new_company_id uuid;
begin
  if p_user_id is null then raise exception 'user_id required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'user_id does not exist in auth.users'; end if;
  if exists (select 1 from profiles where id = p_user_id) then raise exception 'profile already exists for this user'; end if;
  if coalesce(trim(p_company_name),'') = '' or coalesce(trim(p_hq_location),'') = '' then raise exception 'company_name and hq_location are required'; end if;
  if coalesce(trim(p_full_name),'') = '' then raise exception 'full_name is required'; end if;
  if coalesce(trim(p_company_password),'') = '' then raise exception 'company_password is required'; end if;

  insert into companies (name, hq_location, sector, password_hash)
  values (
    trim(p_company_name), trim(p_hq_location),
    nullif(trim(p_sector), ''),
    crypt(trim(p_company_password), gen_salt('bf'))
  )
  returning id into new_company_id;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, new_company_id, trim(p_full_name), nullif(trim(p_phone),''), 'owner');

  return new_company_id;
end;
$$;
revoke all on function signup_company_v1(uuid,text,text,text,text,text,text) from public, authenticated, anon;
grant execute on function signup_company_v1(uuid,text,text,text,text,text,text) to service_role;

create or replace function join_company_by_password_v1(
  p_user_id uuid, p_company_id uuid, p_password text,
  p_full_name text, p_phone text
) returns user_role
language plpgsql security definer set search_path = public as $$
declare hash text;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'user not found'; end if;
  if exists (select 1 from profiles where id = p_user_id) then raise exception 'profile already exists'; end if;
  if coalesce(trim(p_full_name),'') = '' then raise exception 'full_name required'; end if;

  select password_hash into hash from companies where id = p_company_id;
  if hash is null then raise exception 'company_password_not_set'; end if;
  if hash <> crypt(p_password, hash) then raise exception 'invalid_company_password'; end if;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, p_company_id, trim(p_full_name), nullif(trim(p_phone),''), 'worker');

  return 'worker'::user_role;
end;
$$;
revoke all on function join_company_by_password_v1(uuid,uuid,text,text,text) from public, authenticated, anon;
grant execute on function join_company_by_password_v1(uuid,uuid,text,text,text) to service_role;

-- Used by login-by-company edge fn to look up a profile's email by name.
create or replace function find_profile_by_name_in_company_v1(p_company_id uuid, p_full_name text)
returns table(profile_id uuid, email text, role user_role)
language sql stable security definer set search_path = public as $$
  select p.id, u.email, p.role
  from profiles p
  join auth.users u on u.id = p.id
  where p.company_id = p_company_id
    and lower(p.full_name) = lower(trim(p_full_name))
    and p.deactivated_at is null
  limit 1
$$;
revoke all on function find_profile_by_name_in_company_v1(uuid, text) from public, authenticated, anon;
grant execute on function find_profile_by_name_in_company_v1(uuid, text) to service_role;
