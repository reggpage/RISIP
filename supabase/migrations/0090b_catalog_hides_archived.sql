create or replace function public.company_product_catalog(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_include_archived boolean default false
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
  estimated_margin   numeric,
  archived           boolean
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
      bool_or(s.quantity <> round(s.quantity) or s.unit is not null) as measured,
      (array_agg(s.description order by s.occurred_at desc))[1] as product_name,
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
  ),
  merged as (
    select
      coalesce(t.product_key, lc.product_key)                      as product_key,
      coalesce(t.product_name, lc.product_name)                    as product_name,
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
  )
  select m.*, (a.product_key is not null) as archived
  from merged m
  left join product_archives a
    on a.company_id = (select id from company) and a.product_key = m.product_key
  where p_include_archived or a.product_key is null
  order by coalesce(m.revenue, 0) desc, m.product_name;
$$;

revoke execute on function public.company_product_catalog(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.company_product_catalog(timestamptz, timestamptz, boolean) to authenticated;

-- The two-argument form is gone; drop it so nothing keeps calling the old shape.
drop function if exists public.company_product_catalog(timestamptz, timestamptz);

