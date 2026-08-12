-- P0 of the multi-business work: give a person somewhere to belong to more than
-- one company, and somewhere to say which one they are looking at.
--
-- This migration adds structure and copies today's data into it. It changes NO
-- behaviour: private.auth_company_id() and private.auth_role() still read
-- profiles.company_id until 0073 swaps them, and profiles.company_id stays exactly
-- where it is for this whole phase.
--
-- WHY IT IS NEEDED: profiles.id is auth.users.id and profiles.company_id is NOT
-- NULL, so one auth user is one profile is exactly one company. A person cannot
-- own a shop and also work for an engineering firm without two accounts and two
-- email addresses.
--
-- WHAT IT DOES NOT DO: nothing here touches receipts, petty cash, reversal,
-- reimbursements, retirements, supplier claims or any flag.
--
-- MEASURED BEFORE APPLYING (all five stop checks):
--     profiles: 6 · null company_id: 0 · null role: 0
--     duplicate profile ids: 0 · duplicate (profile, company): 0
--     orphan company_id: 0 · orphan auth user: 0
-- and, in a rolled-back transaction carrying the full 0072+0073 candidate, both
-- helpers returned an identical company and role for all 6 existing users.
--
-- ROLLBACK (nothing depends on these objects until 0073)
--   alter table profiles drop column active_company_id;
--   drop table company_members;

create table if not exists company_members (
  profile_id     uuid not null references profiles(id) on delete cascade,
  company_id     uuid not null references companies(id) on delete cascade,
  role           user_role not null,
  joined_at      timestamptz not null default now(),
  -- Set instead of deleting, so a person's history in a company survives their
  -- leaving it. 0073 treats a deactivated membership as no membership.
  deactivated_at timestamptz,
  primary key (profile_id, company_id)
);

create index if not exists company_members_company_idx on company_members (company_id);

-- Which business this person is currently looking at. Nullable during this phase:
-- 0073 fails closed when it is null or points somewhere they do not belong.
alter table profiles
  add column if not exists active_company_id uuid references companies(id);

-- ── Backfill: one membership per existing profile, keeping its role and date ──
insert into company_members (profile_id, company_id, role, joined_at)
select p.id, p.company_id, p.role, p.created_at
  from profiles p
on conflict (profile_id, company_id) do nothing;

update profiles set active_company_id = company_id where active_company_id is null;

alter table company_members enable row level security;

-- You can see your own memberships; finance can see who is in their company.
-- No recursion risk: auth_company_id() and auth_role() are SECURITY DEFINER with
-- row_security = off, so they do not re-enter this policy.
drop policy if exists company_members_select on company_members;
create policy company_members_select on company_members
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (
      company_id = private.auth_company_id()
      and private.auth_role() = any (array['owner', 'accountant']::user_role[])
    )
  );

-- No INSERT, UPDATE or DELETE policy. Joining, leaving and switching become
-- SECURITY DEFINER RPCs in P1; until then only the backfill above writes here.
