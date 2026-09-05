-- Phase 9 reporting integrity correction.
--
-- One read model serves WhatsApp and the owner/accountant dashboard. It reads
-- confirmed, non-voided ledger facts only. Financial arithmetic stays in SQL;
-- the language model may explain these facts but may not calculate or invent
-- them.
--
-- ROLLBACK:
-- Re-apply the function definitions from 0137_bucha_reporting_snapshot.sql and
-- then re-apply 0158_worker_read_company_reports.sql only if the old worker-wide
-- reporting access is intentionally restored. Drop the two indexes below only
-- after checking query plans.

create index if not exists daily_records_confirmed_reporting_idx
  on public.daily_records(company_id, kind, occurred_at desc)
  where status = 'confirmed';

create index if not exists whole_animal_outputs_breakdown_idx
  on public.whole_animal_breakdown_outputs(breakdown_daily_record_id, line_number);

create or replace function public.daily_profit_estimate(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_sales numeric := 0;
  v_expenses numeric := 0;
  v_stock_purchases numeric := 0;
  v_losses numeric := 0;
  v_owner_use numeric := 0;
  v_unvalued_losses integer := 0;
  v_cogs numeric := 0;
  v_costed_sales numeric := 0;
  v_uncosted_lines integer := 0;
  v_missing text[] := '{}';
begin
  if v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company profit'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'profit range is invalid' using errcode = 'P0001', hint = 'invalid_range';
  end if;

  select
    coalesce(sum(amount) filter (where kind in ('sale', 'debt_issued')), 0),
    coalesce(sum(amount) filter (where kind = 'expense'), 0),
    coalesce(sum(amount) filter (where kind in ('stock_purchase', 'supplier_payable')), 0),
    coalesce(sum(amount) filter (where kind = 'stock_loss'), 0),
    coalesce(sum(amount) filter (where kind = 'owner_use'), 0),
    count(*) filter (where kind = 'stock_loss' and amount = 0)
  into v_sales, v_expenses, v_stock_purchases, v_losses, v_owner_use, v_unvalued_losses
  from public.daily_records
  where company_id = v_company
    and status = 'confirmed'
    and occurred_at >= p_from and occurred_at < p_to;

  with sale_lines as (
    select l.description,
           coalesce(l.stock_base_quantity, l.quantity) as base_quantity,
           l.line_total,
           d.occurred_at
    from public.daily_records d
    join public.daily_record_lines l on l.daily_record_id = d.id
    where d.company_id = v_company
      and d.status = 'confirmed'
      and d.kind in ('sale', 'debt_issued')
      and d.occurred_at >= p_from and d.occurred_at < p_to
  ), costed as (
    select sl.*,
      (
        select coalesce(pc.base_unit_cost, pc.unit_cost)
        from public.product_costs pc
        where pc.company_id = v_company
          and private.product_key(pc.product_key) = private.product_key(sl.description)
          and pc.effective_from <= sl.occurred_at
        order by pc.effective_from desc, pc.created_at desc
        limit 1
      ) as base_unit_cost
    from sale_lines sl
  )
  select
    coalesce(sum(base_quantity * base_unit_cost) filter (where base_unit_cost is not null), 0),
    coalesce(sum(line_total) filter (where base_unit_cost is not null), 0),
    count(*) filter (where base_unit_cost is null),
    coalesce(array_agg(distinct description order by description)
      filter (where base_unit_cost is null), '{}')
  into v_cogs, v_costed_sales, v_uncosted_lines, v_missing
  from costed;

  return jsonb_build_object(
    'sales', v_sales,
    'expenses', v_expenses,
    'stock_purchases', v_stock_purchases,
    'stock_losses', v_losses,
    'unvalued_stock_losses', v_unvalued_losses,
    'stock_loss_valuation_complete', v_unvalued_losses = 0,
    'owner_use', v_owner_use,
    'cogs', round(v_cogs, 2),
    'costed_sales', v_costed_sales,
    'uncosted_sales', greatest(v_sales - v_costed_sales, 0),
    'coverage', case when v_sales > 0 then round(v_costed_sales / v_sales, 4) else 1 end,
    'uncosted_lines', v_uncosted_lines,
    'products_missing_cost', to_jsonb(v_missing),
    'gross_profit', round(v_sales - v_cogs, 2),
    'estimated_profit', round(v_sales - v_cogs - v_expenses - v_losses, 2),
    'known_margin_after_expenses', round(v_costed_sales - v_cogs - v_expenses - v_losses, 2),
    'valuation_complete', v_uncosted_lines = 0 and v_unvalued_losses = 0
  );
end;
$fn$;

revoke all on function public.daily_profit_estimate(timestamptz, timestamptz) from public, anon;
grant execute on function public.daily_profit_estimate(timestamptz, timestamptz) to authenticated;

create or replace function public.bucha_reporting_snapshot(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_from timestamptz := coalesce(
    p_from,
    date_trunc('day', now() at time zone 'Africa/Dar_es_Salaam')
      at time zone 'Africa/Dar_es_Salaam'
  );
  v_to timestamptz := coalesce(p_to, now());
  v_activity jsonb := '{}'::jsonb;
  v_methods jsonb := '{}'::jsonb;
  v_sales_items jsonb := '[]'::jsonb;
  v_receivables jsonb := '[]'::jsonb;
  v_payables jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_losses jsonb := '{}'::jsonb;
  v_owner_use jsonb := '{}'::jsonb;
  v_animals jsonb := '{}'::jsonb;
  v_profit jsonb := '{}'::jsonb;
  v_cash_movement numeric := 0;
begin
  if v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company reporting'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_to <= v_from then
    raise exception 'report range is invalid' using errcode = 'P0001', hint = 'invalid_range';
  end if;

  select jsonb_build_object(
    'sales', coalesce(sum(amount) filter (where kind in ('sale', 'debt_issued')), 0),
    'settled_sales', coalesce(sum(amount) filter (where kind = 'sale'), 0),
    'credit_sales', coalesce(sum(amount) filter (where kind = 'debt_issued'), 0),
    'expenses', coalesce(sum(amount) filter (where kind = 'expense'), 0),
    'customer_payments', coalesce(sum(amount) filter (where kind = 'customer_payment'), 0),
    'stock_purchases', coalesce(sum(amount) filter (where kind in ('stock_purchase', 'supplier_payable')), 0),
    'supplier_payments', coalesce(sum(amount) filter (where kind = 'supplier_payment'), 0),
    'whole_animal_cash', coalesce(sum(amount) filter (
      where kind = 'whole_animal_procurement' and payment_method is not null), 0)
  ) into v_activity
  from public.daily_records
  where company_id = v_company and status = 'confirmed'
    and occurred_at >= v_from and occurred_at < v_to;

  select coalesce(jsonb_object_agg(method, total), '{}'::jsonb)
  into v_methods
  from (
    select case
      when kind = 'debt_issued' then 'credit'
      when payment_method in ('cash', 'mobile_money', 'bank', 'other') then payment_method
      else 'unstated'
    end as method,
    sum(amount) as total
    from public.daily_records
    where company_id = v_company and status = 'confirmed'
      and kind in ('sale', 'debt_issued')
      and occurred_at >= v_from and occurred_at < v_to
    group by 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.product_name), '[]'::jsonb)
  into v_sales_items
  from (
    select max(l.description) as product_name,
      nullif(max(coalesce(l.unit, l.stock_base_unit)), '') as unit,
      sum(l.quantity) as quantity,
      sum(l.line_total) as total,
      case when sum(l.quantity) > 0 then round(sum(l.line_total) / sum(l.quantity), 2) end as average_unit_price
    from public.daily_records r
    join public.daily_record_lines l on l.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed'
      and r.kind in ('sale', 'debt_issued')
      and r.occurred_at >= v_from and r.occurred_at < v_to
    group by private.product_key(l.description), private.product_key(coalesce(l.unit, l.stock_base_unit))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.outstanding desc, x.party_name), '[]'::jsonb)
  into v_receivables
  from (
    select max(btrim(party_name)) as party_name,
      sum(amount) filter (where kind = 'debt_issued') as issued,
      coalesce(sum(amount) filter (where kind = 'customer_payment'), 0) as paid,
      sum(case when kind = 'debt_issued' then amount else -amount end) as outstanding
    from public.daily_records
    where company_id = v_company and status = 'confirmed'
      and party_name is not null and kind in ('debt_issued', 'customer_payment')
    group by private.product_key(party_name)
    having sum(case when kind = 'debt_issued' then amount else -amount end) > 0
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.outstanding desc, x.supplier_name), '[]'::jsonb)
  into v_payables
  from (
    select max(btrim(party_name)) as supplier_name,
      sum(amount) filter (where kind in ('supplier_payable', 'whole_animal_procurement')) as payable,
      coalesce(sum(amount) filter (where kind = 'supplier_payment'), 0) as payments,
      sum(case when kind in ('supplier_payable', 'whole_animal_procurement') then amount else -amount end) as outstanding
    from public.daily_records
    where company_id = v_company and status = 'confirmed' and party_name is not null
      and kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
      and (kind <> 'whole_animal_procurement' or payment_method is null)
    group by private.product_key(party_name)
    having sum(case when kind in ('supplier_payable', 'whole_animal_procurement') then amount else -amount end) > 0
  ) x;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.product_name), '[]'::jsonb)
  into v_stock from public.wa_stock_on_hand(v_company, null) s;

  with records as (
    select coalesce(sum(amount), 0) as amount,
      count(*) as events,
      count(*) filter (where amount = 0) as unvalued_events
    from public.daily_records
    where company_id = v_company and status = 'confirmed' and kind = 'stock_loss'
      and occurred_at >= v_from and occurred_at < v_to
  ), lines as (
    select coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)), 0) as quantity,
      coalesce(jsonb_agg(jsonb_build_object(
        'product_name', l.description,
        'quantity', coalesce(l.stock_base_quantity, l.quantity),
        'unit', coalesce(l.stock_base_unit, l.unit),
        'value', l.line_total,
        'reason', r.loss_reason,
        'occurred_at', r.occurred_at
      ) order by r.occurred_at desc, l.line_number), '[]'::jsonb) as details
    from public.daily_records r
    join public.daily_record_lines l on l.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed' and r.kind = 'stock_loss'
      and r.occurred_at >= v_from and r.occurred_at < v_to
  )
  select jsonb_build_object(
    'amount', records.amount, 'events', records.events,
    'unvalued_events', records.unvalued_events,
    'quantity', lines.quantity,
    'valuation_complete', records.unvalued_events = 0,
    'details', lines.details
  ) into v_losses from records cross join lines;

  with records as (
    select coalesce(sum(amount), 0) as amount, count(*) as events
    from public.daily_records
    where company_id = v_company and status = 'confirmed' and kind = 'owner_use'
      and occurred_at >= v_from and occurred_at < v_to
  ), lines as (
    select coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)), 0) as quantity,
      coalesce(jsonb_agg(jsonb_build_object(
        'product_name', l.description,
        'quantity', coalesce(l.stock_base_quantity, l.quantity),
        'unit', coalesce(l.stock_base_unit, l.unit),
        'value', l.line_total,
        'occurred_at', r.occurred_at
      ) order by r.occurred_at desc, l.line_number), '[]'::jsonb) as details
    from public.daily_records r
    join public.daily_record_lines l on l.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed' and r.kind = 'owner_use'
      and r.occurred_at >= v_from and r.occurred_at < v_to
  )
  select jsonb_build_object(
    'amount', records.amount, 'events', records.events,
    'quantity', lines.quantity, 'details', lines.details
  ) into v_owner_use from records cross join lines;

  with sources as (
    select r.id, r.amount, r.occurred_at, p.animal_type, p.animal_count,
      exists (
        select 1 from public.whole_animal_breakdowns b
        join public.daily_records br on br.id = b.daily_record_id
        where b.source_procurement_daily_record_id = r.id and br.status = 'confirmed'
      ) as has_confirmed_breakdown
    from public.daily_records r
    join public.whole_animal_procurements p on p.daily_record_id = r.id
    where r.company_id = v_company and r.status = 'confirmed'
      and r.occurred_at >= v_from and r.occurred_at < v_to
  ), source_details as (
    select s.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'breakdown_daily_record_id', b.daily_record_id,
          'occurred_at', br.occurred_at,
          'cost_allocation_status', b.cost_allocation_status,
          'allocated_cost_total', b.allocated_cost_total,
          'outputs', coalesce((
            select jsonb_agg(jsonb_build_object(
              'product_name', o.product_name, 'quantity', o.quantity,
              'unit', o.unit_name, 'base_quantity', o.base_quantity,
              'base_unit', o.base_unit, 'allocated_cost', o.allocated_cost
            ) order by o.line_number)
            from public.whole_animal_breakdown_outputs o
            where o.breakdown_daily_record_id = b.daily_record_id
          ), '[]'::jsonb)
        ) order by br.occurred_at)
        from public.whole_animal_breakdowns b
        join public.daily_records br on br.id = b.daily_record_id
        where b.source_procurement_daily_record_id = s.id and br.status = 'confirmed'
      ), '[]'::jsonb) as breakdowns
    from sources s
  )
  select jsonb_build_object(
    'count', coalesce(sum(animal_count), 0),
    'procurement_events', count(*),
    'total', coalesce(sum(amount), 0),
    'pending_breakdown', coalesce(sum(animal_count) filter (where not has_confirmed_breakdown), 0),
    'breakdown_outputs', coalesce((
      select sum(o.base_quantity)
      from public.whole_animal_breakdown_outputs o
      join public.whole_animal_breakdowns b on b.daily_record_id = o.breakdown_daily_record_id
      join public.daily_records br on br.id = b.daily_record_id
      where br.status = 'confirmed'
        and b.source_procurement_daily_record_id in (select id from sources)
    ), 0),
    'allocation_incomplete', coalesce((
      select count(*)
      from public.whole_animal_breakdowns b
      join public.daily_records br on br.id = b.daily_record_id
      where br.status = 'confirmed' and b.cost_allocation_status = 'incomplete'
        and b.source_procurement_daily_record_id in (select id from sources)
    ), 0),
    'procurements', coalesce(jsonb_agg(jsonb_build_object(
      'daily_record_id', id, 'animal_type', animal_type,
      'animal_count', animal_count, 'purchase_total', amount,
      'occurred_at', occurred_at,
      'breakdown_status', case when has_confirmed_breakdown then 'confirmed' else 'pending' end,
      'breakdowns', breakdowns
    ) order by occurred_at desc), '[]'::jsonb)
  ) into v_animals from source_details;

  v_profit := public.daily_profit_estimate(v_from, v_to);
  v_cash_movement :=
    coalesce((v_methods->>'cash')::numeric, 0)
    + coalesce((select sum(amount) from public.daily_records where company_id = v_company
      and status = 'confirmed' and kind = 'customer_payment' and payment_method = 'cash'
      and occurred_at >= v_from and occurred_at < v_to), 0)
    - coalesce((select sum(amount) from public.daily_records where company_id = v_company
      and status = 'confirmed' and kind in ('expense', 'stock_purchase', 'supplier_payment', 'whole_animal_procurement')
      and payment_method = 'cash' and occurred_at >= v_from and occurred_at < v_to), 0);

  return jsonb_build_object(
    'timezone', 'Africa/Dar_es_Salaam', 'from', v_from, 'to', v_to,
    'sales', jsonb_build_object(
      'total', (v_activity->>'sales')::numeric,
      'settled_sales', (v_activity->>'settled_sales')::numeric,
      'cash_sales', coalesce((v_methods->>'cash')::numeric, 0),
      'credit_sales', (v_activity->>'credit_sales')::numeric,
      'by_payment_method', v_methods,
      'items', v_sales_items
    ),
    'expenses', (v_activity->>'expenses')::numeric,
    'customer_payments', (v_activity->>'customer_payments')::numeric,
    'stock_purchases', (v_activity->>'stock_purchases')::numeric,
    'supplier_payments', (v_activity->>'supplier_payments')::numeric,
    'whole_animal_cash_purchases', (v_activity->>'whole_animal_cash')::numeric,
    'cash_movement', v_cash_movement,
    'profit', v_profit,
    'customer_receivables', v_receivables,
    'supplier_payables', v_payables,
    'stock', v_stock,
    'stock_loss', v_losses,
    'owner_use', v_owner_use,
    'whole_animals', v_animals
  );
end;
$fn$;

revoke all on function public.bucha_reporting_snapshot(timestamptz, timestamptz) from public, anon;
grant execute on function public.bucha_reporting_snapshot(timestamptz, timestamptz) to authenticated;

create or replace function public.wa_bucha_reporting_snapshot(
  p_profile_id uuid,
  p_company_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_role public.user_role;
  v_company uuid;
begin
  select p.active_company_id, m.role into v_company, v_role
  from public.profiles p
  join public.company_members m on m.profile_id = p.id
    and m.company_id = p.active_company_id and m.deactivated_at is null
  where p.id = p_profile_id and p.deactivated_at is null;

  if v_company is null or v_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company reporting'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.bucha_reporting_snapshot(p_from, p_to);
end;
$fn$;

revoke all on function public.wa_bucha_reporting_snapshot(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.wa_bucha_reporting_snapshot(uuid, uuid, timestamptz, timestamptz)
  to service_role;
