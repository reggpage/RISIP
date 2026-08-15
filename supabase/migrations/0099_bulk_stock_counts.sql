-- Counting the whole shelf in one message.
--
-- The same lesson as the buying prices: a shop counts everything at once, on a
-- Sunday evening, and telling somebody to send thirty-six separate messages is
-- telling them not to bother. The bulk case is the normal case for a first
-- count.
--
-- ALL OR NOTHING, in one transaction. A half-applied count is worse than none:
-- some products would be anchored to tonight and the rest still floating, and
-- nobody could tell which by looking.
--
-- Each row is a real count, appended like any other, so counting again later
-- still supersedes cleanly and the history of what was counted when survives.

create or replace function public.wa_record_stock_counts(p_phone text, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text;
  v_item jsonb; v_product text; v_key text; v_qty numeric; v_unit text; v_existing text;
  v_saved int := 0;
begin
  select i.profile_id, p.active_company_id, m.role, c.name
    into v_profile, v_company, v_role, v_name
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode='P0001', hint='not_linked';
  end if;
  if v_role not in ('owner','accountant') then
    raise exception 'only an owner or accountant may record a stock count'
      using errcode='P0001', hint='not_authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no counts were given' using errcode='P0001', hint='no_product';
  end if;
  if jsonb_array_length(p_items) > 120 then
    raise exception 'too many counts in one message' using errcode='P0001', hint='too_many';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item->>'product', ''));
    v_key := private.product_key(v_product);
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');

    if v_key is null or length(v_key) < 2 then
      raise exception 'a product name is missing' using errcode='P0001', hint='no_product';
    end if;
    if v_qty is null or v_qty < 0 then
      raise exception 'a count cannot be negative' using errcode='P0001', hint='invalid_quantity';
    end if;

    -- One unit per product, same rule as everywhere else: a count in gunia
    -- against a product measured in kilo is not a smaller number, it is a
    -- different quantity entirely.
    v_existing := private.product_unit(v_company, v_key);
    if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
      raise exception 'this product is measured in % — count it in %, not in %',
        v_existing, v_existing, v_unit
        using errcode='P0001', hint='unit_mismatch';
    end if;

    insert into stock_counts (company_id, product_key, product_name, quantity, unit, counted_by, note)
    values (v_company, v_key, v_product, round(v_qty, 3),
            coalesce(v_unit, v_existing), v_profile, 'WhatsApp bulk count');
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('saved', v_saved, 'company_name', v_name);
end $$;

revoke execute on function public.wa_record_stock_counts(text, jsonb) from public, anon, authenticated;

