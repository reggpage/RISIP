-- ============================================================================
-- Fix: a stock-age guard that hid everything, silently
-- ============================================================================
-- MEASURED on the first shop to join: 74 products indexed, 0 findable. Every
-- count was older than the 14-day default, so the marketplace held a full
-- catalogue and could return nothing, with no way for the shop to know why.
--
-- The guard is still right. A count from last month is not evidence that the
-- goods are on the shelf today, and ordering against one produces a delivery
-- that cannot be made. But 14 days was chosen before seeing how often a small
-- shop actually counts, and the honest answer is: not fortnightly.
--
-- Thirty days, and the age travels with every row regardless — a buyer always
-- reads "siku 17 zilizopita" and judges for themselves. The filter is the
-- backstop, not the disclosure.
--
-- The second half of this fix matters more than the number: the shop can now
-- SEE how many of its products are findable, so a guard that hides the
-- catalogue announces itself instead of looking like the feature is broken.

alter table public.company_marketplace_settings
  alter column max_stock_age_days set default 30;

-- Only shops that never chose a value. A shop that deliberately set 14 keeps
-- it; this corrects a default nobody picked, it does not overrule a decision.
update public.company_marketplace_settings
   set max_stock_age_days = 30, updated_at = now()
 where max_stock_age_days = 14;

-- ── Tell the shop what is actually reachable ─────────────────────────────
create or replace function public.marketplace_my_settings()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; s public.company_marketplace_settings; v_age integer;
begin
  v_company := private.marketplace_my_company(false);
  select * into s from public.company_marketplace_settings where company_id = v_company;
  v_age := coalesce(s.max_stock_age_days, 30);

  return jsonb_build_object(
    'companyId', v_company,
    'optIn', coalesce(s.opt_in, false),
    'sharePrices', coalesce(s.share_prices, false),
    'maxStockAgeDays', v_age,
    'optedInAt', s.opted_in_at,
    'indexedProducts', (select count(*)::int from public.marketplace_product_index i
                         where i.company_id = v_company),
    -- Indexed but too old to be returned. This is the number that explains an
    -- empty marketplace, and it was previously impossible to see.
    'staleProducts', (select count(*)::int
                      from public.marketplace_product_index i
                      where i.company_id = v_company
                        and coalesce((select max(x.counted_at) from public.stock_counts x
                                      where x.company_id = v_company
                                        and x.product_key = i.product_key),
                                     '-infinity'::timestamptz)
                            < now() - make_interval(days => v_age)),
    'countedProducts', (select count(distinct sc.product_key)::int
                        from public.stock_counts sc
                        where sc.company_id = v_company
                          and sc.counted_at >= now() - make_interval(days => v_age)),
    'ordersIncoming', (select count(*)::int from public.marketplace_order_requests o
                        where o.supplier_company_id = v_company and o.status = 'placed'),
    'ordersOutgoing', (select count(*)::int from public.marketplace_order_requests o
                        where o.buyer_company_id = v_company and o.status = 'placed')
  );
end $$;

revoke all on function public.marketplace_my_settings() from public, anon;
grant execute on function public.marketplace_my_settings() to authenticated;
grant execute on function public.marketplace_my_settings() to service_role;
