-- Staff should not hold a directory of their colleagues.
--
-- MEASURED BEFORE: a worker read all 3 profiles in the company -- names, phone
-- numbers and roles -- because profiles_select_same_company was simply
-- "company_id = auth_company_id()".
--
-- petty_cash_accounts and petty_cash_transactions were audited at the same time
-- and needed NO change: both were already scoped to user_id = auth.uid() or
-- finance, with a separate policy letting a project leader see their own team.
--
-- Leaders are usually workers, so the leader case is kept explicitly via
-- private.leads_petty_user(), already used by the petty cash policies, meaning
-- "I lead a project this person is a member of". Without it the project team
-- panel would go blank for every leader.
--
-- ROLLBACK
--   drop policy profiles_select_scoped on profiles;
--   create policy profiles_select_same_company on profiles for select to authenticated
--     using (company_id = private.auth_company_id());

drop policy if exists profiles_select_same_company on profiles;
drop policy if exists profiles_select_scoped on profiles;
create policy profiles_select_scoped on profiles
  for select to authenticated
  using (
    -- your own profile, always
    id = auth.uid()
    -- finance manage people, so they see the whole company
    or (
      company_id = private.auth_company_id()
      and private.auth_role() = any (array['owner', 'accountant']::user_role[])
    )
    -- a project leader sees the members of the projects they lead
    or private.leads_petty_user(id)
  );
