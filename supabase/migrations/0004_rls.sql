-- Risip · Row Level Security policies.
-- Default posture: RLS on, no policies = deny. Add explicit policies per role.
-- Anything that must cross tenants (company signup, join-by-token, invoice generation)
-- runs in an Edge Function with the service_role key, which bypasses RLS.

alter table companies         enable row level security;
alter table profiles          enable row level security;
alter table projects          enable row level security;
alter table project_members   enable row level security;
alter table invite_links      enable row level security;
alter table receipts          enable row level security;
alter table invoices          enable row level security;
alter table invoice_receipts  enable row level security;

-- ─── companies ─────────────────────────────────────────────────────────────
create policy companies_select_own on companies
  for select to authenticated
  using (id = auth_company_id());

create policy companies_update_owner on companies
  for update to authenticated
  using (id = auth_company_id() and auth_role() = 'owner')
  with check (id = auth_company_id() and auth_role() = 'owner');

-- INSERT: signup-company edge function only (service role bypasses RLS).
-- DELETE: not allowed from client.

-- ─── profiles ──────────────────────────────────────────────────────────────
create policy profiles_select_same_company on profiles
  for select to authenticated
  using (company_id = auth_company_id());

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and company_id = auth_company_id());

create policy profiles_update_owner_same_company on profiles
  for update to authenticated
  using (auth_role() = 'owner' and company_id = auth_company_id())
  with check (auth_role() = 'owner' and company_id = auth_company_id());

-- INSERT: signup + join edge functions only.

-- ─── projects ──────────────────────────────────────────────────────────────
create policy projects_select_visible on projects
  for select to authenticated
  using (
    (auth_role() in ('owner', 'accountant') and company_id = auth_company_id())
    or (auth_role() = 'worker' and exists (
      select 1 from project_members m where m.project_id = projects.id and m.profile_id = auth.uid()
    ))
  );

create policy projects_insert_owner on projects
  for insert to authenticated
  with check (auth_role() = 'owner' and company_id = auth_company_id());

create policy projects_update_owner on projects
  for update to authenticated
  using (auth_role() = 'owner' and company_id = auth_company_id())
  with check (auth_role() = 'owner' and company_id = auth_company_id());

create policy projects_delete_owner on projects
  for delete to authenticated
  using (auth_role() = 'owner' and company_id = auth_company_id());

-- ─── project_members ───────────────────────────────────────────────────────
create policy project_members_select on project_members
  for select to authenticated
  using (auth_can_see_project(project_id));

create policy project_members_write_owner on project_members
  for all to authenticated
  using (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  )
  with check (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

-- ─── invite_links ──────────────────────────────────────────────────────────
create policy invite_links_select on invite_links
  for select to authenticated
  using (
    auth_role() in ('owner', 'accountant')
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

create policy invite_links_insert_owner on invite_links
  for insert to authenticated
  with check (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

create policy invite_links_update_owner on invite_links
  for update to authenticated
  using (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  )
  with check (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

create policy invite_links_delete_owner on invite_links
  for delete to authenticated
  using (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

-- ─── receipts ──────────────────────────────────────────────────────────────
create policy receipts_select on receipts
  for select to authenticated
  using (auth_can_see_project(project_id));

create policy receipts_insert_own on receipts
  for insert to authenticated
  with check (uploaded_by = auth.uid() and auth_can_see_project(project_id));

-- Uploader can only edit their own row while it's still processing (retry/cancel).
create policy receipts_update_own_processing on receipts
  for update to authenticated
  using (uploaded_by = auth.uid() and status = 'processing')
  with check (uploaded_by = auth.uid());

-- Accountant/owner can update after confirmation (fix category, mark duplicate, etc.).
create policy receipts_update_finance on receipts
  for update to authenticated
  using (
    auth_role() in ('owner', 'accountant')
    and company_id = auth_company_id()
  )
  with check (
    auth_role() in ('owner', 'accountant')
    and company_id = auth_company_id()
  );

create policy receipts_delete_owner on receipts
  for delete to authenticated
  using (auth_role() = 'owner' and company_id = auth_company_id());

-- ─── invoices ──────────────────────────────────────────────────────────────
create policy invoices_select on invoices
  for select to authenticated
  using (
    auth_role() in ('owner', 'accountant')
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

create policy invoices_insert_finance on invoices
  for insert to authenticated
  with check (
    auth_role() in ('owner', 'accountant')
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
    and generated_by = auth.uid()
  );

create policy invoices_update_finance on invoices
  for update to authenticated
  using (
    auth_role() in ('owner', 'accountant')
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
    and status = 'draft'
  )
  with check (
    auth_role() in ('owner', 'accountant')
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

create policy invoices_delete_owner on invoices
  for delete to authenticated
  using (
    auth_role() = 'owner'
    and exists (select 1 from projects p where p.id = project_id and p.company_id = auth_company_id())
  );

-- ─── invoice_receipts ──────────────────────────────────────────────────────
-- Readable if the invoice is; writes only via edge function (service role).
create policy invoice_receipts_select on invoice_receipts
  for select to authenticated
  using (
    exists (
      select 1
      from invoices i
      join projects p on p.id = i.project_id
      where i.id = invoice_id
        and auth_role() in ('owner', 'accountant')
        and p.company_id = auth_company_id()
    )
  );
