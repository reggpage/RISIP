-- Risip P2.1: daily records core ledger.
--
-- These records are an operational journal, not receipt expenses. They must not
-- write to or alter receipts, reimbursements, petty cash, retirements, supplier
-- claims, or invoices. All money/status mutations are RPC-only.

create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  recorded_by uuid references public.profiles(id) on delete set null,
  source text not null default 'app',
  source_message_id text,
  kind text not null,
  status text not null default 'pending_confirmation',
  amount numeric(14,2) not null,
  currency text not null,
  party_name text,
  description text,
  occurred_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_records_source_check check (source in ('app', 'whatsapp', 'other')),
  constraint daily_records_kind_check check (kind in ('sale', 'expense', 'debt_issued', 'customer_payment')),
  constraint daily_records_status_check check (status in ('pending_confirmation', 'confirmed', 'voided')),
  constraint daily_records_amount_check check (amount > 0),
  constraint daily_records_currency_check check (length(btrim(currency)) between 1 and 12),
  constraint daily_records_source_message_length_check check (source_message_id is null or length(btrim(source_message_id)) between 1 and 256),
  constraint daily_records_confirmed_fields_check check (
    status <> 'confirmed' or (confirmed_by is not null and confirmed_at is not null)
  ),
  constraint daily_records_voided_fields_check check (
    status <> 'voided' or (
      voided_by is not null
      and voided_at is not null
      and private.is_meaningful_reason(void_reason)
    )
  )
);

create index if not exists daily_records_company_status_occurred_idx
  on public.daily_records(company_id, status, occurred_at desc);

create index if not exists daily_records_company_kind_occurred_idx
  on public.daily_records(company_id, kind, occurred_at desc);

create index if not exists daily_records_project_occurred_idx
  on public.daily_records(project_id, occurred_at desc);

create unique index if not exists daily_records_company_source_message_unique
  on public.daily_records(company_id, source_message_id)
  where source_message_id is not null;

create table if not exists public.daily_record_lines (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  line_number integer not null,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_amount numeric(14,2) not null,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint daily_record_lines_number_check check (line_number > 0),
  constraint daily_record_lines_quantity_check check (quantity > 0),
  constraint daily_record_lines_unit_amount_check check (unit_amount >= 0),
  constraint daily_record_lines_total_check check (line_total >= 0),
  constraint daily_record_lines_record_number_unique unique (daily_record_id, line_number)
);

create index if not exists daily_record_lines_record_idx
  on public.daily_record_lines(daily_record_id, line_number);

create table if not exists public.daily_record_audit_log (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  from_status text,
  to_status text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint daily_record_audit_action_check check (action in ('created', 'confirmed', 'voided')),
  constraint daily_record_audit_from_status_check check (
    from_status is null or from_status in ('pending_confirmation', 'confirmed', 'voided')
  ),
  constraint daily_record_audit_to_status_check check (
    to_status in ('pending_confirmation', 'confirmed', 'voided')
  )
);

create index if not exists daily_record_audit_record_idx
  on public.daily_record_audit_log(daily_record_id, created_at desc);

create index if not exists daily_record_audit_company_idx
  on public.daily_record_audit_log(company_id, created_at desc);

alter table public.daily_records enable row level security;
alter table public.daily_record_lines enable row level security;
alter table public.daily_record_audit_log enable row level security;

drop policy if exists daily_records_select_visible on public.daily_records;
create policy daily_records_select_visible on public.daily_records
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and (
      private.auth_role() in ('owner', 'accountant')
      or recorded_by = auth.uid()
    )
  );

drop policy if exists daily_record_lines_select_visible on public.daily_record_lines;
create policy daily_record_lines_select_visible on public.daily_record_lines
  for select to authenticated
  using (
    exists (
      select 1
        from public.daily_records dr
       where dr.id = daily_record_lines.daily_record_id
         and dr.company_id = private.auth_company_id()
         and (
           private.auth_role() in ('owner', 'accountant')
           or dr.recorded_by = auth.uid()
         )
    )
  );

