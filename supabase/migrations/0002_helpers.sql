-- Risip · helper functions used by RLS policies.
-- security definer + a pinned search_path so callers can't shadow `profiles`.

create or replace function auth_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- True if the current user can see a project:
--   owners/accountants: any project in their company
--   workers:            only projects they're a member of
create or replace function auth_can_see_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth_role() in ('owner', 'accountant') then
      exists (select 1 from projects where id = pid and company_id = auth_company_id())
    when auth_role() = 'worker' then
      exists (select 1 from project_members where project_id = pid and profile_id = auth.uid())
    else false
  end
$$;

revoke all on function auth_company_id()          from public;
revoke all on function auth_role()                from public;
revoke all on function auth_can_see_project(uuid) from public;
grant execute on function auth_company_id()          to authenticated;
grant execute on function auth_role()                to authenticated;
grant execute on function auth_can_see_project(uuid) to authenticated;
