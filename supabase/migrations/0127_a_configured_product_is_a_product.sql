-- MEASURED, while proving the sale chain end to end:
--
--   wa_save_business_term(… 'Chakula cha mbwa test' …)
--   -> P0001: not a product of this business   (hint unknown_product)
--
-- The product had just been created: a base unit, a declared measure and a
-- selling price, all written by wa_add_product_unit. company_product_catalog
-- could see it — its `declared_base` branch reads product_units — and
-- company_product_names could not, because that function unions sales,
-- purchases and product_costs and stops there.
--
-- Two functions, two different ideas of what "this shop's products" means. The
-- same shape of bug as 0118, where goods a shop had BOUGHT were absent from
-- both catalogues, and the same fix: a product a shop has configured, priced
-- and declared a measure for is a product of that shop, whether or not any
-- money has moved through it yet.
--
-- Everything downstream of the name list inherits the gap, which is why it is
-- worth a migration rather than a special case at the call site: aliases could
-- not be attached to a newly set-up product, and the WhatsApp assistant could
-- not resolve it by name until the first sale went through.
--
-- ROLLBACK: restore company_product_names from 0118.

create or replace function public.company_product_names(p_company_id uuid)
returns table (product_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $fn$
  with sold as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l
      join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id
       and r.kind = 'sale'
       and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  bought as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l
      join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id
       and r.kind = 'stock_purchase'
       and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  priced as (
    select distinct on (private.product_key(c.product_key)) c.product_name as name
      from product_costs c
     where c.company_id = p_company_id
     order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  -- Set up: a base measure was declared for it, which is a deliberate act by an
  -- owner or accountant and is exactly what company_product_catalog already
  -- treats as making a product real.
  configured as (
    select distinct on (u.product_key) u.product_name as name
      from product_units u
     where u.company_id = p_company_id and u.is_base
     order by u.product_key, u.created_at desc
  ),
  everything as (
    select name from sold
    union select name from bought
    union select name from priced
    union select name from configured
  )
  select distinct on (private.product_key(name)) name
    from everything
   where private.product_key(name) is not null
   order by private.product_key(name), name
   limit 500;
$fn$;

revoke execute on function public.company_product_names(uuid) from public, anon, authenticated;
