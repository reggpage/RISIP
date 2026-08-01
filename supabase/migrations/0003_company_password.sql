-- Risip · company shared password + public company search
-- Enables the "Find your company" flow: staff search for their company by name,
-- enter the shared password the owner set, then register or log in.

-- ─── password_hash column ──────────────────────────────────────────────────────
alter table companies add column if not exists password_hash text;

-- ─── search_companies(q) ──────────────────────────────────────────────────────
-- Anon-accessible: returns id + name only (no sensitive data).
create or replace function search_companies(q text)
returns table (id uuid, name text)
language sql stable security definer
set search_path = public
as $$
  select id, name
  from companies
  where name ilike '%' || q || '%'
  order by name
  limit 20;
$$;

revoke all on function search_companies(text) from public;
grant execute on function search_companies(text) to anon, authenticated;

-- ─── verify_company_password(p_company_id, p_password) ────────────────────────
-- Returns true when the supplied password matches the stored bcrypt hash.
-- Raises 'company_password_not_set' if the owner hasn't set one yet.
create or replace function verify_company_password(p_company_id uuid, p_password text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from companies where id = p_company_id;
  if v_hash is null then
    raise exception 'company_password_not_set';
  end if;
  return v_hash = crypt(p_password, v_hash);
end;
$$;

revoke all on function verify_company_password(uuid, text) from public;
grant execute on function verify_company_password(uuid, text) to anon, authenticated;

-- ─── set_company_password(p_password) ─────────────────────────────────────────
-- Owner-only: hashes and stores a new shared company password.
create or replace function set_company_password(p_password text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth_role() != 'owner' then
    raise exception 'forbidden';
  end if;
  if length(p_password) < 6 then
    raise exception 'password too short';
  end if;
  update companies
  set password_hash = crypt(p_password, gen_salt('bf'))
  where id = auth_company_id();
end;
$$;

revoke all on function set_company_password(text) from public;
grant execute on function set_company_password(text) to authenticated;
