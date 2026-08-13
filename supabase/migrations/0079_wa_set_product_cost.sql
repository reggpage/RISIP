-- A way to actually enter a buying price.
--
-- 0078 built product_costs and daily_profit_estimate, but the only way in was
-- set_product_cost, which reads auth.uid() and so needs a web session. A Kariakoo
-- trader lives in WhatsApp. Without this the table stays empty, coverage stays
-- zero, and the profit estimate can never say anything — the whole of 0078 sits
-- unused.
--
-- Same shape as every other wa_ function: service-role only, resolves the person
-- from the linked number, derives the company from active_company_id joined to
-- company_members, and fails closed when that membership does not hold. The role
-- check is the same one set_product_cost makes — a price is commercial
-- information and it moves the profit figure, so it stays with the owner.
--
-- The reply carries company_name and previous_cost because the confirmation has
-- to say WHICH business and WHAT it was before. "Saved" is not enough when the
-- number quietly changes every future report.
--
-- ROLLBACK
--   drop function public.wa_set_product_cost(text, text, numeric, text);

create or replace function public.wa_set_product_cost(
  p_phone text, p_name text, p_unit_cost numeric, p_unit text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role user_role;
  v_key text; v_currency text; v_prev numeric; v_id uuid;
begin
  select i.profile_id into v_profile from whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;

  select p.active_company_id, m.role into v_company, v_role
    from profiles p
    join company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = v_profile;
  if v_company is null then
    raise exception 'no active business' using errcode = 'P0001', hint = 'no_active_company';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only the owner may set a buying price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_key := lower(btrim(coalesce(p_name, '')));
  if length(v_key) < 2 then
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
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by)
  values
    (v_company, v_key, btrim(p_name), nullif(btrim(p_unit), ''), round(p_unit_cost, 2),
     v_currency, v_profile)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'product', btrim(p_name), 'unit', nullif(btrim(p_unit), ''),
    'unit_cost', round(p_unit_cost, 2), 'previous_cost', v_prev,
    'company_name', (select name from companies where id = v_company));
end $$;

revoke execute on function public.wa_set_product_cost(text, text, numeric, text)
  from public, anon, authenticated;
