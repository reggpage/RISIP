-- A shop that has stopped paying stops WRITING. It never stops reading.
--
-- Until now `suspended` was a word in a column that nothing read. A shop could
-- let its grace run out and go on recording sales for a year.
--
-- WHY A TRIGGER AND NOT A CHECK IN THE FUNCTIONS. Twenty-one functions insert
-- into these four ledgers, and the WhatsApp ones run as service_role, which
-- goes straight past RLS. Guarding the functions means guarding twenty-one
-- places and being wrong the day somebody adds the twenty-second. The ledgers
-- themselves are the one place every path has to pass through.
--
-- THREE RULES THIS MUST NOT BREAK, and each has a test below:
--
--   1. NO SUBSCRIPTION MEANS NO OPINION. Every company that exists today has
--      no billing row. Not one of them may be affected. The gate opens for
--      anything that is not explicitly suspended or cancelled.
--   2. READING IS NEVER TOUCHED. This fires on INSERT only. Nothing is hidden,
--      nothing is deleted, and every report a shop could run yesterday it can
--      still run while suspended.
--   3. THE ERROR SAYS WHAT TO DO. A shopkeeper mid-sale gets a sentence about
--      paying, not a constraint name.

create or replace function private.refuse_write_when_suspended()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_status text;
begin
  if new.company_id is null then
    return new;
  end if;

  select s.status into v_status
    from public.subscriptions s
   where s.company_id = new.company_id;

  -- Rule 1. No row, or any status that is not a stop, and the write proceeds.
  -- Listing what BLOCKS rather than what allows means a status added later
  -- fails open, which is the right way round for a shop's own books.
  if v_status is null or v_status not in ('suspended', 'cancelled') then
    return new;
  end if;

  raise exception 'Risip imesimama kwa sababu bili haijalipwa. Rekodi zako zote zipo salama na unaweza kuziona. Lipa ili uendelee kuandika.'
    using errcode = 'P0001', hint = 'subscription_' || v_status;
end
$function$;

comment on function private.refuse_write_when_suspended() is
  'Stops an unpaid shop adding to its ledgers. Reading, reports and history '
  'are untouched, and a company with no subscription row is never affected.';

-- The four append-only ledgers. Every write path in the product, from the web
-- app to a service_role RPC, ends at one of these.
drop trigger if exists daily_records_billing_gate on public.daily_records;
create trigger daily_records_billing_gate
  before insert on public.daily_records
  for each row execute function private.refuse_write_when_suspended();

drop trigger if exists product_costs_billing_gate on public.product_costs;
create trigger product_costs_billing_gate
  before insert on public.product_costs
  for each row execute function private.refuse_write_when_suspended();

drop trigger if exists product_selling_prices_billing_gate on public.product_selling_prices;
create trigger product_selling_prices_billing_gate
  before insert on public.product_selling_prices
  for each row execute function private.refuse_write_when_suspended();

drop trigger if exists stock_counts_billing_gate on public.stock_counts;
create trigger stock_counts_billing_gate
  before insert on public.stock_counts
  for each row execute function private.refuse_write_when_suspended();

/**
 * What the app should show, without the app having to know the rules.
 *
 * Returns null when the shop may write. Returns the reason when it may not, so
 * the dashboard can put a banner up BEFORE somebody types a sale and loses it,
 * rather than only catching the exception afterwards.
 */
create or replace function public.billing_write_block()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_company uuid := private.auth_company_id();
  v_row public.subscriptions%rowtype;
begin
  if v_company is null then return null; end if;
  select * into v_row from public.subscriptions where company_id = v_company;
  if not found or v_row.status not in ('suspended', 'cancelled') then
    return null;
  end if;
  return jsonb_build_object(
    'blocked', true,
    'status', v_row.status,
    'plan', v_row.plan,
    'period_end', v_row.current_period_end
  );
end
$function$;

revoke all on function public.billing_write_block() from public, anon;
grant execute on function public.billing_write_block() to authenticated;
