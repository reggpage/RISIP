-- RISIP BUCHA, PHASE 6 — buying the animal and breaking it into sellable
-- products are two different events.
--
-- A whole cow is an input asset. It is not yet kilos of meat, liver, offal or
-- scraps, so it must not pass through daily_record_lines: those lines are the
-- product stock ledger. Phase 7 may later consume this immutable procurement
-- and record measured outputs, but this migration creates no such outputs.

alter table public.daily_records drop constraint if exists daily_records_kind_check;
alter table public.daily_records add constraint daily_records_kind_check check (
  kind = any (array[
    'sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase',
    'stock_loss', 'owner_use', 'supplier_payable', 'supplier_payment',
    'whole_animal_procurement'
  ])
);

create table if not exists public.whole_animal_procurements (
  daily_record_id uuid primary key
    references public.daily_records(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  animal_type text not null,
  animal_count integer not null,
  purchase_total_snapshot numeric(14,2) not null,
  per_animal_cost_snapshot numeric(14,2) not null,
  supplier_name text,
  reference text,
  note text,
  occurred_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint whole_animal_type_check
    check (length(btrim(animal_type)) between 2 and 100),
  constraint whole_animal_count_check
    check (animal_count between 1 and 1000),
  constraint whole_animal_total_check
    check (purchase_total_snapshot > 0 and purchase_total_snapshot <= 100000000),
  constraint whole_animal_unit_cost_check
    check (per_animal_cost_snapshot > 0),
  constraint whole_animal_supplier_len
    check (supplier_name is null or length(btrim(supplier_name)) between 1 and 200),
  constraint whole_animal_reference_len
    check (reference is null or length(btrim(reference)) between 1 and 200),
  constraint whole_animal_note_len
    check (note is null or length(btrim(note)) between 1 and 1000)
);

create index if not exists whole_animal_procurements_company_occurred_idx
  on public.whole_animal_procurements(company_id, occurred_at desc);

alter table public.whole_animal_procurements enable row level security;

drop policy if exists whole_animal_procurements_select_visible
  on public.whole_animal_procurements;
create policy whole_animal_procurements_select_visible
  on public.whole_animal_procurements
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and exists (
      select 1
        from public.daily_records r
       where r.id = daily_record_id
         and r.company_id = private.auth_company_id()
         and (
           private.auth_role() in ('owner', 'accountant')
           or r.recorded_by = auth.uid()
         )
    )
  );

revoke all on public.whole_animal_procurements from public, anon;
grant select on public.whole_animal_procurements to authenticated;

comment on table public.whole_animal_procurements is
  'Immutable procurement facts for whole animals. Confirmation/void status lives on daily_records. This table never creates product stock or animal yields.';
comment on column public.whole_animal_procurements.purchase_total_snapshot is
  'Server-validated total paid for the animals, frozen when the draft is created.';
comment on column public.whole_animal_procurements.per_animal_cost_snapshot is
  'Server-derived purchase_total_snapshot / animal_count. Never supplied as trusted arithmetic by a client or model.';

