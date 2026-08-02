-- ── Project-scoped Team Leader role ──────────────────────────────────────────
-- A company member can lead project A and be a plain uploader on project B. Only the
-- owner appoints leaders. Leaders allocate petty cash to their project's members within
-- an admin-set project budget, and can invite field staff (workers).

alter table project_members
  add column if not exists role text not null default 'member'
  check (role in ('member', 'leader'));

alter table projects
  add column if not exists petty_cash_budget numeric(14,2) not null default 0;

alter table petty_cash_transactions
  add column if not exists project_id uuid references projects(id) on delete set null;

-- Helpers (SECURITY DEFINER, row_security off to avoid recursion on project_members).
create or replace function private.is_project_leader(pid uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from project_members pm
    where pm.project_id = pid and pm.profile_id = auth.uid() and pm.role = 'leader');
$$;
revoke all on function private.is_project_leader(uuid) from public, anon;
grant execute on function private.is_project_leader(uuid) to authenticated, service_role;

create or replace function private.leads_petty_user(target_uid uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from project_members l
    join project_members m on m.project_id = l.project_id
    where l.profile_id = auth.uid() and l.role = 'leader' and m.profile_id = target_uid);
$$;
revoke all on function private.leads_petty_user(uuid) from public, anon;
grant execute on function private.leads_petty_user(uuid) to authenticated, service_role;

-- Owner appoints leaders (UPDATE project_members.role).
create policy project_members_update_owner on project_members
  for update to authenticated
  using (private.auth_role() = 'owner' and exists (
    select 1 from projects p where p.id = project_members.project_id and p.company_id = private.auth_company_id()))
  with check (private.auth_role() = 'owner' and exists (
    select 1 from projects p where p.id = project_members.project_id and p.company_id = private.auth_company_id()));

-- Leaders manage worker invite links for their led projects.
create policy invite_links_select_leader on invite_links
  for select to authenticated using (private.is_project_leader(project_id));
create policy invite_links_insert_leader on invite_links
  for insert to authenticated
  with check (private.is_project_leader(project_id) and role = 'worker' and created_by = auth.uid());
create policy invite_links_update_leader on invite_links
  for update to authenticated
  using (private.is_project_leader(project_id))
  with check (private.is_project_leader(project_id));

-- Leaders can view their project members' petty cash + their project allocations.
create policy petty_cash_accounts_leader_select on petty_cash_accounts
  for select to authenticated using (private.leads_petty_user(user_id));
create policy petty_cash_txn_leader_select on petty_cash_transactions
  for select to authenticated
  using (project_id is not null and private.is_project_leader(project_id));

-- Allocate petty cash: leader (capped by project budget) or owner (uncapped).
create or replace function allocate_project_petty_cash(
  p_project uuid, p_user uuid, p_amount numeric, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_budget numeric; v_allocated numeric;
  v_is_owner boolean; v_is_leader boolean; v_account uuid; v_txn uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  v_is_owner := (private.auth_role() = 'owner');
  select exists (select 1 from project_members where project_id = p_project
                 and profile_id = auth.uid() and role = 'leader') into v_is_leader;
  if not (v_is_owner or v_is_leader) then raise exception 'not authorized for this project'; end if;
  select company_id, petty_cash_budget into v_company, v_budget from projects where id = p_project;
  if v_company is null or v_company <> private.auth_company_id() then
    raise exception 'project not in your company'; end if;
  if not exists (select 1 from project_members where project_id = p_project and profile_id = p_user) then
    raise exception 'user is not a member of this project'; end if;
  select coalesce(sum(amount), 0) into v_allocated
    from petty_cash_transactions where project_id = p_project and type = 'allocation';
  if not v_is_owner and (v_allocated + p_amount) > v_budget then
    raise exception 'exceeds project budget (allocated % of %)', v_allocated, v_budget; end if;
  select id into v_account from petty_cash_accounts where user_id = p_user;
  if v_account is null then
    insert into petty_cash_accounts (user_id, company_id) values (p_user, v_company) returning id into v_account;
  end if;
  insert into petty_cash_transactions (account_id, amount, type, project_id, description, created_by)
  values (v_account, p_amount, 'allocation', p_project, coalesce(p_description, 'Project allocation'), auth.uid())
  returning id into v_txn;
  return v_txn;
end;
$$;
grant execute on function allocate_project_petty_cash(uuid, uuid, numeric, text) to authenticated;
