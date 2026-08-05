-- Small-business default: anyone in a company sees all its projects.
-- project_members stays for future per-project assignments (e.g. task ownership),
-- but stops gating visibility — staff who join via the company password (no member
-- rows) can now see the admin's projects.

drop policy if exists projects_select_visible on projects;
create policy projects_select_visible on projects
  for select to authenticated
  using (company_id = private.auth_company_id());

-- Mirror change in the helper used by receipts + storage RLS.
create or replace function private.auth_can_see_project(pid uuid) returns boolean
language plpgsql stable security definer
set search_path = public, extensions
set row_security = off
as $$
declare cid uuid;
begin
  select company_id into cid from profiles where id = auth.uid();
  if cid is null then return false; end if;
  return exists (select 1 from projects where id = pid and company_id = cid);
end;
$$;
grant execute on function private.auth_can_see_project(uuid) to authenticated;
