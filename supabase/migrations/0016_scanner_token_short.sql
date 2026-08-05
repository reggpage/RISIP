-- Replace the long UUID scanner inbox token with a short, human-friendly one:
--   <name-slug>.<4 hex>, e.g. mhandisi.41b6  (fits an email local part, easy to type).

create schema if not exists private;

create or replace function private.gen_scanner_token(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  slug  text;
  token text;
begin
  slug := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g');
  slug := left(slug, 12);
  if slug = '' then slug := 'co'; end if;
  loop
    token := slug || '.' || substr(md5(random()::text), 1, 4);
    exit when not exists (select 1 from companies where scanner_inbox_token = token);
  end loop;
  return token;
end;
$$;
revoke all on function private.gen_scanner_token(text) from public, anon, authenticated;
grant execute on function private.gen_scanner_token(text) to service_role;

-- UUID -> varchar(20), regenerating each existing company's token from its name.
drop index if exists companies_scanner_inbox_token_idx;
alter table companies
  alter column scanner_inbox_token drop default,
  alter column scanner_inbox_token type varchar(20) using private.gen_scanner_token(name);
alter table companies
  alter column scanner_inbox_token set default ('co.' || substr(md5(random()::text), 1, 6));
create unique index companies_scanner_inbox_token_idx on companies(scanner_inbox_token);

-- Signup now stamps the friendly, name-based token on new companies.
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

  insert into companies (name, hq_location, sector, scanner_inbox_token)
  values (
    trim(p_company_name),
    trim(p_hq_location),
    nullif(trim(p_sector), ''),
    private.gen_scanner_token(trim(p_company_name))
  )
  returning id into new_company_id;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, new_company_id, trim(p_full_name), nullif(trim(p_phone), ''), 'owner');

  return new_company_id;
end;
$$;

revoke all on function signup_company_v1(uuid, text, text, text, text, text) from public, authenticated, anon;
grant execute on function signup_company_v1(uuid, text, text, text, text, text) to service_role;
