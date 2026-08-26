-- RISIP BUCHA, PHASE 7 — actual measured outputs from one confirmed animal.
-- This is a transformation event, not another cash purchase and not a
-- prediction. No output is visible in stock until the event is confirmed.

alter table public.daily_records drop constraint if exists daily_records_kind_check;
alter table public.daily_records add constraint daily_records_kind_check check (
  kind = any (array[
    'sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase',
    'stock_loss', 'owner_use', 'supplier_payable', 'supplier_payment',
    'whole_animal_procurement', 'whole_animal_breakdown'
  ])
);

create table if not exists public.whole_animal_breakdowns (
  daily_record_id uuid primary key
    references public.daily_records(id) on delete restrict,
  source_procurement_daily_record_id uuid not null
    references public.daily_records(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  purchase_total_snapshot numeric(14,2) not null,
  cost_allocation_status text not null default 'incomplete',
  allocated_cost_total numeric(14,2),
  occurred_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint whole_animal_breakdown_cost_status_check
    check (cost_allocation_status in ('incomplete', 'allocated')),
  constraint whole_animal_breakdown_snapshot_check
    check (purchase_total_snapshot > 0 and purchase_total_snapshot <= 100000000),
  constraint whole_animal_breakdown_allocated_check
    check (allocated_cost_total is null or allocated_cost_total >= 0)
);

create index if not exists whole_animal_breakdowns_source_idx
  on public.whole_animal_breakdowns(source_procurement_daily_record_id);
create index if not exists whole_animal_breakdowns_company_occurred_idx
  on public.whole_animal_breakdowns(company_id, occurred_at desc);

create table if not exists public.whole_animal_breakdown_outputs (
  id uuid primary key default gen_random_uuid(),
  breakdown_daily_record_id uuid not null
    references public.whole_animal_breakdowns(daily_record_id) on delete restrict,
  line_number integer not null,
  product_key text not null,
  product_name text not null,
  unit_key text not null,
  unit_name text not null,
  quantity numeric(18,6) not null,
  base_quantity numeric(18,6) not null,
  base_unit text not null,
  allocated_cost numeric(14,2),
  created_at timestamptz not null default clock_timestamp(),
  constraint whole_animal_breakdown_output_line_check check (line_number between 1 and 50),
  constraint whole_animal_breakdown_output_quantity_check check (quantity > 0 and base_quantity > 0),
  constraint whole_animal_breakdown_output_names_check check (
    length(btrim(product_key)) >= 2 and length(btrim(product_name)) >= 2
    and length(btrim(unit_key)) >= 1 and length(btrim(unit_name)) >= 1
    and length(btrim(base_unit)) >= 1
  ),
  constraint whole_animal_breakdown_output_cost_check check (allocated_cost is null or allocated_cost >= 0),
  unique (breakdown_daily_record_id, line_number),
  unique (breakdown_daily_record_id, product_key, unit_key)
);

alter table public.whole_animal_breakdowns enable row level security;
alter table public.whole_animal_breakdown_outputs enable row level security;

drop policy if exists whole_animal_breakdowns_select_visible on public.whole_animal_breakdowns;
create policy whole_animal_breakdowns_select_visible
  on public.whole_animal_breakdowns for select to authenticated
  using (
    company_id = private.auth_company_id()
    and exists (
      select 1 from public.daily_records r
       where r.id = daily_record_id
         and (private.auth_role() in ('owner', 'accountant') or r.recorded_by = auth.uid())
    )
  );

drop policy if exists whole_animal_breakdown_outputs_select_visible on public.whole_animal_breakdown_outputs;
create policy whole_animal_breakdown_outputs_select_visible
  on public.whole_animal_breakdown_outputs for select to authenticated
  using (
    exists (
      select 1
        from public.whole_animal_breakdowns b
        join public.daily_records r on r.id = b.daily_record_id
       where b.daily_record_id = breakdown_daily_record_id
         and b.company_id = private.auth_company_id()
         and (private.auth_role() in ('owner', 'accountant') or r.recorded_by = auth.uid())
    )
  );

revoke all on public.whole_animal_breakdowns, public.whole_animal_breakdown_outputs from public, anon;
grant select on public.whole_animal_breakdowns, public.whole_animal_breakdown_outputs to authenticated;

comment on table public.whole_animal_breakdowns is
  'One confirmed whole-animal procurement transformed into actual measured outputs. Costs remain at source level until a configured allocation basis exists.';
comment on table public.whole_animal_breakdown_outputs is
  'Server-validated actual output snapshots. Confirmed rows feed stock; pending and voided parent records do not.';

create or replace function public.wa_list_available_whole_animal_procurements(
  p_profile_id uuid,
  p_company_id uuid
)
returns table(
  daily_record_id uuid,
  animal_type text,
  animal_count integer,
  purchase_total numeric,
  occurred_at timestamptz
)
language plpgsql
stable
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

  return query
  select r.id, p.animal_type, p.animal_count, p.purchase_total_snapshot, r.occurred_at
    from public.daily_records r
    join public.whole_animal_procurements p on p.daily_record_id = r.id
   where r.company_id = p_company_id
     and r.kind = 'whole_animal_procurement'
     and r.status = 'confirmed'
     and not exists (
       select 1
         from public.whole_animal_breakdowns b
         join public.daily_records br on br.id = b.daily_record_id
        where b.source_procurement_daily_record_id = r.id
          and br.status <> 'voided'
     )
   order by r.occurred_at desc, r.created_at desc;
end;
$fn$;

create or replace function public.wa_create_whole_animal_breakdown_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_source_procurement_daily_record_id uuid,
  p_outputs jsonb,
  p_occurred_at timestamptz default now(),
  p_source_message_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
  v_actor uuid := p_profile_id;
  v_source public.daily_records%rowtype;
  v_existing public.daily_records%rowtype;
  v_currency text;
  v_id uuid;
  v_breakdown_count integer;
  v_output jsonb;
  v_line integer;
  v_candidate text;
  v_unit_candidate text;
  v_quantity numeric;
  v_product_key text;
  v_product_name text;
  v_unit_key text;
  v_unit_name text;
  v_base_unit text;
  v_unit_base_quantity numeric;
  v_seen text[] := '{}';
  v_seen_key text;
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
  if jsonb_typeof(p_outputs) <> 'array' or jsonb_array_length(p_outputs) < 1
     or jsonb_array_length(p_outputs) > 50 then
    raise exception 'breakdown needs between 1 and 50 measured outputs'
      using errcode = 'P0001', hint = 'invalid_outputs';
  end if;

  if nullif(btrim(coalesce(p_source_message_id, '')), '') is not null then
    select * into v_existing
      from public.daily_records r
     where r.company_id = p_company_id
       and r.source_message_id = nullif(btrim(p_source_message_id), '');
    if found then
      if v_existing.kind <> 'whole_animal_breakdown' then
        raise exception 'source message belongs to another record'
          using errcode = 'P0001', hint = 'idempotency_conflict';
      end if;
      return v_existing.id;
    end if;
  end if;

  select * into v_source
    from public.daily_records r
   where r.id = p_source_procurement_daily_record_id
   for update;
  if not found or v_source.company_id <> p_company_id
     or v_source.kind <> 'whole_animal_procurement' then
    raise exception 'whole-animal procurement source was not found'
      using errcode = 'P0001', hint = 'source_not_found';
  end if;
  if v_source.status <> 'confirmed' then
    raise exception 'only a confirmed whole-animal procurement can be broken down'
      using errcode = 'P0001', hint = 'source_not_confirmed';
  end if;
  if exists (
    select 1
      from public.whole_animal_breakdowns b
      join public.daily_records br on br.id = b.daily_record_id
     where b.source_procurement_daily_record_id = v_source.id
       and br.status <> 'voided'
  ) then
    raise exception 'this whole-animal procurement already has an active breakdown'
      using errcode = 'P0001', hint = 'source_already_broken_down';
  end if;

  select c.currency into v_currency from public.companies c where c.id = p_company_id;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  v_line := 0;
  for v_output in select value from jsonb_array_elements(p_outputs) loop
    v_line := v_line + 1;
    v_candidate := nullif(btrim(coalesce(v_output->>'product_key', v_output->>'product_name', '')), '');
    v_unit_candidate := nullif(btrim(coalesce(v_output->>'unit_key', v_output->>'unit', '')), '');
    if v_candidate is null then
      raise exception 'every breakdown output needs a product name' using errcode = 'P0001', hint = 'product_required';
    end if;
    if v_unit_candidate is null then
      raise exception 'every breakdown output needs a measured unit' using errcode = 'P0001', hint = 'unit_required';
    end if;
    begin
      v_quantity := (v_output->>'quantity')::numeric;
    exception when invalid_text_representation then
      raise exception 'every breakdown output needs a numeric quantity'
        using errcode = 'P0001', hint = 'quantity_required';
    end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 1000000 then
      raise exception 'every breakdown output needs a positive measured quantity'
        using errcode = 'P0001', hint = 'quantity_required';
    end if;

    select u.product_key, u.product_name, u.unit_key, u.unit_name,
           u.base_quantity, b.unit_name
      into v_product_key, v_product_name, v_unit_key, v_unit_name,
           v_unit_base_quantity, v_base_unit
      from public.product_units u
      join public.product_units b
        on b.company_id = u.company_id
       and b.product_key = u.product_key
       and b.is_base
     where u.company_id = p_company_id
       and (u.product_key = private.product_key(v_candidate)
            or private.product_key(u.product_name) = private.product_key(v_candidate))
       and (u.unit_key = private.product_key(v_unit_candidate)
            or private.product_key(u.unit_name) = private.product_key(v_unit_candidate))
       and u.can_count
     limit 1;
    if v_product_key is null then
      raise exception 'output product or measured unit is not configured for this company'
        using errcode = 'P0001', hint = 'unknown_product_or_unit';
    end if;
    v_seen_key := v_product_key || '|' || v_unit_key;
    if v_seen_key = any(v_seen) then
      raise exception 'the same product and unit cannot appear twice in one breakdown'
        using errcode = 'P0001', hint = 'duplicate_output';
    end if;
    v_seen := array_append(v_seen, v_seen_key);
  end loop;

  insert into public.daily_records
    (company_id, recorded_by, source, source_message_id, kind, status, amount,
     currency, description, occurred_at)
  values
    (p_company_id, v_actor, 'whatsapp', nullif(btrim(p_source_message_id), ''),
     'whole_animal_breakdown', 'pending_confirmation', v_source.amount,
     v_currency, 'Breakdown ya ' || coalesce(v_source.description, 'ng''ombe mzima'),
     coalesce(p_occurred_at, now()))
  returning id into v_id;

  insert into public.whole_animal_breakdowns
    (daily_record_id, source_procurement_daily_record_id, company_id,
     purchase_total_snapshot, cost_allocation_status, allocated_cost_total,
     occurred_at, created_by)
  values
    (v_id, v_source.id, p_company_id, v_source.amount, 'incomplete', null,
     coalesce(p_occurred_at, now()), v_actor);

  v_line := 0;
  for v_output in select value from jsonb_array_elements(p_outputs) loop
    v_line := v_line + 1;
    v_candidate := nullif(btrim(coalesce(v_output->>'product_key', v_output->>'product_name', '')), '');
    v_unit_candidate := nullif(btrim(coalesce(v_output->>'unit_key', v_output->>'unit', '')), '');
    v_quantity := (v_output->>'quantity')::numeric;
    select u.product_key, u.product_name, u.unit_key, u.unit_name,
           u.base_quantity, b.unit_name
      into v_product_key, v_product_name, v_unit_key, v_unit_name,
           v_unit_base_quantity, v_base_unit
      from public.product_units u
      join public.product_units b
        on b.company_id = u.company_id
       and b.product_key = u.product_key
       and b.is_base
     where u.company_id = p_company_id
       and (u.product_key = private.product_key(v_candidate)
            or private.product_key(u.product_name) = private.product_key(v_candidate))
       and (u.unit_key = private.product_key(v_unit_candidate)
            or private.product_key(u.unit_name) = private.product_key(v_unit_candidate))
       and u.can_count
     limit 1;
    insert into public.whole_animal_breakdown_outputs
      (breakdown_daily_record_id, line_number, product_key, product_name,
       unit_key, unit_name, quantity, base_quantity, base_unit, allocated_cost)
    values
      (v_id, v_line, v_product_key, v_product_name, v_unit_key, v_unit_name,
       v_quantity, round(v_quantity * v_unit_base_quantity, 6), v_base_unit, null);
  end loop;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, p_company_id, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', 'whole_animal_breakdown',
       'source_procurement_daily_record_id', v_source.id,
       'purchase_total_snapshot', v_source.amount,
       'cost_allocation_status', 'incomplete',
       'output_count', jsonb_array_length(p_outputs),
       'source_message_id', nullif(btrim(p_source_message_id), '')
     ));
  return v_id;
