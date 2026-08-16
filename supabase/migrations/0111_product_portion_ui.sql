-- Current selling-price decisions for the Products page. Price history remains
-- append-only; this RPC returns only the latest row per product and selling unit.

create or replace function public.company_current_selling_prices(p_product_key text default null)
returns table (
  product_key text,
  sale_unit text,
  sale_unit_key text,
  unit_base_quantity numeric,
  retail_price numeric,
  wholesale_price numeric,
  wholesale_min_qty numeric,
  effective_from timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select distinct on (s.product_key, coalesce(s.sale_unit_key, ''))
    s.product_key, s.sale_unit, s.sale_unit_key, coalesce(s.unit_base_quantity, 1),
    s.retail_price, s.wholesale_price, s.wholesale_min_qty, s.effective_from
  from public.product_selling_prices s
  where s.company_id = private.auth_company_id()
    and (p_product_key is null or s.product_key = private.product_key(p_product_key))
  order by s.product_key, coalesce(s.sale_unit_key, ''), s.effective_from desc, s.created_at desc;
$$;

revoke all on function public.company_current_selling_prices(text) from public, anon;
grant execute on function public.company_current_selling_prices(text) to authenticated;
