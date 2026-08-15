-- One spelling of a product name, decided in one place.
--
-- MEASURED, in production: "nguvu ya sala" and "- nguvu ya sala" are two
-- products because of ONE leading dash. The key was lower(btrim(description)),
-- and btrim only removes spaces — so a dash, a bullet, a stray full stop or a
-- doubled space each mint a brand new product that will never merge on its own.
--
-- Merging (0090) repairs a split after it happens. This stops the trivial ones
-- happening at all, and it does so retroactively: the catalogue re-groups by the
-- canonical key, so the dashed row folds into the real one with nothing to do.
--
-- WHAT IT NORMALISES, and nothing more:
--   case            Sukari  = sukari
--   edge punctuation  "- nguvu ya sala." = "nguvu ya sala"
--   inner whitespace  "daftari  kubwa"   = "daftari kubwa"
--
-- WHAT IT DELIBERATELY DOES NOT DO. No stemming, no plural folding, no
-- similarity. "Biblia" and "Bibilia" stay separate here, and so do "Biblia" and
-- "Biblia Kubwa" — which is the point: automatic fuzzy folding would eventually
-- merge two products that really are different, and silently move money between
-- them. Close-but-different names are a question to ask (see 0092), never a
-- decision to take.
--
-- ROLLBACK
--   -- restore company_product_catalog from 0090b and set_product_cost from 0078,
--   -- then: drop function private.product_key(text);

create or replace function private.product_key(p_name text)
returns text
language sql immutable
set search_path = pg_catalog, public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        -- Strip anything that is not a letter or digit from either end. The
        -- character class is unicode-aware so Swahili stays intact.
        regexp_replace(lower(coalesce(p_name, '')), '^[^[:alnum:]]+|[^[:alnum:]]+$', '', 'g'),
        '\s+', ' ', 'g'),
      '^\s+|\s+$', '', 'g'),
    '');
$$;

revoke execute on function private.product_key(text) from public, anon;
grant execute on function private.product_key(text) to authenticated, service_role;

-- New buying prices are keyed canonically from now on.
create or replace function public.set_product_cost(
  p_name text, p_unit_cost numeric, p_unit text default null, p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text; v_currency text; v_prev numeric; v_id uuid;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may set a buying price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_key := private.product_key(p_name);
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_unit_cost is null or p_unit_cost <= 0 then
    raise exception 'a buying price must be greater than zero'
      using errcode = 'P0001', hint = 'invalid_cost';
  end if;

  select currency into v_currency from companies where id = v_company;

  select unit_cost into v_prev from product_costs
   where company_id = v_company and product_key = v_key
   order by effective_from desc, created_at desc limit 1;

  insert into product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by, note)
  values
    (v_company, v_key, btrim(p_name), nullif(btrim(p_unit), ''), round(p_unit_cost, 2),
     v_currency, v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'unit_cost', round(p_unit_cost, 2), 'previous_cost', v_prev);
end $$;

revoke execute on function public.set_product_cost(text, numeric, text, text) from public, anon;
grant execute on function public.set_product_cost(text, numeric, text, text) to authenticated;

-- Prices already stored under a non-canonical key are re-keyed once. The rows
-- themselves are untouched: same amounts, same dates, same history.
update product_costs
   set product_key = private.product_key(product_name)
 where private.product_key(product_name) is not null
   and product_key <> private.product_key(product_name);

-- The catalogue groups by the canonical key, so a split caused only by
-- punctuation or spacing disappears without anybody merging anything.
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
      private.product_key(l.description) as product_key,
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
      and private.product_key(l.description) is not null
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
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      c.unit, c.unit_cost, c.effective_from, c.product_name
    from product_costs c
    where c.company_id = (select id from company)
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
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
    on a.company_id = (select id from company)
   and private.product_key(a.product_key) = m.product_key
  where p_include_archived or a.product_key is null
  order by coalesce(m.revenue, 0) desc, m.product_name;
$$;

revoke execute on function public.company_product_catalog(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.company_product_catalog(timestamptz, timestamptz, boolean) to authenticated;