drop policy if exists daily_record_audit_select_visible on public.daily_record_audit_log;
create policy daily_record_audit_select_visible on public.daily_record_audit_log
  for select to authenticated
  using (
    exists (
      select 1
        from public.daily_records dr
       where dr.id = daily_record_audit_log.daily_record_id
         and dr.company_id = private.auth_company_id()
         and (
           private.auth_role() in ('owner', 'accountant')
           or dr.recorded_by = auth.uid()
         )
    )
  );

-- No client role may mutate, truncate, or otherwise manage ledger rows. The
-- grants below make the intended API explicit; SECURITY DEFINER RPCs remain
-- the only write path for authenticated users.
revoke all on public.daily_records from anon, authenticated;
revoke all on public.daily_record_lines from anon, authenticated;
revoke all on public.daily_record_audit_log from anon, authenticated;
grant select on public.daily_records, public.daily_record_lines, public.daily_record_audit_log to authenticated;

create or replace function public.create_daily_record_draft(
  p_kind text,
  p_amount numeric,
  p_party_name text default null,
  p_description text default null,
  p_occurred_at timestamptz default now(),
  p_project_id uuid default null,
  p_source text default 'app',
  p_source_message_id text default null,
  p_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_id uuid;
  v_existing uuid;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_source text := lower(btrim(coalesce(p_source, 'app')));
  v_source_message_id text := nullif(btrim(p_source_message_id), '');
  v_party_name text := nullif(btrim(p_party_name), '');
  v_description text := nullif(btrim(p_description), '');
  v_amount numeric(14,2);
  v_currency text;
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_line record;
  v_line_description text;
  v_quantity numeric;
  v_unit_amount numeric;
  v_line_total numeric(14,2);
  v_line_sum numeric(14,2) := 0;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_kind not in ('sale', 'expense', 'debt_issued', 'customer_payment') then
    raise exception 'unsupported daily record kind' using errcode = 'P0001', hint = 'invalid_kind';
  end if;
  if v_source not in ('app', 'whatsapp', 'other') then
    raise exception 'unsupported daily record source' using errcode = 'P0001', hint = 'invalid_source';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount <= 0 then
    raise exception 'amount must be greater than zero' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if v_party_name is not null and length(v_party_name) > 200 then
    raise exception 'party name is too long' using errcode = 'P0001', hint = 'invalid_party_name';
  end if;
  if v_description is not null and length(v_description) > 2000 then
    raise exception 'description is too long' using errcode = 'P0001', hint = 'invalid_description';
  end if;
  if v_source_message_id is not null and length(v_source_message_id) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if p_project_id is not null then
    if not exists (
      select 1 from public.projects p
       where p.id = p_project_id
         and p.company_id = v_company
    ) then
      raise exception 'project is not in the active company' using errcode = 'P0001', hint = 'wrong_company';
    end if;
    if v_role = 'worker' and not private.auth_can_see_project(p_project_id) then
      raise exception 'you cannot create a record for this project' using errcode = 'P0001', hint = 'project_not_visible';
    end if;
  end if;
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'lines must be a JSON array' using errcode = 'P0001', hint = 'invalid_lines';
  end if;

  for v_line in
    select value, ordinality
      from jsonb_array_elements(v_lines) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_line.value) <> 'object' then
      raise exception 'each line must be a JSON object' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line_description := nullif(btrim(v_line.value->>'description'), '');
    if v_line_description is null or length(v_line_description) > 300 then
      raise exception 'each line needs a description' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    if coalesce(v_line.value->>'quantity', '') !~ '^([0-9]+)([.][0-9]+)?$'
       or coalesce(v_line.value->>'unit_amount', '') !~ '^([0-9]+)([.][0-9]+)?$' then
      raise exception 'each line needs numeric quantity and unit_amount' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_quantity := (v_line.value->>'quantity')::numeric;
    v_unit_amount := (v_line.value->>'unit_amount')::numeric;
    if v_quantity <= 0 or v_unit_amount < 0 then
      raise exception 'line quantity must be positive and unit amount cannot be negative'
        using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line_total := round(v_quantity * v_unit_amount, 2);
    v_line_sum := v_line_sum + v_line_total;
  end loop;
  if jsonb_array_length(v_lines) > 0 and abs(v_line_sum - v_amount) > 0.01 then
    raise exception 'line totals must equal the record amount' using errcode = 'P0001', hint = 'line_total_mismatch';
  end if;

  select c.currency into v_currency
    from public.companies c
   where c.id = v_company;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  insert into public.daily_records
    (company_id, project_id, recorded_by, source, source_message_id, kind, status,
     amount, currency, party_name, description, occurred_at)
  values
    (v_company, p_project_id, v_actor, v_source, v_source_message_id, v_kind,
     'pending_confirmation', v_amount, v_currency, v_party_name, v_description,
     coalesce(p_occurred_at, now()))
  on conflict (company_id, source_message_id)
    where source_message_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select dr.id into v_existing
      from public.daily_records dr
     where dr.company_id = v_company
       and dr.source_message_id = v_source_message_id;
    if v_existing is null then
      raise exception 'daily record could not be created' using errcode = 'P0001', hint = 'create_failed';
    end if;
    return v_existing;
  end if;

  for v_line in
    select value, ordinality
      from jsonb_array_elements(v_lines) with ordinality as items(value, ordinality)
  loop
    v_quantity := (v_line.value->>'quantity')::numeric;
    v_unit_amount := (v_line.value->>'unit_amount')::numeric;
    insert into public.daily_record_lines
      (daily_record_id, line_number, description, quantity, unit_amount, line_total)
    values
      (v_id, v_line.ordinality::integer, btrim(v_line.value->>'description'),
       v_quantity, v_unit_amount, round(v_quantity * v_unit_amount, 2));
  end loop;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, v_company, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', v_kind,
       'amount', v_amount,
       'currency', v_currency,
       'source', v_source,
       'source_message_id', v_source_message_id,
       'line_count', jsonb_array_length(v_lines)
     ));

  return v_id;
