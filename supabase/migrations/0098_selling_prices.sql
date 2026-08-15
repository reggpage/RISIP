-- Retail and wholesale, which is how goods are actually priced here.
--
-- The owner described Kariakoo exactly: a book sells at 10,000 retail, but a
-- regular customer — another trader — pays 9,000, and so does anyone taking five
-- or more. Risip had one selling price per product, derived by averaging what
-- had actually been charged, so a shop doing this saw a "price" of about 9,600:
-- a number they have never once sold at.
--
-- COST IS OF THE PRODUCT; PRICE IS OF THE RELATIONSHIP. That is why this is a
-- separate table from product_costs rather than more columns on it. The buying
-- price answers "what did this cost me"; these answer "what do I charge, and
-- whom". They change for entirely different reasons.
--
-- WHY THE PROFIT MATH NEEDED NO CHANGE, and this is worth stating plainly:
-- margin is revenue − (unit_cost × quantity), and revenue is whatever was really
-- charged. Mixed pricing was already correct. What was missing was the ability
-- to tell a deliberate wholesale discount from a mistake, which is what this
-- adds.
--
-- NOTHING IS ENFORCED. A trader sells at whatever price they like — a friend, a
-- damaged copy, the end of the day. Risip records what happened and can now say
-- which of the shop's own prices it matched. It never blocks a sale and never
-- rewrites one.
--
-- APPEND-ONLY, like product_costs and for the same reason: last month's report
-- must keep last month's prices.
--
-- ROLLBACK
--   drop function public.wa_set_selling_price(text, text, numeric, numeric, numeric);
--   drop function public.set_selling_price(text, numeric, numeric, numeric);
--   drop function public.price_band(uuid, text, numeric, numeric);
--   drop table public.product_selling_prices;

create table if not exists public.product_selling_prices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  product_key     text not null,
  product_name    text not null,
  /** What a walk-in pays for one. */
  retail_price    numeric(14,2) not null check (retail_price > 0),
  /** What a regular or a bulk buyer pays. Null when the shop has one price. */
  wholesale_price numeric(14,2) check (wholesale_price is null or wholesale_price > 0),
  /**
   * How many make it wholesale. Null with a wholesale price means the discount
   * is by relationship rather than by quantity — the regular customer who buys
   * two and still pays the trade price.
   */
  wholesale_min_qty numeric(14,3) check (wholesale_min_qty is null or wholesale_min_qty > 0),
  currency        text not null,
  effective_from  timestamptz not null default clock_timestamp(),
  recorded_by     uuid not null references public.profiles(id) on delete restrict,
  note            text,
  created_at      timestamptz not null default clock_timestamp(),
  -- Wholesale above retail is a typo every time, not a business model.
  constraint selling_prices_wholesale_not_higher
    check (wholesale_price is null or wholesale_price <= retail_price)
);

create index if not exists product_selling_prices_lookup
  on public.product_selling_prices (company_id, product_key, effective_from desc, created_at desc);

alter table public.product_selling_prices enable row level security;
revoke all on table public.product_selling_prices from public, anon, authenticated;

-- Everyone may see what the shop charges; only finance may set it.
drop policy if exists product_selling_prices_select on public.product_selling_prices;
create policy product_selling_prices_select on public.product_selling_prices
  for select to authenticated
  using (company_id = private.auth_company_id());
grant select on public.product_selling_prices to authenticated;

/**
 * Which of the shop's own prices a sale matched.
 *
 * 'retail' | 'wholesale' | 'below' | 'above' | 'unpriced'
 *
 * Reporting, never blocking. "below" is the one worth saying out loud: it means
 * the sale went out under every price the shop set for itself, which is either a
 * decision somebody made or a mistake somebody made, and only they know which.
 */
