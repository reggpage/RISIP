-- Keep company logo writes aligned with the app path: <company_id>/logo.jpg.
-- Use the private auth helpers explicitly so storage RLS does not depend on
-- a public-schema helper that was moved by the security migrations.
drop policy if exists "logos write owner" on storage.objects;
drop policy if exists "logos update owner" on storage.objects;
drop policy if exists "logos delete owner" on storage.objects;

create policy "logos write owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and private.auth_role() = 'owner'
    and split_part(name, '/', 1) = private.auth_company_id()::text
  );

create policy "logos update owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-logos'
    and private.auth_role() = 'owner'
    and split_part(name, '/', 1) = private.auth_company_id()::text
  )
  with check (
    bucket_id = 'company-logos'
    and private.auth_role() = 'owner'
    and split_part(name, '/', 1) = private.auth_company_id()::text
  );

create policy "logos delete owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and private.auth_role() = 'owner'
    and split_part(name, '/', 1) = private.auth_company_id()::text
  );
