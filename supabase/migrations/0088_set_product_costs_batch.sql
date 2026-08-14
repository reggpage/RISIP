-- Saving many buying prices at once, in one transaction.
--
-- MEASURED FAILURE. A trader pasted 36 buying prices as a single WhatsApp
-- message — the only sensible way to send 36 of anything — and zero were saved.
-- The parser was anchored to a single line, so the message matched nothing.
--
-- Setting up a shop's prices is inherently a bulk job. Doing it one round trip
-- at a time means 72 messages, which nobody will do, which is why production had
-- 37 products and no prices at all.
--
-- ALL OR NOTHING. One transaction: a half-applied price list is worse than none,
-- because the coverage figure would then report a number nobody chose.
--
-- Still append-only. Each price is a new product_costs row, exactly as
-- set_product_cost writes one, so history is preserved per product and past
-- records keep the price that applied on their own day.
--
-- ROLLBACK
--   drop function public.wa_set_product_costs(text, jsonb);

create or replace function public.wa_set_product_costs(
  p_phone text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_currency text; v_name text;
  v_item jsonb; v_product text; v_key text; v_cost numeric; v_unit text;
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
    raise exception 'this number is not linked'
      using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set a buying price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no prices were given' using errcode = 'P0001', hint = 'no_product';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'too many prices in one message' using errcode = 'P0001', hint = 'too_many';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item->>'product', ''));
    v_key := lower(v_product);
    v_cost := (v_item->>'unit_cost')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');

    -- One bad entry fails the whole block. Skipping it quietly would leave the
    -- trader believing a price is set when it is not.
    if length(v_key) < 2 then
      raise exception 'a product name is missing' using errcode = 'P0001', hint = 'no_product';
    end if;
    if v_cost is null or v_cost <= 0 then
      raise exception 'a buying price must be greater than zero'
        using errcode = 'P0001', hint = 'invalid_cost';
    end if;

    insert into product_costs
      (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by, note)
    values
      (v_company, v_key, v_product, v_unit, round(v_cost, 2), v_currency, v_profile,
       'WhatsApp bulk price list');
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('saved', v_saved, 'company_name', v_name);
end $$;

revoke execute on function public.wa_set_product_costs(text, jsonb) from public, anon, authenticated;