end;
$fn$;

revoke all on function public.wa_list_available_whole_animal_procurements(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wa_list_available_whole_animal_procurements(uuid, uuid) to service_role;
revoke all on function public.wa_create_whole_animal_breakdown_draft(uuid, uuid, uuid, jsonb, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.wa_create_whole_animal_breakdown_draft(uuid, uuid, uuid, jsonb, timestamptz, text) to service_role;

-- Configured units are part of the company catalogue even before a product has
-- a purchase or sale line. This lets the WhatsApp resolver explain an unknown
-- breakdown output before the atomic RPC is called.
create or replace function public.company_product_names(p_company_id uuid)
returns table (product_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with sold as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id and r.kind = 'sale' and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  bought as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id and r.kind = 'stock_purchase' and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  configured as (
    select distinct on (u.product_key) u.product_name as name
      from product_units u where u.company_id = p_company_id
     order by u.product_key, u.is_base desc, u.created_at desc
  ),
  priced as (
    select distinct on (private.product_key(c.product_key)) c.product_name as name
      from product_costs c where c.company_id = p_company_id
     order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  everything as (
    select name from sold union select name from bought union
    select name from configured union select name from priced
  )
  select distinct on (private.product_key(name)) name
    from everything where private.product_key(name) is not null
   order by private.product_key(name), name limit 500;
$$;

revoke execute on function public.company_product_names(uuid) from public, anon, authenticated;
grant execute on function public.company_product_names(uuid) to authenticated, service_role;

-- Existing stock functions expose the produced movement separately. This keeps
-- dashboards honest: an output is stock in, not a purchase and not cash out.
drop function if exists public.wa_stock_on_hand(uuid, text);
create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null::text)
returns table(
  product_name text, unit text, measured boolean, on_hand numeric, has_count boolean,
  counted_at timestamptz, bought_since numeric, sold_since numeric,
  lost_since numeric, taken_since numeric, produced_since numeric, incomplete_purchases boolean
)
language sql stable security definer set search_path to 'pg_catalog', 'public'
as $fn$
  with last_count as (
    select distinct on (product_key) product_key, product_name, quantity, unit, counted_at
      from public.stock_counts where company_id = p_company_id
     order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_purchase'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('sale', 'debt_issued')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_loss'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'owner_use'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since,
      0::numeric as produced_since
      from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
      left join last_count lc on lc.product_key = private.product_key(l.description)
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use')
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
    union all
    select o.product_key, max(o.product_name), max(o.base_unit), true,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      coalesce(sum(o.base_quantity) filter (where lc.counted_at is null or r.occurred_at > lc.counted_at), 0)
      from public.whole_animal_breakdown_outputs o
      join public.daily_records r on r.id = o.breakdown_daily_record_id
      left join last_count lc on lc.product_key = o.product_key
     where r.company_id = p_company_id and r.status = 'confirmed'
     group by o.product_key
  ),
  grouped as (
    select product_key, max(product_name) as product_name, max(unit) as unit,
      bool_or(measured) as measured, sum(bought_since) as bought_since,
      sum(sold_since) as sold_since, sum(lost_since) as lost_since,
      sum(taken_since) as taken_since, sum(produced_since) as produced_since
      from movement group by product_key
  ),
  bare as (
    select count(*) > 0 as any_bare from public.daily_records r
     where r.company_id = p_company_id and r.status = 'confirmed' and r.kind = 'stock_purchase'
       and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select coalesce(g.product_name, lc.product_name), coalesce(lc.unit, g.unit),
    coalesce(g.measured, lc.unit is not null, false),
    coalesce(lc.quantity, 0) + coalesce(g.bought_since, 0) + coalesce(g.produced_since, 0)
      - coalesce(g.sold_since, 0) - coalesce(g.lost_since, 0) - coalesce(g.taken_since, 0),
    lc.product_key is not null, lc.counted_at, coalesce(g.bought_since, 0),
    coalesce(g.sold_since, 0), coalesce(g.lost_since, 0), coalesce(g.taken_since, 0),
    coalesce(g.produced_since, 0), (select any_bare from bare)
    from grouped g full join last_count lc on lc.product_key = g.product_key
   where p_product is null or private.product_key(coalesce(g.product_key, lc.product_key)) = private.product_key(p_product)
   order by coalesce(g.product_name, lc.product_name) limit 500;
$fn$;
grant execute on function public.wa_stock_on_hand(uuid, text) to service_role;

drop function if exists public.company_stock_on_hand();
create or replace function public.company_stock_on_hand()
returns table(
  product_key text, product_name text, unit text, measured boolean,
  counted_qty numeric, counted_at timestamptz, has_count boolean,
  bought_since numeric, sold_since numeric, lost_since numeric, taken_since numeric,
  produced_since numeric, on_hand numeric, incomplete_purchases boolean
)
language sql stable security definer set search_path to 'pg_catalog', 'public'
as $fn$
  with company as (select private.auth_company_id() as id),
  last_count as (
    select distinct on (product_key) product_key, product_name, quantity, unit, counted_at
      from public.stock_counts where company_id = (select id from company)
     order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_purchase'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('sale', 'debt_issued')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_loss'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'owner_use'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since,
      0::numeric as produced_since
      from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
      left join last_count lc on lc.product_key = private.product_key(l.description)
     where r.company_id = (select id from company) and r.status = 'confirmed'
       and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use')
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
    union all
    select o.product_key, max(o.product_name), max(o.base_unit), true,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      coalesce(sum(o.base_quantity) filter (where lc.counted_at is null or r.occurred_at > lc.counted_at), 0)
      from public.whole_animal_breakdown_outputs o
      join public.daily_records r on r.id = o.breakdown_daily_record_id
      left join last_count lc on lc.product_key = o.product_key
     where r.company_id = (select id from company) and r.status = 'confirmed'
     group by o.product_key
  ),
  grouped as (
    select product_key, max(product_name) as product_name, max(unit) as unit,
      bool_or(measured) as measured, sum(bought_since) as bought_since,
      sum(sold_since) as sold_since, sum(lost_since) as lost_since,
      sum(taken_since) as taken_since, sum(produced_since) as produced_since
      from movement group by product_key
  ),
  bare as (
    select count(*) > 0 as any_bare from public.daily_records r
     where r.company_id = (select id from company) and r.status = 'confirmed' and r.kind = 'stock_purchase'
       and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select coalesce(g.product_key, lc.product_key), coalesce(g.product_name, lc.product_name),
    coalesce(lc.unit, g.unit), coalesce(g.measured, lc.unit is not null, false),
    lc.quantity, lc.counted_at, lc.product_key is not null, coalesce(g.bought_since, 0),
    coalesce(g.sold_since, 0), coalesce(g.lost_since, 0), coalesce(g.taken_since, 0),
    coalesce(g.produced_since, 0), coalesce(lc.quantity, 0) + coalesce(g.bought_since, 0)
      + coalesce(g.produced_since, 0) - coalesce(g.sold_since, 0)
      - coalesce(g.lost_since, 0) - coalesce(g.taken_since, 0),
    (select any_bare from bare)
    from grouped g full join last_count lc on lc.product_key = g.product_key
   where (select id from company) is not null
   order by coalesce(g.product_name, lc.product_name);
$fn$;
revoke all on function public.company_stock_on_hand() from public, anon;
grant execute on function public.company_stock_on_hand() to authenticated;
