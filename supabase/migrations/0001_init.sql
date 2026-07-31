-- Risip · initial schema
-- Multi-tenant: every business row is scoped by company_id (directly or via project → company).

create extension if not exists "pgcrypto";

-- ─── enums ─────────────────────────────────────────────────────────────────
create type user_role       as enum ('owner', 'accountant', 'worker');
create type project_status  as enum ('active', 'archived');
create type receipt_status  as enum ('processing', 'confirmed', 'duplicate', 'error');
create type invoice_status  as enum ('draft', 'sent');

-- ─── companies ─────────────────────────────────────────────────────────────
create table companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  hq_location  text not null,
  sector       text,
  logo_url     text,
  currency     text not null default 'TZS',
  created_at   timestamptz not null default now()
);

-- ─── profiles (1:1 with auth.users, bound to one company) ──────────────────
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  full_name       text not null,
  phone           text,
  role            user_role not null,
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now()
);
create index profiles_company_idx on profiles(company_id);

-- ─── projects ──────────────────────────────────────────────────────────────
create table projects (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  name           text not null,
  site_location  text,
  client_name    text,
  start_date     date,
  description    text,
  status         project_status not null default 'active',
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now()
);
create index projects_company_status_idx on projects(company_id, status);

-- ─── project_members (worker assignments; accountant/owner see all in company) ─
create table project_members (
  project_id  uuid references projects(id) on delete cascade,
  profile_id  uuid references profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

-- ─── invite_links (role-bound, revocable) ──────────────────────────────────
create table invite_links (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  role         user_role not null check (role in ('accountant', 'worker')),
  token        text not null unique,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now()
);
create index invite_links_project_idx on invite_links(project_id);

-- ─── receipts ──────────────────────────────────────────────────────────────
-- company_id is denormalized and kept in sync by a trigger so we can enforce
-- a unique (company_id, verification_code) index for the duplicate-submission guard.
create table receipts (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references projects(id) on delete cascade,
  company_id             uuid not null references companies(id) on delete cascade,
  uploaded_by            uuid not null references profiles(id),
  image_url              text not null,
  vendor_name            text,
  vendor_tin             text,
  vendor_vrn             text,
  receipt_number         text,
  verification_code      text,
  receipt_date           date,
  receipt_time           time,
  total_amount           numeric(14,2),
  tax_amount             numeric(14,2),
  category               text,
  status                 receipt_status not null default 'processing',
  raw_ai_response        jsonb,
  low_confidence_fields  text[] not null default '{}',
  created_at             timestamptz not null default now()
);
create index receipts_project_created_idx on receipts(project_id, created_at desc);
create index receipts_status_idx on receipts(status);

-- Fill company_id from the referenced project on insert; block cross-company drift on update.
create or replace function receipts_set_company_id() returns trigger
language plpgsql as $$
begin
  select company_id into new.company_id from projects where id = new.project_id;
  if new.company_id is null then
    raise exception 'receipts.project_id % does not resolve to a company', new.project_id;
  end if;
  return new;
end;
$$;

create trigger receipts_set_company_id_biu
  before insert or update of project_id on receipts
  for each row execute function receipts_set_company_id();

-- Duplicate/fraud guard: same physical receipt cannot count twice in a company.
create unique index receipts_company_verification_unique
  on receipts (company_id, verification_code)
  where verification_code is not null and status <> 'duplicate';

-- ─── invoices ──────────────────────────────────────────────────────────────
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  total_amount   numeric(14,2) not null,
  tax_amount     numeric(14,2) not null,
  pdf_url        text,
  status         invoice_status not null default 'draft',
  generated_by   uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  check (period_end >= period_start)
);
create index invoices_project_period_idx on invoices(project_id, period_start desc);

create table invoice_receipts (
  invoice_id  uuid references invoices(id) on delete cascade,
  receipt_id  uuid references receipts(id) on delete restrict,
  primary key (invoice_id, receipt_id)
);
