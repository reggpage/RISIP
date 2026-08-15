-- One lookup for "what is this product worth?".
--
-- The owner asked the obvious question: if the selling price is already saved,
-- why does the assistant still ask for it? Two places needed it and neither had
-- it to hand — recording a sale that states quantities only, and estimating
-- profit on the stock in the store.
--
-- Returns, per product, everything a price decision needs:
--   retail / wholesale / wholesale_min_qty  — what the shop DECIDED to charge
--   unit_cost                               — what the shop pays
--   avg_unit_price                          — what the shop ACTUALLY got, on average
--
-- The last one is a fallback, never a substitute. A price the shop set is a
-- decision; an average is a description of the past, and anything built on it
-- has to say so out loud.

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
language sql
stable
security definer
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
    from product_selling_prices s
    where s.company_id = p_company_id
    order by private.product_key(s.product_key), s.effective_from desc, s.created_at desc
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      c.unit_cost
    from product_costs c
    where c.company_id = p_company_id
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  achieved as (
    select
      private.product_key(l.description) as product_key,
      sum(l.quantity) as sold_quantity,
      case when sum(l.quantity) > 0 then round(sum(l.line_total) / sum(l.quantity), 2) end as avg_unit_price
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
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
