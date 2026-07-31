-- The `project_members_write_owner` policy was FOR ALL, which also applied it to
-- SELECT queries. Its USING clause reads `projects` directly (no SECURITY DEFINER bypass),
-- so when projects' own RLS reads project_members via subquery, Postgres re-enters
-- projects → infinite recursion. Split into INSERT + DELETE only.

drop policy if exists project_members_write_owner on project_members;

create policy project_members_insert_owner on project_members
  for insert to authenticated
  with check (
    private.auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = private.auth_company_id())
  );

create policy project_members_delete_owner on project_members
  for delete to authenticated
  using (
    private.auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = private.auth_company_id())
  );
