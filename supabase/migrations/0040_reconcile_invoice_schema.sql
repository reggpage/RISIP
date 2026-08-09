-- Reconcile the invoices feature with objects that were applied by hand on the
-- original project but never captured as migrations. Without these, a freshly
-- migrated database fails to generate invoices ("Could not find the 'company_id'
-- column of 'invoices' in the schema cache") and the invoice editor breaks on the
-- missing invoice_comments / invoice_activity tables.

-- Enum values used by the invoice workflow (base enum only had draft/sent).
alter type invoice_status add value if not exists 'pending_approval';
alter type invoice_status add value if not exists 'approved';
alter type invoice_status add value if not exists 'accepted';
alter type invoice_status add value if not exists 'disputed';

-- Columns the app and generate-invoice function expect.
alter table invoices
  add column if not exists company_id uuid references companies(id),
  add column if not exists invoice_number text,
  add column if not exists client_name text,
  add column if not exists custom_notes text,
  add column if not exists signature_url text,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists line_items jsonb,
  add column if not exists signed_by uuid references profiles(id),
  add column if not exists signed_at timestamptz,
  add column if not exists sent_at timestamptz;

update invoices i set company_id = p.company_id
  from projects p where p.id = i.project_id and i.company_id is null;

-- Comment + activity tables used by the invoice editor / public page.
create table if not exists invoice_comments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete set null,
  author_type text not null,
  author_name text,
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists invoice_activity (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  event text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table invoice_comments enable row level security;
alter table invoice_activity enable row level security;

drop policy if exists invoice_comments_finance_select on invoice_comments;
create policy invoice_comments_finance_select on invoice_comments for select to authenticated
  using (private.auth_role() = any (array['owner','accountant']::user_role[])
    and exists (select 1 from invoices i where i.id = invoice_comments.invoice_id and i.company_id = private.auth_company_id()));

drop policy if exists invoice_comments_finance_update on invoice_comments;
create policy invoice_comments_finance_update on invoice_comments for update to authenticated
  using (private.auth_role() = any (array['owner','accountant']::user_role[])
    and exists (select 1 from invoices i where i.id = invoice_comments.invoice_id and i.company_id = private.auth_company_id()))
  with check (true);

drop policy if exists invoice_activity_finance_select on invoice_activity;
create policy invoice_activity_finance_select on invoice_activity for select to authenticated
  using (private.auth_role() = any (array['owner','accountant']::user_role[])
    and exists (select 1 from invoices i where i.id = invoice_activity.invoice_id and i.company_id = private.auth_company_id()));

notify pgrst, 'reload schema';
