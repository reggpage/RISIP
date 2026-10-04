-- Per-plan feature capabilities, readable by any authenticated company member.
--
-- WHY THIS EXISTS. RLS on subscriptions is owner-only, which is correct for
-- billing but means a worker or accountant cannot know whether barcode selling,
-- reports or profit-per-product is included in their plan. This function reads
-- the subscription for the caller's company and returns a capability map so the
-- frontend can lock or unlock features without exposing billing details.
--
-- NO SUBSCRIPTION MEANS EVERYTHING OPEN. A company that has not yet subscribed
-- gets the full product — the trial is generous and the free week should not
-- feel crippled. When the owner pays, capabilities narrow to the plan.
-- This matches the philosophy in 0161: no billing row is no opinion.
--
-- SECURITY DEFINER so the caller (any role) can read the subscription row,
-- which is otherwise owner-only. search_path is pinned.

create or replace function public.company_plan_caps()
returns jsonb
language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(
    (
      select jsonb_build_object(
        'plan', s.plan,
        'status', s.status,
        -- Kianzio / Ndogo / Kati / Kubwa feature matrix
        'barcode_sell',      s.plan in ('kati', 'kubwa'),
        'barcode_register',  s.plan in ('kati', 'kubwa'),
        'reports',           s.plan in ('kati', 'kubwa'),
        'debts',             s.plan in ('kati', 'kubwa'),
        'profit_per_product', s.plan in ('kati', 'kubwa'),
        'pdf_invoices',      s.plan in ('kubwa'),
        'export',            s.plan in ('kubwa'),
        'compare_shops',     s.plan in ('kubwa'),
        -- B2B inter-shop ordering ("Agizo la bidhaa"): one shop buys stock
        -- from another. Kati and above, alongside the other staff/debt tools.
        'b2b_orders',        s.plan in ('kati', 'kubwa'),
        'max_users',         p.max_users,
        'max_projects',      p.max_projects,
        'message_allowance', p.message_allowance
      )
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
      where s.company_id = private.auth_company_id()
        and s.status in ('trialing', 'active', 'past_due', 'suspended')
      limit 1
    ),
    -- No subscription or cancelled: everything open.
    jsonb_build_object(
      'plan', null,
      'status', null,
      'barcode_sell', true,
      'barcode_register', true,
      'reports', true,
      'debts', true,
      'profit_per_product', true,
      'pdf_invoices', true,
      'export', true,
      'compare_shops', true,
      'b2b_orders', true,
      'max_users', 999,
      'max_projects', 999,
      'message_allowance', null
    )
  );
$function$;

revoke all on function public.company_plan_caps() from public, anon;
grant execute on function public.company_plan_caps() to authenticated;