end;
$$;

create or replace function public.confirm_daily_record(p_daily_record_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_record public.daily_records;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select * into v_record
    from public.daily_records dr
   where dr.id = p_daily_record_id
   for update;
  if not found or v_record.company_id <> v_company then
    raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_record.status = 'confirmed' then
    return v_record.id;
  end if;
  if v_record.status = 'voided' then
    raise exception 'a voided daily record cannot be confirmed' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can confirm daily records'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  update public.daily_records
     set status = 'confirmed', confirmed_by = v_actor, confirmed_at = now(), updated_at = now()
   where id = v_record.id;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_record.id, v_company, v_actor, 'confirmed', v_record.status, 'confirmed',
     jsonb_build_object('amount', v_record.amount, 'currency', v_record.currency, 'kind', v_record.kind));

  return v_record.id;
end;
$$;

create or replace function public.void_daily_record(
  p_daily_record_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_record public.daily_records;
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select * into v_record
    from public.daily_records dr
   where dr.id = p_daily_record_id
   for update;
  if not found or v_record.company_id <> v_company then
    raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_record.status = 'voided' then
    return v_record.id;
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can void daily records'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if not private.is_meaningful_reason(v_reason) then
    raise exception 'a meaningful reason is required to void a daily record'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;

  update public.daily_records
     set status = 'voided', voided_by = v_actor, voided_at = now(), void_reason = v_reason, updated_at = now()
   where id = v_record.id;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (v_record.id, v_company, v_actor, 'voided', v_record.status, 'voided', v_reason,
     jsonb_build_object('amount', v_record.amount, 'currency', v_record.currency, 'kind', v_record.kind));

  return v_record.id;
end;
$$;

revoke all on function public.create_daily_record_draft(text, numeric, text, text, timestamptz, uuid, text, text, jsonb) from public, anon;
revoke all on function public.confirm_daily_record(uuid) from public, anon;
revoke all on function public.void_daily_record(uuid, text) from public, anon;
grant execute on function public.create_daily_record_draft(text, numeric, text, text, timestamptz, uuid, text, text, jsonb) to authenticated;
grant execute on function public.confirm_daily_record(uuid) to authenticated;
grant execute on function public.void_daily_record(uuid, text) to authenticated;
