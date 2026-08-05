-- Batch upload for staff: let any project member (not just finance) create + read
-- scanned_documents for projects they can see. The receipts themselves are still
-- inserted under receipts_insert_own (uploaded_by = auth.uid()).
create table if not exists scanned_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  file_url text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists scanned_documents_project_created_idx
  on scanned_documents(project_id, created_at desc);

create or replace function scanned_documents_set_company_id() returns trigger
language plpgsql as $$
begin
  select company_id into new.company_id from projects where id = new.project_id;
  if new.company_id is null then
    raise exception 'scanned_documents.project_id % does not resolve to a company', new.project_id;
  end if;
  return new;
end $$;

drop trigger if exists scanned_documents_set_company_id_biu on scanned_documents;
create trigger scanned_documents_set_company_id_biu
  before insert or update of project_id on scanned_documents
  for each row execute function scanned_documents_set_company_id();

alter table receipts
  add column if not exists scanned_doc_id uuid references scanned_documents(id) on delete set null;

create index if not exists receipts_scanned_doc_idx on receipts(scanned_doc_id);

alter table scanned_documents enable row level security;

drop policy if exists scanned_docs_member_insert on scanned_documents;
create policy scanned_docs_member_insert on scanned_documents
  for insert to authenticated
  with check (created_by = auth.uid() and private.auth_can_see_project(project_id));

drop policy if exists scanned_docs_member_select on scanned_documents;
create policy scanned_docs_member_select on scanned_documents
  for select to authenticated
  using (private.auth_can_see_project(project_id));
