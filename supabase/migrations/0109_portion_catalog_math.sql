-- Product reports must use the base-unit snapshots from 0108. Multiplying a
-- bucket cost by the number of quarter-litres sold is the exact unit mismatch
-- 0095 was written to prevent.

create or replace function public.company_product_catalog(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_include_archived boolean default false
)
returns table (
  product_key text,
  product_name text,
  unit text,
  quantity_sold numeric,
  revenue numeric,
  sale_lines integer,
  last_sold_at timestamptz,
  measured boolean,
  unit_cost numeric,
  cost_effective_from timestamptz,
  avg_unit_price numeric,
  estimated_margin numeric,
  archived boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with company as (select private.auth_company_id() as id),
  sold as (
    select
      private.product_key(l.description) as product_key,
      l.description,
      coalesce(l.stock_base_quantity, l.quantity) as base_quantity,
      l.line_total,
      nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') as unit,
      r.occurred_at
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    where r.company_id = (select id from company)
      and r.kind = 'sale'
      and r.status = 'confirmed'
      and (p_from is null or r.occurred_at >= p_from)
      and (p_to is null or r.occurred_at < p_to)
      and private.product_key(l.description) is not null
  ),
  totals as (
    select
      s.product_key,
      sum(s.base_quantity) as quantity_sold,
      sum(s.line_total) as revenue,
      count(*)::int as sale_lines,
      max(s.occurred_at) as last_sold_at,
      bool_or(s.base_quantity <> round(s.base_quantity) or s.unit is not null) as measured,
      (array_agg(s.description order by s.occurred_at desc))[1] as product_name,
      (array_agg(s.unit order by s.occurred_at desc)
        filter (where s.unit is not null))[1] as sold_unit
    from sold s
    group by s.product_key
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      c.base_unit,
      coalesce(c.base_unit_cost, c.unit_cost) as unit_cost,
      c.effective_from,
      c.product_name
    from public.product_costs c
    where c.company_id = (select id from company)
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  latest_stock as (
    select distinct on (private.product_key(s.product_key))
      private.product_key(s.product_key) as product_key,
      s.product_name, s.unit
    from public.stock_counts s
    where s.company_id = (select id from company)
      and private.product_key(s.product_key) is not null
    order by private.product_key(s.product_key), s.counted_at desc, s.created_at desc
  ),
  declared_base as (
    select u.product_key, u.product_name, u.unit_name
      from public.product_units u
     where u.company_id = (select id from company) and u.is_base
  ),
  keys as (
    select product_key from totals
    union select product_key from latest_cost
    union select product_key from latest_stock
    union select product_key from declared_base
  ),
  merged as (
    select
      k.product_key,
      coalesce(t.product_name, db.product_name, ls.product_name, lc.product_name) as product_name,
      coalesce(db.unit_name, ls.unit, lc.base_unit, t.sold_unit) as unit,
      coalesce(t.quantity_sold, 0) as quantity_sold,
      coalesce(t.revenue, 0) as revenue,
      coalesce(t.sale_lines, 0) as sale_lines,
      t.last_sold_at,
      coalesce(t.measured, db.unit_name is not null, ls.unit is not null, lc.base_unit is not null, false) as measured,
      lc.unit_cost,
      lc.effective_from as cost_effective_from,
      case when coalesce(t.quantity_sold, 0) > 0
        then round(t.revenue / t.quantity_sold, 2) end as avg_unit_price,
      case when lc.unit_cost is not null and coalesce(t.quantity_sold, 0) > 0
        then round(t.revenue - (lc.unit_cost * t.quantity_sold), 2) end as estimated_margin
    from keys k
    left join totals t on t.product_key = k.product_key
    left join latest_cost lc on lc.product_key = k.product_key
    left join latest_stock ls on ls.product_key = k.product_key
    left join declared_base db on db.product_key = k.product_key
    where (select id from company) is not null
  )
  select m.*, (a.product_key is not null) as archived
  from merged m
  left join public.product_archives a
    on a.company_id = (select id from company)
   and private.product_key(a.product_key) = m.product_key
  where p_include_archived or a.product_key is null
  order by coalesce(m.revenue, 0) desc, m.product_name;
$$;

revoke execute on function public.company_product_catalog(timestamptz, timestamptz, boolean)
  from public, anon;
grant execute on function public.company_product_catalog(timestamptz, timestamptz, boolean)
  to authenticated;

-- Legacy/default pricing stays one row per product. Declared portions are read
-- through wa_company_product_sale_units, where the requested unit is explicit.
create or replace function public.wa_product_pricing(
  p_company_id uuid,
  p_product_keys text[]
)
returns table (
  product_key text,
  retail_price numeric,
  wholesale_price numeric,
  wholesale_min_qty numeric,
  unit_cost numeric,
  avg_unit_price numeric,
  sold_quantity numeric
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with wanted as (
    select distinct private.product_key(k) as product_key
      from unnest(coalesce(p_product_keys, '{}'::text[])) as k
     where private.product_key(k) is not null
  ),
  latest_price as (
    select distinct on (private.product_key(s.product_key))
      private.product_key(s.product_key) as product_key,
      s.retail_price, s.wholesale_price, s.wholesale_min_qty
    from public.product_selling_prices s
    where s.company_id = p_company_id
      and s.sale_unit_key is null
    order by private.product_key(s.product_key), s.effective_from desc, s.created_at desc
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      coalesce(c.base_unit_cost, c.unit_cost) as unit_cost
    from public.product_costs c
    where c.company_id = p_company_id
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  achieved as (
    select
      private.product_key(l.description) as product_key,
      sum(coalesce(l.stock_base_quantity, l.quantity)) as sold_quantity,
      case when sum(coalesce(l.stock_base_quantity, l.quantity)) > 0
        then round(sum(l.line_total) / sum(coalesce(l.stock_base_quantity, l.quantity)), 2) end as avg_unit_price
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    where r.company_id = p_company_id
      and r.kind = 'sale'
      and r.status = 'confirmed'
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  )
  select
    w.product_key,
    p.retail_price,
    p.wholesale_price,
    p.wholesale_min_qty,
    c.unit_cost,
    a.avg_unit_price,
    coalesce(a.sold_quantity, 0)
  from wanted w
  left join latest_price p on p.product_key = w.product_key
  left join latest_cost c on c.product_key = w.product_key
  left join achieved a on a.product_key = w.product_key;
$$;

revoke all on function public.wa_product_pricing(uuid, text[]) from public, anon, authenticated;
grant execute on function public.wa_product_pricing(uuid, text[]) to service_role;
