-- The list of what this shop actually trades.
--
-- Until now there was no such list anywhere. Products existed only as free text
-- on daily_record_lines and as a key in product_costs, so nobody could open
-- Risip and see "here is everything I sell, here is what each costs me". The
-- profit estimate could name the products missing a buying price, which is how
-- the owner found out the list existed at all.
--
-- DERIVED, NOT A NEW TABLE. The catalogue is built from what has been sold plus
-- what has been priced. That is deliberate: a products table would immediately
-- disagree with the sales records the moment somebody typed a name slightly
-- differently, and there would be two answers to "what do I sell". Here there is
-- one, and it is the one the books already use.
--
-- KILOS AND PIECES. Some goods sell by weight, some by count. Nothing here
-- converts between them — 0078 explains why that is a project of its own. What
-- this does is REPORT which one a product behaves like, by looking at whether
-- its quantities have ever been fractional. Selling 2.5 of something means it is
-- measured; selling 2 and 3 and 1 means it is counted. The UI can then show
-- "2.5 kilo" and "3 vipande" instead of a bare number that means neither.
--
-- The unit label itself is whatever the trader typed on the buying price, and it
-- is descriptive only.
--
-- ROLLBACK
--   drop function public.company_product_catalog(timestamptz, timestamptz);

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
  -- Every confirmed sale line in the window. Pending and voided records are
  -- excluded for the same reason they are excluded from every other total.
  sold as (
    select
      lower(btrim(l.description)) as product_key,
      l.description,
      l.quantity,
      l.line_total,
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
      -- A fractional quantity anywhere means this is weighed or measured.
      bool_or(s.quantity <> round(s.quantity))   as measured,
      -- The most recent spelling the trader used, so the list reads the way
      -- they write rather than the way it was first typed months ago.
      (array_agg(s.description order by s.occurred_at desc))[1] as product_name
    from sold s
    group by s.product_key
  ),
  -- The buying price in force now: one row per product, latest wins. Same
  -- ordering as everywhere else, with created_at breaking a same-instant tie.
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
    lc.unit,
    coalesce(t.quantity_sold, 0)                                 as quantity_sold,
    coalesce(t.revenue, 0)                                       as revenue,
    coalesce(t.sale_lines, 0)                                    as sale_lines,
    t.last_sold_at,
    coalesce(t.measured, false)                                  as measured,
    lc.unit_cost,
    lc.effective_from                                            as cost_effective_from,
    case when coalesce(t.quantity_sold, 0) > 0
      then round(t.revenue / t.quantity_sold, 2) end             as avg_unit_price,
    -- Only when both halves are known. A margin computed from a missing cost
    -- would read as zero, which is a lie in the flattering direction.
    case when lc.unit_cost is not null and coalesce(t.quantity_sold, 0) > 0
      then round(t.revenue - (lc.unit_cost * t.quantity_sold), 2) end as estimated_margin
  -- A full join, so a product that has a price but no sales yet still appears,
  -- and so does one that sells but has never been priced. Those two gaps are
  -- exactly what the owner opens this page to find.
  from totals t
  full join latest_cost lc on lc.product_key = t.product_key
  where (select id from company) is not null
  order by coalesce(t.revenue, 0) desc, coalesce(t.product_name, lc.product_name);
$$;

revoke execute on function public.company_product_catalog(timestamptz, timestamptz) from public, anon;
grant execute on function public.company_product_catalog(timestamptz, timestamptz) to authenticated;