create or replace function public.create_whole_animal_procurement_draft(
  p_animal_type text,
  p_animal_count integer,
  p_purchase_total numeric,
  p_supplier_name text default null,
  p_payment_method text default null,
  p_occurred_at timestamptz default now(),
  p_source text default 'app',
  p_source_message_id text default null,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_id uuid;
  v_existing public.daily_records%rowtype;
  v_animal text := nullif(btrim(regexp_replace(coalesce(p_animal_type, ''), '\s+', ' ', 'g')), '');
  v_supplier text := nullif(btrim(regexp_replace(coalesce(p_supplier_name, ''), '\s+', ' ', 'g')), '');
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_source text := lower(btrim(coalesce(p_source, 'app')));
  v_message text := nullif(btrim(coalesce(p_source_message_id, '')), '');
  v_reference text := nullif(btrim(regexp_replace(coalesce(p_reference, ''), '\s+', ' ', 'g')), '');
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  v_total numeric(14,2);
  v_per_animal numeric(14,2);
  v_currency text;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_animal is null or length(v_animal) not between 2 and 100 then
    raise exception 'animal type is required' using errcode = 'P0001', hint = 'invalid_animal_type';
  end if;
  if p_animal_count is null or p_animal_count < 1 or p_animal_count > 1000 then
    raise exception 'animal count must be between 1 and 1000'
      using errcode = 'P0001', hint = 'invalid_animal_count';
  end if;
  if p_purchase_total is null or p_purchase_total <= 0 or p_purchase_total > 100000000 then
    raise exception 'purchase total must be positive and within the record limit'
      using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  v_total := round(p_purchase_total, 2);
  v_per_animal := round(v_total / p_animal_count, 2);
  if v_per_animal <= 0 then
    raise exception 'per-animal cost is invalid' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if v_method = 'deni' then
    raise exception 'supplier credit is not a payment method in this phase'
      using errcode = 'P0001', hint = 'supplier_credit_not_supported';
  end if;
  if v_method is not null and v_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unsupported payment method' using errcode = 'P0001', hint = 'invalid_payment_method';
  end if;
  if v_source not in ('app', 'whatsapp', 'other') then
    raise exception 'unsupported source' using errcode = 'P0001', hint = 'invalid_source';
  end if;
  if v_message is not null and length(v_message) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if v_supplier is not null and length(v_supplier) > 200 then
    raise exception 'supplier name is too long' using errcode = 'P0001', hint = 'invalid_supplier';
  end if;
  if v_reference is not null and length(v_reference) > 200 then
    raise exception 'reference is too long' using errcode = 'P0001', hint = 'invalid_reference';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'note is too long' using errcode = 'P0001', hint = 'invalid_note';
  end if;

  select c.currency into v_currency from public.companies c where c.id = v_company;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  insert into public.daily_records
    (company_id, recorded_by, source, source_message_id, kind, status, amount,
     currency, party_name, description, occurred_at, payment_method)
  values
    (v_company, v_actor, v_source, v_message, 'whole_animal_procurement',
     'pending_confirmation', v_total, v_currency, v_supplier,
     initcap(v_animal) || ' mzima', coalesce(p_occurred_at, now()), v_method)
  on conflict (company_id, source_message_id)
    where source_message_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing
      from public.daily_records r
     where r.company_id = v_company and r.source_message_id = v_message;
    if v_existing.id is null or v_existing.kind <> 'whole_animal_procurement' then
      raise exception 'source message belongs to another record'
        using errcode = 'P0001', hint = 'idempotency_conflict';
    end if;
    return v_existing.id;
  end if;

  insert into public.whole_animal_procurements
    (daily_record_id, company_id, animal_type, animal_count,
     purchase_total_snapshot, per_animal_cost_snapshot, supplier_name,
     reference, note, occurred_at, created_by)
  values
    (v_id, v_company, lower(v_animal), p_animal_count,
     v_total, v_per_animal, v_supplier, v_reference, v_note,
     coalesce(p_occurred_at, now()), v_actor);

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, v_company, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', 'whole_animal_procurement',
       'animal_type', lower(v_animal),
       'animal_count', p_animal_count,
       'purchase_total', v_total,
       'per_animal_cost', v_per_animal,
       'payment_method', v_method,
       'supplier_name', v_supplier,
       'source', v_source,
       'source_message_id', v_message
     ));

  return v_id;
end;
$fn$;

create or replace function public.wa_create_whole_animal_procurement_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_animal_type text,
  p_animal_count integer,
  p_purchase_total numeric,
  p_supplier_name text default null,
  p_payment_method text default null,
  p_occurred_at timestamptz default now(),
  p_source_message_id text default null,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_whole_animal_procurement_draft(
    p_animal_type, p_animal_count, p_purchase_total, p_supplier_name,
    p_payment_method, p_occurred_at, 'whatsapp', p_source_message_id,
    p_reference, p_note
  );
end;
$fn$;

revoke all on function public.create_whole_animal_procurement_draft(
  text, integer, numeric, text, text, timestamptz, text, text, text, text
) from public, anon;
grant execute on function public.create_whole_animal_procurement_draft(
  text, integer, numeric, text, text, timestamptz, text, text, text, text
) to authenticated;

revoke all on function public.wa_create_whole_animal_procurement_draft(
  uuid, uuid, text, integer, numeric, text, text, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.wa_create_whole_animal_procurement_draft(
  uuid, uuid, text, integer, numeric, text, text, timestamptz, text, text, text
) to service_role;
