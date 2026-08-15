-- Setting the whole shop's selling prices in one message.
--
-- The buying prices taught this once already (0088): a shop sets up its price
-- list in one sitting, pastes thirty-six lines, and "send them one at a time" is
-- not an instruction anybody follows. The selling prices had exactly the same
-- gap — parseSellingPrice is single-line — so the same paste would have saved
-- nothing, silently, for the second time.
--
-- All or nothing. A price list half applied is worse than one refused, because
-- the shop then believes it has set prices it has not set, and the assistant
-- quotes the old ones with total confidence.

create or replace function public.wa_set_selling_prices(
  p_phone text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text; v_currency text;
  v_item jsonb; v_product text; v_key text;
  v_retail numeric; v_wholesale numeric; v_min_qty numeric;
  v_saved int := 0;
begin
  select i.profile_id, p.active_company_id, m.role, c.name, c.currency
    into v_profile, v_company, v_role, v_name, v_currency
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set a selling price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no prices given' using errcode = 'P0001', hint = 'empty';
  end if;
  if jsonb_array_length(p_items) > 120 then
    raise exception 'too many prices in one message' using errcode = 'P0001', hint = 'too_many';
  end if;

  -- Validate every line before writing any of them.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item ->> 'product', ''));
    v_retail := nullif(v_item ->> 'retail', '')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min_qty := nullif(v_item ->> 'min_qty', '')::numeric;
    v_key := private.product_key(v_product);

    if v_key is null or length(v_key) < 2 then
      raise exception 'product name is not usable: %', v_product
        using errcode = 'P0001', hint = 'bad_product';
    end if;
    if v_retail is null or v_retail <= 0 or v_retail > 1000000000 then
      raise exception 'retail price for % is out of range', v_product
        using errcode = 'P0001', hint = 'bad_retail';
    end if;
    -- A trade price above the retail one is a typo every time, never a business
    -- model. Naming the product is what makes it fixable in one reply.
    if v_wholesale is not null and v_wholesale > v_retail then
      raise exception 'wholesale price for % is above its retail price', v_product
        using errcode = 'P0001', hint = 'wholesale_above_retail';
    end if;
    if v_min_qty is not null and v_wholesale is null then
      raise exception 'a starting quantity for % needs a wholesale price', v_product
        using errcode = 'P0001', hint = 'min_qty_without_wholesale';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item ->> 'product', ''));
    v_retail := nullif(v_item ->> 'retail', '')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min_qty := nullif(v_item ->> 'min_qty', '')::numeric;

    insert into product_selling_prices
      (company_id, product_key, product_name, retail_price, wholesale_price,
       wholesale_min_qty, currency, recorded_by)
    values
      (v_company, private.product_key(v_product), v_product, v_retail, v_wholesale,
       v_min_qty, coalesce(v_currency, 'TZS'), v_profile);
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('saved', v_saved, 'company_name', coalesce(v_name, ''));
end;
$$;

revoke all on function public.wa_set_selling_prices(text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_set_selling_prices(text, jsonb) to service_role;
