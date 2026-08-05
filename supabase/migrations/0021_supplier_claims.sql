-- Supplier claims portal: external businesses can request a connection and submit
-- receipt-backed claims to a company. Internal users review, mark viewed/paid, and
-- suppliers can acknowledge receipt of payment.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_connection_status') then
    create type supplier_connection_status as enum ('pending', 'connected', 'declined');
  end if;
  if not exists (select 1 from pg_type where typname = 'supplier_claim_status') then
    create type supplier_claim_status as enum (
      'submitted',
      'viewed',
      'approved_for_payment',
      'paid',
      'received_confirmed',
      'disputed'
    );
  end if;
end $$;

create extension if not exists pgcrypto;

create table if not exists supplier_connections (
  id uuid primary key default gen_random_uuid(),
  target_company_id uuid not null references companies(id) on delete cascade,
  supplier_name text not null,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  supplier_tin text,
  note text,
  status supplier_connection_status not null default 'pending',
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supplier_connections_target_idx on supplier_connections(target_company_id, status, created_at desc);

create table if not exists supplier_claims (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references supplier_connections(id) on delete cascade,
  target_company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  claim_note text,
  amount numeric(14,2),
  status supplier_claim_status not null default 'submitted',
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  viewed_at timestamptz,
  paid_at timestamptz,
  received_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supplier_claims_target_idx on supplier_claims(target_company_id, status, created_at desc);
create index if not exists supplier_claims_connection_idx on supplier_claims(connection_id, created_at desc);

create table if not exists supplier_claim_receipts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references supplier_claims(id) on delete cascade,
  vendor_name text,
  receipt_date date,
  total_amount numeric(14,2),
  tax_amount numeric(14,2),
  category text,
  verification_code text,
  image_url text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists supplier_claim_messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references supplier_claims(id) on delete cascade,
  author_side text not null check (author_side in ('supplier', 'company')),
  author_name text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists supplier_claim_messages_claim_idx on supplier_claim_messages(claim_id, created_at);

alter table supplier_connections enable row level security;
alter table supplier_claims enable row level security;
alter table supplier_claim_receipts enable row level security;
alter table supplier_claim_messages enable row level security;

drop policy if exists supplier_connections_internal_select on supplier_connections;
create policy supplier_connections_internal_select on supplier_connections
  for select to authenticated
  using (target_company_id = private.auth_company_id());

drop policy if exists supplier_connections_internal_update on supplier_connections;
create policy supplier_connections_internal_update on supplier_connections
  for update to authenticated
  using (target_company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'))
  with check (target_company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'));

drop policy if exists supplier_claims_internal_select on supplier_claims;
create policy supplier_claims_internal_select on supplier_claims
  for select to authenticated
  using (target_company_id = private.auth_company_id());

drop policy if exists supplier_claims_internal_update on supplier_claims;
create policy supplier_claims_internal_update on supplier_claims
  for update to authenticated
  using (target_company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'))
  with check (target_company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'));

drop policy if exists supplier_claim_receipts_internal_select on supplier_claim_receipts;
create policy supplier_claim_receipts_internal_select on supplier_claim_receipts
  for select to authenticated
  using (
    exists (
      select 1 from supplier_claims c
      where c.id = claim_id and c.target_company_id = private.auth_company_id()
    )
  );

drop policy if exists supplier_claim_messages_internal_select on supplier_claim_messages;
create policy supplier_claim_messages_internal_select on supplier_claim_messages
  for select to authenticated
  using (
    exists (
      select 1 from supplier_claims c
      where c.id = claim_id and c.target_company_id = private.auth_company_id()
    )
  );

create or replace function public_supplier_knock(
  p_target_company_id uuid,
  p_supplier_name text,
  p_contact_name text,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_supplier_tin text default null,
  p_note text default null
) returns table(connection_token text)
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  insert into supplier_connections (
    target_company_id, supplier_name, contact_name, contact_email,
    contact_phone, supplier_tin, note
  )
  values (
    p_target_company_id, trim(p_supplier_name), trim(p_contact_name),
    nullif(trim(coalesce(p_contact_email, '')), ''),
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    nullif(regexp_replace(coalesce(p_supplier_tin, ''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning public_token into v_token;

  return query select v_token;
end;
$$;

create or replace function public_supplier_submit_claim(
  p_connection_token text,
  p_title text,
  p_claim_note text default null,
  p_amount numeric default null
) returns table(claim_token text)
language plpgsql security definer set search_path = public as $$
declare
  v_connection supplier_connections%rowtype;
  v_claim_token text;
begin
  select * into v_connection
  from supplier_connections
  where public_token = p_connection_token
    and status = 'connected';

  if not found then
    raise exception 'connection_not_approved';
  end if;

  insert into supplier_claims (connection_id, target_company_id, title, claim_note, amount)
  values (v_connection.id, v_connection.target_company_id, trim(p_title), nullif(trim(coalesce(p_claim_note, '')), ''), p_amount)
  returning public_token into v_claim_token;

  if p_claim_note is not null and trim(p_claim_note) <> '' then
    insert into supplier_claim_messages (claim_id, author_side, author_name, message)
    select id, 'supplier', v_connection.contact_name, trim(p_claim_note)
    from supplier_claims
    where public_token = v_claim_token;
  end if;

  return query select v_claim_token;
end;
$$;

create or replace function public_supplier_claim_status(p_claim_token text)
returns table(
  claim_title text,
  claim_status supplier_claim_status,
  target_company_name text,
  supplier_name text,
  amount numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select cl.title, cl.status, co.name, cn.supplier_name, cl.amount, cl.created_at, cl.updated_at
  from supplier_claims cl
  join supplier_connections cn on cn.id = cl.connection_id
  join companies co on co.id = cl.target_company_id
  where cl.public_token = p_claim_token
$$;

revoke all on function public_supplier_knock(uuid, text, text, text, text, text, text) from public;
revoke all on function public_supplier_submit_claim(text, text, text, numeric) from public;
revoke all on function public_supplier_claim_status(text) from public;
grant execute on function public_supplier_knock(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public_supplier_submit_claim(text, text, text, numeric) to anon, authenticated;
grant execute on function public_supplier_claim_status(text) to anon, authenticated;
