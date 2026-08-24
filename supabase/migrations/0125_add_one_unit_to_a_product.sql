-- RISIP BUCHA, PHASE 4 — one more measure for a product that already has one.
--
-- MEASURED, by calling the real RPC rather than reading its signature:
--
--   wa_configure_product_units(… p_purchase_unit := null …)
--   -> P0001: base and purchase units are required   (hint unit_required)
--
-- private.configure_product_units sets a product up ONCE, whole: base unit,
-- purchase unit, purchase size, purchase cost and at least one priced selling
-- unit, and it refuses outright if the product already has a unit setup. That
-- is right for what it does, and wrong for what a shop says next:
--
--   "kwetu chakula cha mbwa kinawekwa vifuko vya kilo 1"
--
-- Dog food already exists, already has kilo as its base, already has a price.
-- The shop is adding one fact — a bag holds a kilo — and there was no way to
-- record it without re-declaring everything else and being refused for it.
--
-- This adds exactly that one fact. It does NOT duplicate the conversion engine:
-- the row it writes is an ordinary product_units row, read by the same
-- machinery as every other measure. A price is optional here, because a
-- container is not a price list — a kifuko holding a kilo says nothing about
-- what a kifuko sells for, and inventing one would be worse than leaving it.
--
-- ROLLBACK:
--   drop function if exists public.wa_add_product_unit(text, text, text, numeric, numeric);

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
  -- The same posture as every other unit and pricing setting.
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

  -- A measure has to measure something the shop actually has.
  select n.product_name into v_product_name
    from public.company_product_names(v_company) n
   where private.product_key(n.product_name) = v_key
   limit 1;
  if v_product_name is null then
    raise exception 'not a product of this business: %', btrim(p_name)
      using errcode = 'P0001', hint = 'unknown_product';
  end if;

  -- And it has to be a multiple of something. Without a base unit there is
  -- nothing for "one kifuko is one kilo" to be one of.
  select u.unit_name into v_base_unit
    from public.product_units u
   where u.company_id = v_company and u.product_key = v_key and u.is_base
   limit 1;
  if v_base_unit is null then
    raise exception 'this product has no base unit yet'
      using errcode = 'P0001', hint = 'no_base_unit';
  end if;

  -- A unit that already exists with a DIFFERENT size is a contradiction, not an
  -- update. Two live conversions for one word would silently reprice every past
  -- reading of it, so it is refused and the shop is told.
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
     false, false, true, true, v_profile)
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
    'base_unit', v_base_unit, 'retail', p_retail));

  return jsonb_build_object(
    'product', v_product_name, 'unit', btrim(p_unit),
    'base_unit', v_base_unit, 'base_quantity', round(p_base_quantity, 6));
end;
$fn$;

revoke all on function public.wa_add_product_unit(text, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.wa_add_product_unit(text, text, text, numeric, numeric) to service_role;