create or replace function public.price_band(
  p_company uuid, p_key text, p_unit_price numeric, p_quantity numeric
)
returns text
language sql stable
set search_path = pg_catalog, public
as $$
  with current_price as (
    select retail_price, wholesale_price, wholesale_min_qty
      from product_selling_prices
     where company_id = p_company and product_key = private.product_key(p_key)
     order by effective_from desc, created_at desc
     limit 1
  )
  select case
    when not exists (select 1 from current_price) then 'unpriced'
    -- A cent of tolerance: a price typed as 9,000 and a line computed from a
    -- total should not disagree over rounding.
    when p_unit_price > (select retail_price from current_price) + 0.01 then 'above'
    when p_unit_price >= (select retail_price from current_price) - 0.01 then 'retail'
    when (select wholesale_price from current_price) is not null
     and p_unit_price >= (select wholesale_price from current_price) - 0.01 then 'wholesale'
    else 'below'
  end;
$$;

revoke execute on function public.price_band(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.price_band(uuid, text, numeric, numeric) to authenticated, service_role;

create or replace function public.set_selling_price(
  p_name text,
  p_retail numeric,
  p_wholesale numeric default null,
  p_min_qty numeric default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := private.product_key(p_name);
  v_currency text; v_id uuid;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may set a selling price'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_retail is null or p_retail <= 0 then
    raise exception 'a retail price must be greater than zero'
      using errcode = 'P0001', hint = 'invalid_price';
  end if;
  if p_wholesale is not null and p_wholesale > p_retail then
    raise exception 'a wholesale price cannot be higher than the retail price'
      using errcode = 'P0001', hint = 'wholesale_above_retail';
  end if;
  -- A minimum with no wholesale price says nothing, and would read as if bulk
  -- buyers get something they do not.
  if p_min_qty is not null and p_wholesale is null then
    raise exception 'a bulk quantity needs a wholesale price to go with it'
      using errcode = 'P0001', hint = 'min_without_wholesale';
  end if;

  select currency into v_currency from companies where id = v_company;

  insert into product_selling_prices
    (company_id, product_key, product_name, retail_price, wholesale_price,
     wholesale_min_qty, currency, recorded_by)
  values
    (v_company, v_key, btrim(p_name), round(p_retail, 2),
     case when p_wholesale is null then null else round(p_wholesale, 2) end,
     p_min_qty, v_currency, v_actor)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'retail', round(p_retail, 2),
    'wholesale', case when p_wholesale is null then null else round(p_wholesale, 2) end,
    'min_qty', p_min_qty);
end $$;

revoke execute on function public.set_selling_price(text, numeric, numeric, numeric) from public, anon;
grant execute on function public.set_selling_price(text, numeric, numeric, numeric) to authenticated;

/** The WhatsApp door. Same rules; the webhook has no auth.uid() of its own. */
create or replace function public.wa_set_selling_price(
  p_phone text, p_name text, p_retail numeric,
  p_wholesale numeric default null, p_min_qty numeric default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_currency text; v_name text;
  v_key text := private.product_key(p_name); v_id uuid;
begin
  select i.profile_id, p.active_company_id, m.role, c.currency, c.name
    into v_profile, v_company, v_role, v_currency, v_name
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
    raise exception 'only finance may set a selling price'
      using errcode='P0001', hint='not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this price for?' using errcode='P0001', hint='no_product';
  end if;
  if p_retail is null or p_retail <= 0 then
    raise exception 'a retail price must be greater than zero'
      using errcode='P0001', hint='invalid_price';
  end if;
  if p_wholesale is not null and p_wholesale > p_retail then
    raise exception 'a wholesale price cannot be higher than the retail price'
      using errcode='P0001', hint='wholesale_above_retail';
  end if;
  if p_min_qty is not null and p_wholesale is null then
    raise exception 'a bulk quantity needs a wholesale price to go with it'
      using errcode='P0001', hint='min_without_wholesale';
  end if;

  insert into product_selling_prices
    (company_id, product_key, product_name, retail_price, wholesale_price,
     wholesale_min_qty, currency, recorded_by)
  values
    (v_company, v_key, btrim(p_name), round(p_retail, 2),
     case when p_wholesale is null then null else round(p_wholesale, 2) end,
     p_min_qty, v_currency, v_profile)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name), 'company_name', v_name,
    'retail', round(p_retail, 2),
    'wholesale', case when p_wholesale is null then null else round(p_wholesale, 2) end,
    'min_qty', p_min_qty);
end $$;

revoke execute on function public.wa_set_selling_price(text, text, numeric, numeric, numeric)
  from public, anon, authenticated;
