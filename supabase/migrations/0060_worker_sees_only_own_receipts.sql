-- Privacy pass: staff see their own receipts, not the company's books.
--
-- MEASURED BEFORE THIS CHANGE (as a real worker, through RLS):
--     confirmed receipts visible: 13   total: TZS 1,726,767   <- the whole company
--     all receipts visible:       22
--     receipts by other people:   11
--     invoices_this_month_count RPC: 1
-- A worker saw exactly what the owner saw.
--
-- ROOT CAUSE: receipts_select delegated to private.auth_can_see_project(), which
-- checks COMPANY membership, not project membership — deliberately, per
-- 0013_simplify_project_visibility ("anyone in a company sees all its projects").
-- That was a reasonable small-business default; it is not compatible with staff
-- being unable to see company finances.
--
-- APPROACH: change the receipts, scanned-document and storage policies only.
-- auth_can_see_project() is left alone: it also drives project visibility and
-- uploads, and narrowing it would stop staff who joined by company password —
-- who have no project_members rows — from seeing projects or their own images.
--
-- Every company total in the app is derived from receipts, so scoping receipts
-- closes the totals, the counts, the trend and the category breakdown at once.
--
-- ROLLBACK (restores the previous, wider visibility)
--   drop policy receipts_select on receipts;
--   create policy receipts_select on receipts for select to authenticated
--     using (case when project_id is null then ... else private.auth_can_see_project(project_id) end);
--   -- and restore the storage + scanned_documents policies from 0046 / 0017

-- ── Receipts: the single source of every financial total ───────────────────
drop policy if exists receipts_select on receipts;
create policy receipts_select on receipts
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and (
      uploaded_by = auth.uid()
      or private.auth_role() = any (array['owner', 'accountant']::user_role[])
    )
  );

-- Insert is unchanged in spirit: you may only file a receipt as yourself, into a
-- project you can see (or with no project yet, in your own company).
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

-- ── Batch source pages ─────────────────────────────────────────────────────
-- A batch page holds several people's receipts, so it must not be readable
-- company-wide. Visible to whoever scanned it, to finance, or to anyone who can
-- already see a receipt that came off it (so their own receipt keeps its image).
drop policy if exists scanned_docs_member_select on scanned_documents;
create policy scanned_docs_member_select on scanned_documents
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and (
      created_by = auth.uid()
      or private.auth_role() = any (array['owner', 'accountant']::user_role[])
      or exists (select 1 from receipts r where r.scanned_doc_id = scanned_documents.id)
    )
  );

-- ── Storage: image access follows row visibility, exactly ──────────────────
-- The old policy allowed any object whose first path segment was a project in
-- your company — i.e. every receipt image in the business. Drop that branch and
-- derive access from the rows themselves; both subqueries run under the caller's
-- own RLS, so an image is readable precisely when its record is.
drop policy if exists "receipts read via project access" on storage.objects;
create policy "receipts read via project access" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      exists (select 1 from receipts r where r.image_url = storage.objects.name)
      or exists (select 1 from scanned_documents d where d.file_url = storage.objects.name)
    )
  );

create index if not exists scanned_documents_file_url_idx on scanned_documents (file_url);

-- ── Company-wide reporting RPC ─────────────────────────────────────────────
-- Returned a company figure to anyone who asked, including staff.
create or replace function public.invoices_this_month_count(p_project uuid default null)
returns integer
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare cid uuid; n integer;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'not authorized' using errcode = 'P0001';
  end if;
  cid := private.auth_company_id();
  select count(*) into n
    from public.invoices i join public.projects p on p.id = i.project_id
   where p.company_id = cid
     and (p_project is null or i.project_id = p_project)
     and i.created_at >= date_trunc('month', now());
  return coalesce(n, 0);
end $$;

revoke execute on function public.invoices_this_month_count(uuid) from public, anon;
grant execute on function public.invoices_this_month_count(uuid) to authenticated;
