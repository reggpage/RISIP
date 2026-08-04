do $$
begin
  if not exists (select 1 from pg_type where typname = 'staff_retirement_status') then
    create type staff_retirement_status as enum (
      'submitted',
      'viewed',
      'approved',
      'changes_requested',
      'paid',
      'received_confirmed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists staff_retirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete restrict,
  staff_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Receipt retirement',
  notes text,
  total_amount numeric(14,2) not null default 0,
  status staff_retirement_status not null default 'submitted',
  viewed_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  received_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_retirements_company_status_idx
  on staff_retirements(company_id, status, created_at desc);

create index if not exists staff_retirements_staff_idx
  on staff_retirements(staff_id, created_at desc);

alter table staff_retirements
  add column if not exists change_request_note text,
  add column if not exists change_request_receipt_ids uuid[] not null default '{}'::uuid[];

create table if not exists staff_retirement_receipts (
  id uuid primary key default gen_random_uuid(),
  retirement_id uuid not null references staff_retirements(id) on delete cascade,
  receipt_id uuid not null references receipts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(retirement_id, receipt_id)
);

create index if not exists staff_retirement_receipts_retirement_idx
  on staff_retirement_receipts(retirement_id);

create table if not exists staff_retirement_documents (
  id uuid primary key default gen_random_uuid(),
  retirement_id uuid not null references staff_retirements(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  file_type text,
  ai_status text not null default 'not_scanned',
  ai_summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists staff_retirement_documents_retirement_idx
  on staff_retirement_documents(retirement_id);

alter table staff_retirements enable row level security;
alter table staff_retirement_receipts enable row level security;
alter table staff_retirement_documents enable row level security;

drop policy if exists staff_retirements_select on staff_retirements;
create policy staff_retirements_select on staff_retirements
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and (staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
  );

drop policy if exists staff_retirements_insert_own on staff_retirements;
create policy staff_retirements_insert_own on staff_retirements
  for insert to authenticated
  with check (
    company_id = private.auth_company_id()
    and staff_id = auth.uid()
    and private.auth_can_see_project(project_id)
  );

drop policy if exists staff_retirements_update_participants on staff_retirements;
create policy staff_retirements_update_participants on staff_retirements
  for update to authenticated
  using (
    company_id = private.auth_company_id()
    and (staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
  )
  with check (
    company_id = private.auth_company_id()
    and (staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
  );

drop policy if exists staff_retirement_receipts_select on staff_retirement_receipts;
create policy staff_retirement_receipts_select on staff_retirement_receipts
  for select to authenticated
  using (
    exists (
      select 1 from staff_retirements sr
      where sr.id = retirement_id
        and sr.company_id = private.auth_company_id()
        and (sr.staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
    )
  );

drop policy if exists staff_retirement_receipts_insert on staff_retirement_receipts;
create policy staff_retirement_receipts_insert on staff_retirement_receipts
  for insert to authenticated
  with check (
    exists (
      select 1 from staff_retirements sr
      join receipts r on r.id = receipt_id
      where sr.id = retirement_id
        and sr.staff_id = auth.uid()
        and r.uploaded_by = auth.uid()
        and r.company_id = sr.company_id
    )
  );

drop policy if exists staff_retirement_documents_select on staff_retirement_documents;
create policy staff_retirement_documents_select on staff_retirement_documents
  for select to authenticated
  using (
    exists (
      select 1 from staff_retirements sr
      where sr.id = retirement_id
        and sr.company_id = private.auth_company_id()
        and (sr.staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
    )
  );

drop policy if exists staff_retirement_documents_insert on staff_retirement_documents;
create policy staff_retirement_documents_insert on staff_retirement_documents
  for insert to authenticated
  with check (
    company_id = private.auth_company_id()
    and created_by = auth.uid()
    and exists (
      select 1 from staff_retirements sr
      where sr.id = retirement_id
        and sr.staff_id = auth.uid()
        and sr.company_id = company_id
    )
  );
