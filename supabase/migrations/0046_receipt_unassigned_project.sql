-- Let a receipt exist before anyone has chosen its project.
--
-- WHY NULLABLE RATHER THAN A STAGING TABLE
-- Only one receipts policy reads project_id (receipts_select); UPDATE and DELETE
-- key off the denormalised company_id, which stays NOT NULL. A staging table
-- would need its own RLS, its own storage convention and a second write path,
-- and the receipt would be invisible in Risip until assigned. Making the column
-- nullable touches two policies and lets TypeScript find every call site.
--
-- IMPACT
--   receipts.project_id            NOT NULL -> NULL allowed. No existing row changes.
--   receipts_select                extended: a project-less receipt is visible to
--                                  its uploader and to owner/accountant in the SAME
--                                  company. Company isolation is unchanged.
--   receipts_insert_own            extended so a null project may be inserted only
--                                  for yourself, in your own company.
--   storage "receipts read..."     extended so an image is readable exactly when its
--                                  receipt row is readable (the subquery is itself
--                                  filtered by receipts RLS).
--   Approved totals                unaffected: they filter on status='confirmed',
--                                  and unassigned receipts are pending_review.
--
-- ROLLBACK (safe while no null rows exist; the first statement reports them)
--   select count(*) from receipts where project_id is null;   -- must be 0
--   alter table receipts alter column project_id set not null;
--   -- then re-create the three policies from 0004_rls.sql / 0005_storage.sql

alter table receipts alter column project_id drop not null;

-- A receipt with no project yet belongs to whoever sent it, plus company finance.
drop policy if exists receipts_select on receipts;
create policy receipts_select on receipts
  for select to authenticated
  using (
    case
      when project_id is null then
        company_id = private.auth_company_id()
        and (
          uploaded_by = auth.uid()
          or private.auth_role() = any (array['owner', 'accountant']::user_role[])
        )
      else private.auth_can_see_project(project_id)
    end
  );

drop policy if exists receipts_insert_own on receipts;
create policy receipts_insert_own on receipts
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      case
        when project_id is null then company_id = private.auth_company_id()
        else private.auth_can_see_project(project_id)
      end
    )
  );

-- Unassigned images live under <company_id>/unassigned/<receipt_id>.jpg, whose
-- first segment is not a project id. Rather than invent a second rule, fall back
-- to "you may read the image if you may read the receipt" — the subquery runs
-- under the caller's rights, so receipts RLS above decides.
create index if not exists receipts_image_url_idx on receipts (image_url);

drop policy if exists "receipts read via project access" on storage.objects;
create policy "receipts read via project access" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      private.auth_can_see_project(storage_first_uuid_segment(name))
      or exists (select 1 from receipts r where r.image_url = storage.objects.name)
    )
  );
