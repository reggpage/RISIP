-- What a product costs to buy, so that profit can be an estimate instead of a
-- guess.
--
-- 0077 separated buying stock from running the shop, which fixed the reports.
-- It did not give profit: knowing 500,000 went on stock still says nothing about
-- what the flour sold today cost. That needs a cost per SELLING unit — per kilo
-- if you sell by the kilo — and the trader is the only one who knows it.
--
-- WHY NOT DERIVE IT FROM PURCHASES. A sack costs 45,000 and holds 50 kilos, so a
-- kilo costs 900 — but only if the system knows a sack is 50 kilos. Unit
-- conversion is a whole project (and every trader's sack is a different size).
-- Asking once per product is one question the trader can answer instantly, and it
-- is right rather than nearly right.
--
-- APPEND-ONLY, WITH HISTORY. A price is never overwritten. Sugar at 900 in
-- January and 1,100 in March means January's profit must use 900, so each sale
-- looks up the price that was in force on its own date. Same discipline as the
-- petty-cash ledger and the payout records: append, never rewrite.
--
-- effective_from defaults to clock_timestamp(), NOT now(). Found by a test:
-- now() is frozen for a whole transaction, so two prices set in one batch tied on
-- effective_from and the winner was whichever row Postgres happened to return —
-- the test asked for the new price and got the old one. clock_timestamp() moves
-- within a transaction, and created_at breaks any remaining tie.
--
-- TWO DIFFERENT NUMBERS, NEVER MIXED:
--   cash movement = sales + payments − expenses − stock purchases  (the till)
--   estimated profit = sales − COGS − expenses                     (the trade)
-- Stock purchases are inventory, not cost of sales. Subtracting both would count
-- the same goods twice.
--
-- HONEST ABOUT COVERAGE. If only some products have a price, COGS is incomplete
-- and profit is overstated. daily_profit_estimate returns `coverage` and names
-- the products still missing a price, so the assistant can say so instead of
-- presenting a flattering number as fact.
--
-- ROLLBACK
--   drop function public.daily_profit_estimate(timestamptz, timestamptz);
--   drop function public.set_product_cost(text, numeric, text, text);
--   drop table product_costs;

create table if not exists product_costs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  -- lower(btrim(name)). Same normalisation as customer names: "Unga" and "unga"
  -- are one product; anything beyond case is asked, never merged silently.
  product_key    text not null,
  -- as the trader typed it, for showing back to them
  product_name   text not null,
  -- descriptive only: "kilo", "kipande", "lita". Nothing converts between units.
  unit           text,
  unit_cost      numeric(14,2) not null check (unit_cost > 0),
  currency       text not null,
  effective_from timestamptz not null default clock_timestamp(),
  recorded_by    uuid not null references profiles(id) on delete restrict,
  note           text,
  created_at     timestamptz not null default clock_timestamp()
);

create index if not exists product_costs_lookup
  on product_costs (company_id, product_key, effective_from desc, created_at desc);

alter table product_costs enable row level security;

-- Everyone in the company can read a buying price; only finance may set one.
-- There is no UPDATE or DELETE policy: a price change is a new row.
drop policy if exists product_costs_select on product_costs;
create policy product_costs_select on product_costs
  for select to authenticated
  using (company_id = private.auth_company_id());

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
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may set a buying price'
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

  -- Returned so the confirmation can say "was 900, now 1,100" rather than just
  -- "saved" — a price change is worth seeing.
  select unit_cost into v_prev from product_costs
   where company_id = v_company and product_key = v_key
   order by effective_from desc, created_at desc limit 1;

  insert into product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by, note)
  values
    (v_company, v_key, btrim(p_name), nullif(btrim(p_unit), ''), round(p_unit_cost, 2),
     v_currency, v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'unit_cost', round(p_unit_cost, 2), 'previous_cost', v_prev);
end $$;

revoke execute on function public.set_product_cost(text, numeric, text, text) from public, anon;
grant execute on function public.set_product_cost(text, numeric, text, text) to authenticated;

-- Estimated profit for a period, with an honest account of what it could not see.
create or replace function public.daily_profit_estimate(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_sales numeric := 0; v_expenses numeric := 0; v_stock numeric := 0;
  v_cogs numeric := 0; v_costed numeric := 0; v_uncosted int := 0; v_missing text[];
begin
  if v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;

  select coalesce(sum(amount) filter (where kind = 'sale'), 0),
         coalesce(sum(amount) filter (where kind = 'expense'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_purchase'), 0)
    into v_sales, v_expenses, v_stock
    from daily_records
   where company_id = v_company and status = 'confirmed'
     and occurred_at >= p_from and occurred_at < p_to;

  with sale_lines as (
    select l.description, l.quantity, l.line_total, d.occurred_at
      from daily_records d
      join daily_record_lines l on l.daily_record_id = d.id
     where d.company_id = v_company and d.status = 'confirmed' and d.kind = 'sale'
       and d.occurred_at >= p_from and d.occurred_at < p_to
  ), costed as (
    select sl.*,
           -- the price in force on the day of THIS sale, not today's price
           (select pc.unit_cost from product_costs pc
             where pc.company_id = v_company
               and pc.product_key = lower(btrim(sl.description))
               and pc.effective_from <= sl.occurred_at
             order by pc.effective_from desc, pc.created_at desc
             limit 1) as unit_cost
      from sale_lines sl
  )
  select coalesce(sum(case when unit_cost is not null then quantity * unit_cost end), 0),
         coalesce(sum(case when unit_cost is not null then line_total end), 0),
         count(*) filter (where unit_cost is null),
         coalesce(array_agg(distinct description) filter (where unit_cost is null), '{}')
    into v_cogs, v_costed, v_uncosted, v_missing
    from costed;

  return jsonb_build_object(
    'sales', v_sales,
    'expenses', v_expenses,
    -- reported, but deliberately NOT subtracted: stock is inventory, and COGS
    -- already accounts for the goods that actually sold
    'stock_purchases', v_stock,
    'cogs', round(v_cogs, 2),
    'costed_sales', v_costed,
    -- how much of the period's sales the estimate could actually price
    'coverage', case when v_sales > 0 then round(v_costed / v_sales, 4) else 0 end,
    'uncosted_lines', v_uncosted,
    'products_missing_cost', to_jsonb(v_missing),
    'estimated_profit', round(v_sales - v_cogs - v_expenses, 2));
end $$;

revoke execute on function public.daily_profit_estimate(timestamptz, timestamptz) from public, anon;
grant execute on function public.daily_profit_estimate(timestamptz, timestamptz) to authenticated;
