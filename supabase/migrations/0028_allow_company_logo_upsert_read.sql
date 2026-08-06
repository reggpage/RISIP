-- Supabase Storage upsert checks object visibility before deciding whether to
-- insert or update. The company-logos bucket is public, so expose its objects
-- for reads while keeping writes owner-only.
drop policy if exists "logos read public" on storage.objects;

create policy "logos read public"
  on storage.objects for select to public
  using (bucket_id = 'company-logos');
