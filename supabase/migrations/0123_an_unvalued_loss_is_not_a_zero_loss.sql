-- A loss nobody could price is not a loss that cost nothing.
--
-- 0122 let a stock_loss carry amount = 0 so that inventory stays correct when a
-- product has no recorded buying cost. That was right for the shelf and
-- dangerous for the books: summing amounts would then report a shop that threw
-- away eight kilos of liver as having lost TSh 0, and the profit estimate would
-- look complete while being blind to the whole event.
--
-- No new column is needed to tell the two apart, and this was checked rather
-- than assumed: product_costs carries `check (unit_cost > 0)`, so a cost of
-- zero cannot exist. A VALUED loss therefore always has amount > 0, and on a
-- stock_loss `amount = 0` unambiguously means "not valued".
--
-- The estimate now says so out loud. Callers get:
--
--   stock_losses                  the money that IS accounted for
--   unvalued_stock_losses         how many events carry no value at all
--   stock_loss_valuation_complete false while any of them do
--
-- estimated_profit still subtracts what is known and never invents what is not.
-- A missing cost is reported as missing; it is not filled in.
--
-- ROLLBACK: restore daily_profit_estimate from 0121.

create or replace function public.daily_profit_estimate(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_company uuid := private.auth_company_id();
  v_sales numeric := 0; v_expenses numeric := 0; v_stock numeric := 0;
  v_losses numeric := 0; v_owner_use numeric := 0;
  v_unvalued_losses int := 0;
  v_cogs numeric := 0; v_costed numeric := 0; v_uncosted int := 0; v_missing text[];
begin
  if v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;

  select coalesce(sum(amount) filter (where kind = 'sale'), 0),
         coalesce(sum(amount) filter (where kind = 'expense'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_purchase'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_loss'), 0),
         coalesce(sum(amount) filter (where kind = 'owner_use'), 0),
         count(*) filter (where kind = 'stock_loss' and amount = 0)
    into v_sales, v_expenses, v_stock, v_losses, v_owner_use, v_unvalued_losses
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
    'stock_purchases', v_stock,
    'stock_losses', v_losses,
    'unvalued_stock_losses', v_unvalued_losses,
    'stock_loss_valuation_complete', v_unvalued_losses = 0,
    'owner_use', v_owner_use,
    'cogs', round(v_cogs, 2),
    'costed_sales', v_costed,
    'coverage', case when v_sales > 0 then round(v_costed / v_sales, 4) else 0 end,
    'uncosted_lines', v_uncosted,
    'products_missing_cost', to_jsonb(v_missing),
    'estimated_profit', round(v_sales - v_cogs - v_expenses - v_losses, 2));
end;
$fn$;

revoke all on function public.daily_profit_estimate(timestamptz, timestamptz) from public, anon;
grant execute on function public.daily_profit_estimate(timestamptz, timestamptz) to authenticated;
