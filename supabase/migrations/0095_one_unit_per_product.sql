-- A product has ONE unit. Found by a question, not by a test:
--
--   count Unga in "kilo", price Unga per "gunia", and nothing stopped it. The
--   products page then said gunia, the stock page said kilo, and the margin was
--   revenue - (45,000 x 25) — a sack price multiplied by a kilo quantity, out by
--   about fifty times.
--
-- 0078 already stated the rule: a buying price is per SELLING unit — per kilo if
-- you sell by the kilo. Nothing enforced it, and the edit dialog offered a
-- separate unit box on each tab, which invited exactly this.
--
-- No conversion is added here, for the reason 0078 gives: every trader's sack is
-- a different size. What is added is a refusal, with both units named, so the
-- trader converts once themselves and Risip never guesses.

create or replace function private.product_unit(p_company uuid, p_key text)
returns text
language sql stable
set search_path = pg_catalog, public
as $$
  -- The most recently stated unit, across every place a trader can state one.
  select unit from (
    select c.unit, c.effective_from as at
      from product_costs c
     where c.company_id = p_company and private.product_key(c.product_key) = p_key
       and nullif(btrim(coalesce(c.unit, '')), '') is not null
    union all
    select s.unit, s.counted_at
      from stock_counts s
     where s.company_id = p_company and private.product_key(s.product_key) = p_key
       and nullif(btrim(coalesce(s.unit, '')), '') is not null
    union all
    select l.unit, r.occurred_at
      from daily_record_lines l
      join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company and private.product_key(l.description) = p_key
       and r.status = 'confirmed'
       and nullif(btrim(coalesce(l.unit, '')), '') is not null
  ) stated
  order by at desc
  limit 1;
$$;

revoke execute on function private.product_unit(uuid, text) from public, anon;
grant execute on function private.product_unit(uuid, text) to authenticated, service_role;

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
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_existing text;
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

  v_existing := private.product_unit(v_company, v_key);
  if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
    raise exception 'this product is measured in % — a buying price must be per %, not per %',
      v_existing, v_existing, v_unit
      using errcode = 'P0001', hint = 'unit_mismatch';
  end if;

  select currency into v_currency from companies where id = v_company;

  select unit_cost into v_prev from product_costs
   where company_id = v_company and product_key = v_key
   order by effective_from desc, created_at desc limit 1;

  insert into product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by, note)
  values
    (v_company, v_key, btrim(p_name), coalesce(v_unit, v_existing), round(p_unit_cost, 2),
     v_currency, v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'unit_cost', round(p_unit_cost, 2), 'previous_cost', v_prev);
end $$;

revoke execute on function public.set_product_cost(text, numeric, text, text) from public, anon;
grant execute on function public.set_product_cost(text, numeric, text, text) to authenticated;

create or replace function public.record_stock_count(
  p_name text, p_quantity numeric, p_unit text default null, p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := private.product_key(p_name);
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_existing text; v_id uuid;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may record a stock count'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;

  v_existing := private.product_unit(v_company, v_key);
  if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
    raise exception 'this product is measured in % — count it in %, not in %',
      v_existing, v_existing, v_unit
      using errcode = 'P0001', hint = 'unit_mismatch';
  end if;

  insert into stock_counts (company_id, product_key, product_name, quantity, unit, counted_by, note)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 3),
          coalesce(v_unit, v_existing), v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name), 'quantity', round(p_quantity, 3));
end $$;

revoke execute on function public.record_stock_count(text, numeric, text, text) from public, anon;
grant execute on function public.record_stock_count(text, numeric, text, text) to authenticated;

-- The same refusal on the WhatsApp path, so neither door lets a mismatch in.
create or replace function public.wa_record_stock_count(
  p_phone text, p_name text, p_quantity numeric, p_unit text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_key text := private.product_key(p_name);
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_existing text; v_previous numeric; v_id uuid;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode='P0001', hint='not_linked';
  end if;
  if v_role not in ('owner','accountant') then
    raise exception 'only an owner or accountant may record a stock count'
      using errcode='P0001', hint='not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode='P0001', hint='no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode='P0001', hint='invalid_quantity';
  end if;

  v_existing := private.product_unit(v_company, v_key);
  if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
    raise exception 'this product is measured in % — count it in %, not in %',
      v_existing, v_existing, v_unit
      using errcode='P0001', hint='unit_mismatch';
  end if;

  select on_hand into v_previous from public.wa_stock_on_hand(v_company, p_name) limit 1;

  insert into stock_counts (company_id, product_key, product_name, quantity, unit, counted_by)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 3), coalesce(v_unit, v_existing), v_profile)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'quantity', round(p_quantity, 3), 'previous', v_previous);
end $$;

revoke execute on function public.wa_record_stock_count(text, text, numeric, text) from public, anon, authenticated;

