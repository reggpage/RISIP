-- Risip · Storage buckets and policies.
-- Object paths encode the project id as the first path segment:
--   receipts/<project_id>/<receipt_id>.<ext>
--   invoices/<project_id>/<invoice_id>.pdf
--   company-logos/<company_id>.<ext>

insert into storage.buckets (id, name, public) values
  ('receipts',      'receipts',      false),
  ('invoices',      'invoices',      false),
  ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

-- Helper: parse the first path segment as a uuid. Neutral name because different
-- buckets encode different ids there (receipts/invoices → project_id, company-logos → company_id).
create or replace function storage_first_uuid_segment(name text) returns uuid
language sql immutable as $$
  select nullif(split_part(name, '/', 1), '')::uuid
$$;

-- ─── receipts bucket ───────────────────────────────────────────────────────
create policy "receipts read via project access"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and auth_can_see_project(storage_first_uuid_segment(name)));

create policy "receipts upload by member"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and auth_can_see_project(storage_first_uuid_segment(name)));

create policy "receipts delete by owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and auth_role() = 'owner'
    and exists (
      select 1 from projects p
      where p.id = storage_first_uuid_segment(name)
        and p.company_id = auth_company_id()
    )
  );

-- ─── invoices bucket ───────────────────────────────────────────────────────
-- Reads for accountants/owners; writes done by edge function (service role) only.
create policy "invoices read finance"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'invoices'
    and auth_role() in ('owner', 'accountant')
    and exists (
      select 1 from projects p
      where p.id = storage_first_uuid_segment(name)
        and p.company_id = auth_company_id()
    )
  );

-- ─── company-logos bucket (public read) ────────────────────────────────────
-- Public read is bucket-level. Writes: owner uploads under their own company_id.
create policy "logos write owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and auth_role() = 'owner'
    and storage_first_uuid_segment(name) = auth_company_id()
  );

create policy "logos update owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-logos'
    and auth_role() = 'owner'
    and storage_first_uuid_segment(name) = auth_company_id()
  )
  with check (
    bucket_id = 'company-logos'
    and auth_role() = 'owner'
    and storage_first_uuid_segment(name) = auth_company_id()
  );

create policy "logos delete owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and auth_role() = 'owner'
    and storage_first_uuid_segment(name) = auth_company_id()
  );
