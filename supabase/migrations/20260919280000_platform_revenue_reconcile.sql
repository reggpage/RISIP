-- ============================================================================
-- Income the console reports must be income Snippe actually settled
-- ============================================================================
-- platform_admin_billing computed collected revenue as
--
--   sum(amount_tzs) where status = 'paid' and created_at >= window_start
--
-- Three things wrong with that, all of them invisible while there are two
-- invoices in the table and all of them expensive once there are hundreds.
--
-- 1. WRONG DATE. created_at is when the invoice was RAISED. "Income in the
--    last 30 days" has to mean money that ARRIVED in those 30 days. An invoice
--    raised in August and paid in September was counted in August and missing
--    from September. paid_at is the column that answers the question asked.
--
-- 2. WRONG DEFINITION OF PAID. status='paid' is also set by
--    platform_admin_mark_invoice_paid, an operator saying so. That money may
--    never have reached Snippe. The figure therefore mixed settled cash with
--    assertions and offered no way to tell them apart.
--
-- 3. NO RECONCILIATION. The truth of "did Snippe settle this" is
--    snippe_status='completed', written by the snippe-webhook. Nothing checked
--    that the two agreed, so a row could read status='paid' with
--    snippe_status='failed' and still be counted as income.
--
-- What this returns instead, kept apart on purpose so they can be compared
-- rather than blended:
--
--   settledTzs   - Snippe says completed. This is the bank figure.
--   manualTzs    - marked paid by an operator, no Snippe settlement.
--   mismatchTzs  - status='paid' but Snippe does not agree. Should be zero;
--                  if it is not, that is the number to investigate first.

create or replace function public.platform_admin_revenue(p_days integer default 30)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  perform private.require_platform_admin('read');

  return jsonb_build_object(
    'days', v_days,
    -- Everything below windows on paid_at: when the money arrived.
    'settledTzs', coalesce((select sum(i.amount_tzs) from public.subscription_invoices i
                             where i.snippe_status = 'completed'
                               and i.paid_at >= v_start), 0),
    'settledCount', (select count(*)::int from public.subscription_invoices i
                      where i.snippe_status = 'completed' and i.paid_at >= v_start),
    -- An operator marked it paid and Snippe never confirmed. Legitimate for
    -- cash taken outside the gateway; still not gateway income, so it is named
    -- separately rather than folded in.
    'manualTzs', coalesce((select sum(i.amount_tzs) from public.subscription_invoices i
                            where i.status = 'paid'
                              and coalesce(i.snippe_status, '') <> 'completed'
                              and i.paid_at >= v_start), 0),
    'manualCount', (select count(*)::int from public.subscription_invoices i
                     where i.status = 'paid'
                       and coalesce(i.snippe_status, '') <> 'completed'
                       and i.paid_at >= v_start),
    -- The reconciliation alarm. Non-zero means the ledger and the gateway
    -- disagree about real money.
    'mismatchTzs', coalesce((select sum(i.amount_tzs) from public.subscription_invoices i
                              where i.status = 'paid'
                                and i.snippe_status is not null
                                and i.snippe_status <> 'completed'), 0),
    'mismatchCount', (select count(*)::int from public.subscription_invoices i
                       where i.status = 'paid'
                         and i.snippe_status is not null
                         and i.snippe_status <> 'completed'),
    -- Paid with no paid_at at all: the row cannot be placed in any period, so
    -- it silently vanishes from every window. Worth seeing.
    'undatedPaidCount', (select count(*)::int from public.subscription_invoices i
                          where i.status = 'paid' and i.paid_at is null),
    'openTzs', coalesce((select sum(i.amount_tzs) from public.subscription_invoices i
                          where i.status in ('open', 'due', 'overdue')), 0),
    'openCount', (select count(*)::int from public.subscription_invoices i
                   where i.status in ('open', 'due', 'overdue')),
    -- Every distinct gateway state, so an unfamiliar one is visible rather
    -- than quietly bucketed as "not completed".
    'bySnippeStatus', coalesce((select jsonb_agg(jsonb_build_object(
                                  'snippeStatus', coalesce(x.snippe_status, 'none'),
                                  'invoiceStatus', x.status,
                                  'count', x.n, 'totalTzs', x.tzs) order by x.n desc)
                                from (select snippe_status, status, count(*)::int as n,
                                             sum(amount_tzs) as tzs
                                      from public.subscription_invoices
                                      group by snippe_status, status) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', r.id, 'companyName', r.name, 'plan', r.plan,
                          'amountTzs', r.amount_tzs, 'status', r.status,
                          'snippeStatus', r.snippe_status, 'reference', r.snippe_reference,
                          'paidAt', r.paid_at, 'manual', r.paid_manually_by is not null,
                          'createdAt', r.created_at))
                        from (select i.id, c.name, i.plan, i.amount_tzs, i.status,
                                     i.snippe_status, i.snippe_reference, i.paid_at,
                                     i.paid_manually_by, i.created_at
                              from public.subscription_invoices i
                              join public.companies c on c.id = i.company_id
                              order by coalesce(i.paid_at, i.created_at) desc
                              limit 50) r), '[]'::jsonb)
  );
end $$;

revoke all on function public.platform_admin_revenue(integer) from public, anon;
grant execute on function public.platform_admin_revenue(integer) to authenticated;
grant execute on function public.platform_admin_revenue(integer) to service_role;
