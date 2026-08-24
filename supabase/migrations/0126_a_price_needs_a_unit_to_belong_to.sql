-- PHASE 4 HARDENING — a price with no unit is not enough to sell by.
--
-- MEASURED against production, not assumed. After phase 4 routed
-- "ongeza chakula cha mbwa nauza kilo 2000" through wa_set_selling_price:
--
--   sale_unit stored?               NULL
--   product_units rows              NONE
--   visible to sale-unit resolver?  NOT VISIBLE
--   wa_product_pricing              2000.00, cost=null
--
-- The shop said "kilo" and the word was thrown away. wa_set_selling_price
-- writes a bare product price and never touches product_units, and
-- wa_company_product_sale_units reads FROM product_units — so a sell-only
-- product had no sellable unit at all. Phase 5 could have priced "mbwa 3" from
-- the legacy per-product price and would have had nothing whatsoever to say
-- about "kifuko 4".
--
-- Two changes, both generic, neither of them about butchers.
--
-- 1. wa_add_product_unit may now create the FIRST unit, as the base.
--    It previously refused with no_base_unit, which is correct when adding a
--    second measure and wrong when there is not yet a first. A base unit is
--    just a unit whose conversion is one.
--
-- 2. wa_price_sale_unit derives what a quantity of ANY declared unit is worth.
--    One formula: quantity x conversion x the base unit's price, unless that
--    unit carries a price of its own. It is deliberately not three formulas
--    for kifuko, box and packet, and it stores no duplicate price data — a
--    kifuko that holds a kilo needs no price of its own, because the kilo has
--    one.
--
-- ROLLBACK:
--   drop function if exists public.wa_price_sale_unit(uuid, text, text, numeric);
--   -- and restore wa_add_product_unit from 0125.

create or replace function public.wa_add_product_unit(
  p_phone text,
  p_name text,
  p_unit text,
  p_base_quantity numeric,
  p_retail numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_profile uuid; v_company uuid; v_role text; v_currency text;
  v_key text := private.product_key(p_name);
  v_unit_key text := private.product_key(p_unit);
  v_product_name text;
  v_base_unit text;
  v_existing numeric;
  v_is_base boolean := false;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can configure product units'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  if v_key is null or v_unit_key is null or length(v_unit_key) > 40 then
    raise exception 'which product and which unit?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_base_quantity is null or p_base_quantity <= 0 or p_base_quantity > 1000000 then
    raise exception 'that conversion is out of range' using errcode = 'P0001', hint = 'invalid_conversion';
  end if;
  if p_retail is not null and (p_retail <= 0 or p_retail > 1000000000) then
    raise exception 'that price is out of range' using errcode = 'P0001', hint = 'invalid_price';
  end if;

  select n.product_name into v_product_name
    from public.company_product_names(v_company) n
   where private.product_key(n.product_name) = v_key
   limit 1;
  -- A product the shop has never traded still has to be nameable, because this
  -- is now also how the very first unit of a brand new product is declared.
  v_product_name := coalesce(v_product_name, btrim(p_name));

  select u.unit_name into v_base_unit
    from public.product_units u
   where u.company_id = v_company and u.product_key = v_key and u.is_base
   limit 1;

  if v_base_unit is null then
    -- The first unit becomes the base, and a base unit is by definition one of
    -- itself. Anything else would declare a conversion with nothing to convert
    -- into.
    if abs(p_base_quantity - 1) > 0.000001 then
      raise exception 'the first unit of a product must be its base, with a conversion of one'
        using errcode = 'P0001', hint = 'no_base_unit';
    end if;
    v_is_base := true;
    v_base_unit := btrim(p_unit);
  end if;

  select u.base_quantity into v_existing
    from public.product_units u
   where u.company_id = v_company and u.product_key = v_key and u.unit_key = v_unit_key;
  if v_existing is not null and abs(v_existing - p_base_quantity) > 0.000001 then
    raise exception 'unit % already means % %', btrim(p_unit), v_existing, v_base_unit
      using errcode = 'P0001', hint = 'conversion_conflict';
  end if;

  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
     is_base, can_purchase, can_sell, can_count, created_by)
  values
    (v_company, v_key, v_product_name, v_unit_key, btrim(p_unit), round(p_base_quantity, 6),
     v_is_base, false, true, true, v_profile)
  on conflict (company_id, product_key, unit_key) do update
    set can_sell = true, can_count = true;

  if p_retail is not null then
    select currency into v_currency from public.companies where id = v_company;
    insert into public.product_selling_prices
      (company_id, product_key, product_name, retail_price, currency, recorded_by, sale_unit)
    values (v_company, v_key, v_product_name, round(p_retail, 2), v_currency, v_profile, btrim(p_unit));
  end if;

  insert into public.product_unit_audit_log (company_id, product_key, actor_id, action, metadata)
  values (v_company, v_key, v_profile, 'unit_added', jsonb_build_object(
    'unit', btrim(p_unit), 'base_quantity', round(p_base_quantity, 6),
    'base_unit', v_base_unit, 'is_base', v_is_base, 'retail', p_retail));

  return jsonb_build_object(
    'product', v_product_name, 'unit', btrim(p_unit), 'is_base', v_is_base,
    'base_unit', v_base_unit, 'base_quantity', round(p_base_quantity, 6));
