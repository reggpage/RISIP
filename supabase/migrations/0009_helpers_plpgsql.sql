-- Rewrite the three RLS helpers as plpgsql SECURITY DEFINER with `row_security = off`.
-- plpgsql prevents any planner inlining that could accidentally strip SECURITY DEFINER
-- semantics; the row_security setting is belt-and-braces since the owner (postgres) has
-- BYPASSRLS anyway.

create or replace function private.auth_company_id() returns uuid
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare v uuid;
begin
  select company_id into v from profiles where id = auth.uid();
  return v;
end;
$$;

create or replace function private.auth_role() returns user_role
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare v user_role;
begin
  select role into v from profiles where id = auth.uid();
  return v;
end;
$$;

create or replace function private.auth_can_see_project(pid uuid) returns boolean
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare r user_role; cid uuid;
begin
  select role, company_id into r, cid from profiles where id = auth.uid();
  if r in ('owner','accountant') then
    return exists (select 1 from projects where id = pid and company_id = cid);
  elsif r = 'worker' then
    return exists (select 1 from project_members where project_id = pid and profile_id = auth.uid());
  else
    return false;
  end if;
end;
$$;

grant execute on function private.auth_company_id()          to authenticated;
grant execute on function private.auth_role()                to authenticated;
grant execute on function private.auth_can_see_project(uuid) to authenticated;
