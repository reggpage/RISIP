-- Kilos and litres, which until now could not be recorded at all.
--
-- MEASURED GAP, found by running the parser against real phrasings:
--
--   "nimeuza daftari 10 kila moja 1500"   -> a line: daftari x10 @ 1500   ✅
--   "nimeuza sukari 2.5 kilo kwa 7500"    -> NO LINE, just a total        ❌
--   "nimeuza mafuta lita 3 kwa 21000"     -> NO LINE, just a total        ❌
--
-- The products page reads daily_record_lines, so anything sold by weight or
-- volume never reached it. A bookshop did not notice; a grain, oil or meat shop
-- would open Products and find it EMPTY, with no explanation.
--
-- Two halves were missing. The parser could not read "2.5 kilo" (fixed in
-- whatsappDailyRecords.ts), and there was nowhere to put the word "kilo" once it
-- had — so this adds one.
--
-- STILL NO CONVERSION. `unit` is descriptive, exactly as it is on product_costs:
-- nothing here turns a gunia into kilos, because every trader's sack is a
-- different size. 0078 explains why that is a project of its own.
--
-- WHY THE CATALOGUE NEEDS IT. "3 lita kwa 21000" has a whole-number quantity, so
-- the fractional-quantity heuristic would call it counted and print "3 vipande"
-- for three litres of oil. A stated unit settles it: if the trader said a unit,
-- the product is measured and the unit is theirs to show.
--
-- ROLLBACK
--   alter table public.daily_record_lines drop column unit;
--   -- then restore the two function bodies from 0077 and 0086.

alter table public.daily_record_lines
  add column if not exists unit text;

alter table public.daily_record_lines
  drop constraint if exists daily_record_lines_unit_check;
alter table public.daily_record_lines
  add constraint daily_record_lines_unit_check
  check (unit is null or (length(btrim(unit)) between 1 and 20));

-- Recreated only to carry `unit` through to the insert. Every other line is
-- byte-for-byte the deployed 0077 body.
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
language plpgsql security definer
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
  if v_kind not in ('sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase') then
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
    if length(btrim(coalesce(v_line.value->>'unit', ''))) > 20 then
      raise exception 'a unit label is too long' using errcode = 'P0001', hint = 'invalid_lines';
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
      (daily_record_id, line_number, description, quantity, unit_amount, line_total, unit)
    values
      (v_id, v_line.ordinality::integer, btrim(v_line.value->>'description'),
       v_quantity, v_unit_amount, round(v_quantity * v_unit_amount, 2),
       nullif(btrim(coalesce(v_line.value->>'unit', '')), ''));
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

-- The catalogue now prefers a unit the trader actually said, and treats a stated
-- unit as proof the product is measured. Without this, three litres of oil would
-- be printed as "3 vipande" because the quantity happens to be whole.
create or replace function public.company_product_catalog(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  product_key        text,
  product_name       text,
  unit               text,
  quantity_sold      numeric,
  revenue            numeric,
  sale_lines         integer,
  last_sold_at       timestamptz,
  measured           boolean,
  unit_cost          numeric,
  cost_effective_from timestamptz,
  avg_unit_price     numeric,
  estimated_margin   numeric
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with company as (
    select private.auth_company_id() as id
  ),
  sold as (
    select
      lower(btrim(l.description)) as product_key,
      l.description,
      l.quantity,
      l.line_total,
      nullif(btrim(coalesce(l.unit, '')), '') as unit,
      r.occurred_at
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
    where r.company_id = (select id from company)
      and r.kind = 'sale'
      and r.status = 'confirmed'
      and (p_from is null or r.occurred_at >= p_from)
      and (p_to   is null or r.occurred_at <  p_to)
      and length(btrim(l.description)) > 0
  ),
  totals as (
    select
      s.product_key,
      sum(s.quantity)                            as quantity_sold,
      sum(s.line_total)                          as revenue,
      count(*)::int                              as sale_lines,
      max(s.occurred_at)                         as last_sold_at,
      -- Measured if a quantity was ever fractional, OR the trader named a unit.
      bool_or(s.quantity <> round(s.quantity) or s.unit is not null) as measured,
      (array_agg(s.description order by s.occurred_at desc))[1] as product_name,
      -- The most recent unit they used, ignoring the sales where they said none.
      (array_agg(s.unit order by s.occurred_at desc)
         filter (where s.unit is not null))[1]   as sold_unit
    from sold s
    group by s.product_key
  ),
  latest_cost as (
    select distinct on (c.product_key)
      c.product_key, c.unit, c.unit_cost, c.effective_from, c.product_name
    from product_costs c
    where c.company_id = (select id from company)
    order by c.product_key, c.effective_from desc, c.created_at desc
  )
  select
    coalesce(t.product_key, lc.product_key)                      as product_key,
    coalesce(t.product_name, lc.product_name)                    as product_name,
    -- The buying price wins, because that is where the trader deliberately typed
    -- a unit; the sale unit fills in when they never set one.
    coalesce(lc.unit, t.sold_unit)                               as unit,
    coalesce(t.quantity_sold, 0)                                 as quantity_sold,
    coalesce(t.revenue, 0)                                       as revenue,
    coalesce(t.sale_lines, 0)                                    as sale_lines,
    t.last_sold_at,
    coalesce(t.measured, lc.unit is not null, false)             as measured,
    lc.unit_cost,
    lc.effective_from                                            as cost_effective_from,
    case when coalesce(t.quantity_sold, 0) > 0
      then round(t.revenue / t.quantity_sold, 2) end             as avg_unit_price,
    case when lc.unit_cost is not null and coalesce(t.quantity_sold, 0) > 0
      then round(t.revenue - (lc.unit_cost * t.quantity_sold), 2) end as estimated_margin
  from totals t
  full join latest_cost lc on lc.product_key = t.product_key
  where (select id from company) is not null
  order by coalesce(t.revenue, 0) desc, coalesce(t.product_name, lc.product_name);
$$;

revoke execute on function public.company_product_catalog(timestamptz, timestamptz) from public, anon;
grant execute on function public.company_product_catalog(timestamptz, timestamptz) to authenticated;