end;
$fn$;

revoke all on function public.wa_add_product_unit(text, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.wa_add_product_unit(text, text, text, numeric, numeric) to service_role;

-- ── one formula for what a quantity of any unit is worth ───────────────────

create or replace function public.wa_price_sale_unit(
  p_company_id uuid,
  p_product text,
  p_unit text,
  p_quantity numeric
)
returns table(
  product_key text,
  product_name text,
  unit_name text,
  base_unit text,
  base_quantity numeric,
  unit_price numeric,
  price_source text,
  total numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  with wanted as (
    select private.product_key(p_product) as key, private.product_key(p_unit) as unit_key
  ),
  base as (
    select u.unit_name, u.unit_key
      from public.product_units u, wanted w
     where u.company_id = p_company_id and u.product_key = w.key and u.is_base
     limit 1
  ),
  measure as (
    select u.product_key, u.product_name, u.unit_name, u.unit_key, u.base_quantity
      from public.product_units u, wanted w
     where u.company_id = p_company_id and u.product_key = w.key and u.unit_key = w.unit_key
       and u.can_sell
     limit 1
  ),
  -- A price declared for this exact unit, and a price declared for the base.
  priced as (
    select distinct on (s.sale_unit_key) s.sale_unit_key, s.retail_price
      from public.product_selling_prices s, wanted w
     where s.company_id = p_company_id and s.product_key = w.key and s.sale_unit_key is not null
     order by s.sale_unit_key, s.effective_from desc, s.created_at desc
  ),
  own_price as (select p.retail_price from priced p, measure m where p.sale_unit_key = m.unit_key),
  base_price as (select p.retail_price from priced p, base b where p.sale_unit_key = b.unit_key)
  select
    m.product_key,
    m.product_name,
    m.unit_name,
    b.unit_name,
    round(m.base_quantity * p_quantity, 6),
    -- Its own price when it has one; otherwise derived from the base. This is
    -- the whole engine: a kifuko holding a kilo is worth what a kilo is worth,
    -- and a box of twelve packets is worth twelve packets.
    coalesce((select retail_price from own_price),
             round((select retail_price from base_price) * m.base_quantity, 2)),
    case when (select retail_price from own_price) is not null then 'unit' else 'derived' end,
    round(coalesce((select retail_price from own_price),
                   (select retail_price from base_price) * m.base_quantity) * p_quantity, 2)
    from measure m cross join base b
   where p_quantity > 0;
$fn$;

revoke all on function public.wa_price_sale_unit(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.wa_price_sale_unit(uuid, text, text, numeric) to service_role;
