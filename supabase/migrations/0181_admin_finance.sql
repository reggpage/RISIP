-- Platform finance, expense and credit-readiness modules behind the admin
-- console: which client is on which plan, what the platform collects, what it
-- spends, and which shop is doing well enough for a lending partner.
--
-- WHY THIS SHAPE. Money in (subscriptions + subscription_invoices, already in
-- 0159) and money out (new platform_expenses ledger below) share a rule: an
-- operator action that changes reality must be auditable months later. Every
-- mutation here appends to platform_admin_audit_logs with a reason, exactly
-- like the existing 0177 operations. Reads return aggregates only.
--
-- The performance/credit module exists so the platform can answer "which shop
-- is trustworthy" with data a lender can use: consistency, recorded sales,
-- debt repayment, WhatsApp activity and tenure. It is deliberately aggregate
-- (counts and sums per shop) -- raw ledgers and merchant messages never leave
-- the tenant.
--
-- JSON key style follows the admin console: camelCase (0155 precedent).

-- ── Private helpers (created only when missing) ────────────────────────────
-- 0155/0177 call private.platform_admin_role / require_platform_admin /
-- platform_admin_audit but their DDL was never captured in a migration: they
-- exist in production by hand. A database rebuilt from migrations therefore has
-- no admin console at all. We recreate them ONLY if missing, so production is
-- never touched and a fresh database comes up complete.

do $helpers$
begin
  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'platform_admin_role') then
    create function private.platform_admin_role() returns public.platform_admin_role
    language sql stable security definer set search_path = pg_catalog, public as $$
      select role from public.platform_admins where user_id = auth.uid() and active
    $$;
  end if;

  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'require_platform_admin') then
    create function private.require_platform_admin(p_level text) returns public.platform_admin_role
    language plpgsql security definer set search_path = pg_catalog, public as $$
    declare r public.platform_admin_role;
    begin
      select role into r from public.platform_admins where user_id = auth.uid() and active;
      if r is null then
        raise exception 'Not a platform admin' using errcode = 'P0001', hint = 'not_platform_admin';
      end if;
      case p_level
        when 'read' then null;
        when 'write_company' then
          if r not in ('super_admin', 'operations') then
            raise exception 'Not permitted for this admin role' using errcode = 'P0001', hint = 'no_permission';
          end if;
        else
          raise exception 'Unknown permission level' using errcode = 'P0001', hint = 'unknown_level';
      end case;
      return r;
    end $$;
  end if;

  if not exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'platform_admin_audit') then
    create function private.platform_admin_audit(
      p_role public.platform_admin_role,
      p_action text,
      p_target_type text,
      p_target_id uuid,
      p_reason text,
      p_before jsonb,
      p_after jsonb
    ) returns void
    language plpgsql security definer set search_path = pg_catalog, public as $$
    begin
      insert into public.platform_admin_audit_logs
        (admin_user_id, admin_role, action, target_type, target_id, reason, before_metadata, after_metadata)
      values (
        auth.uid(), p_role, p_action, p_target_type, p_target_id,
        left(btrim(coalesce(p_reason, '')), 1000),
        coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb)
      );
    end $$;
  end if;
end $helpers$;

-- ── Money out: the platform expense ledger ─────────────────────────────────
-- Every rupee the platform costs to run, as recorded by whoever accepted the
-- bill. company_id null means a platform-wide cost (storage, WhatsApp API,
-- Resend, edge runtime) rather than something attributable to one client.
create table if not exists public.platform_expenses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete set null,
  category    text not null check (category in (
                'storage', 'whatsapp_api', 'email_resend', 'edge_runtime',
                'ai_override', 'snippe_fees', 'infrastructure', 'support',
                'marketing', 'tax', 'other'
              )),
  description text not null check (length(btrim(description)) between 1 and 500),
  amount_tzs  integer not null check (amount_tzs > 0),
  occurred_on date not null default current_date,
  -- Nullable on purpose: a console operator may not have a profiles row. Who
  -- accepted the expense is still in the audit log (admin_user_id).
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default clock_timestamp()
);

create index if not exists platform_expenses_occurred_idx
  on public.platform_expenses (occurred_on desc);
create index if not exists platform_expenses_company_occurred_idx
  on public.platform_expenses (company_id, occurred_on desc);

alter table public.platform_expenses enable row level security;
revoke all on table public.platform_expenses from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_expenses to service_role;

-- ── Income: the billing picture ────────────────────────────────────────────
create function public.platform_admin_billing(p_days integer default 30)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(1, least(p_days, 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'asOf', now(),
    'days', v_days,
    'companies', jsonb_build_object(
      'total', (select count(*)::int from public.companies),
      'active', (select count(*)::int from public.companies c
                 left join public.company_platform_controls pc on pc.company_id = c.id
                 where coalesce(pc.platform_status, 'active') = 'active'),
      'trialing', (select count(*)::int from public.subscriptions where status = 'trialing'),
      'pastDue', (select count(*)::int from public.subscriptions where status = 'past_due'),
      'suspended', (select count(*)::int from public.subscriptions where status = 'suspended'),
      'cancelled', (select count(*)::int from public.subscriptions where status = 'cancelled')
    ),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan', plan, 'count', count))
                       from (select plan, count(*) as count from public.subscriptions
                             where status <> 'cancelled' group by plan order by plan) s), '[]'::jsonb),
    'invoices', jsonb_build_object(
      'open', (select count(*)::int from public.subscription_invoices where status = 'open'),
      'paid', (select count(*)::int from public.subscription_invoices where status = 'paid'),
      'failed', (select count(*)::int from public.subscription_invoices where status = 'failed'),
      'void', (select count(*)::int from public.subscription_invoices where status = 'void'),
      'collectedTzs', coalesce((select sum(amount_tzs) from public.subscription_invoices
                                where status = 'paid' and created_at >= v_start), 0),
      'openTzs', coalesce((select sum(amount_tzs) from public.subscription_invoices
                           where status in ('open', 'failed') and created_at >= v_start), 0)
    ),
    'recentInvoices', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', i.id, 'companyId', i.company_id,
                                  'companyName', c.name, 'plan', i.plan,
                                  'amountTzs', i.amount_tzs, 'status', i.status,
                                  'createdAt', i.created_at))
                                from public.subscription_invoices i
                                join public.companies c on c.id = i.company_id
                                order by i.created_at desc limit 20), '[]'::jsonb)
  );
end;
$$;

-- ── One client's full finance picture ──────────────────────────────────────
create function public.platform_admin_company_finance(p_company_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  c public.companies;
begin
  r := private.require_platform_admin('read');
  select co.id, co.name, co.hq_location, co.sector, co.currency, co.created_at
    into c.id, c.name, c.hq_location, c.sector, c.currency, c.created_at
    from public.companies co
   where co.id = p_company_id;
  if c.id is null then
    raise exception 'Company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;
  return jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'hqLocation', c.hq_location,
      'sector', c.sector, 'currency', c.currency, 'createdAt', c.created_at,
      'platformStatus', (select coalesce(pc.platform_status, 'active') from public.company_platform_controls pc where pc.company_id = c.id),
      'whatsappAiEnabled', (select coalesce(pc.whatsapp_ai_enabled, true) from public.company_platform_controls pc where pc.company_id = c.id)
    ),
    'subscription', (select jsonb_build_object(
                        'plan', s.plan, 'status', s.status,
                        'graceUntil', s.grace_until, 'currentPeriodEnd', s.current_period_end,
                        'startedAt', s.created_at, 'updatedAt', s.updated_at)
                      from public.subscriptions s where s.company_id = c.id),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'plan', i.plan, 'amountTzs', i.amount_tzs,
                             'status', i.status, 'periodStart', i.period_start,
                             'periodEnd', i.period_end, 'createdAt', i.created_at,
                             'paidAt', i.paid_at))
                           from (select * from public.subscription_invoices
                                 where company_id = c.id order by created_at desc) i), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', e.id, 'category', e.category, 'description', e.description,
                             'amountTzs', e.amount_tzs, 'occurredOn', e.occurred_on,
                             'createdAt', e.created_at))
                           from (select * from public.platform_expenses
                                 where company_id = c.id order by occurred_on desc, created_at desc limit 50) e), '[]'::jsonb),
    'aiUsage', jsonb_build_object(
      'days', (select count(*)::int from public.whatsapp_ai_usage_daily where company_id = c.id and usage_day >= current_date - 30),
      'requests30d', (select coalesce(sum(fallback_count), 0)::int from public.whatsapp_ai_usage_daily where company_id = c.id and usage_day >= current_date - 30),
      'costUsd30d', (select coalesce(sum(estimated_cost), 0) from public.whatsapp_ai_usage_daily where company_id = c.id and usage_day >= current_date - 30)
    )
  );
end;
$$;

-- ── Client lifecycle: audited subscription changes ─────────────────────────
create function public.platform_admin_set_subscription_plan(p_company_id uuid, p_plan text, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if not exists (select 1 from public.billing_plans where code = p_plan) then
    raise exception 'Unknown plan' using errcode = 'P0001', hint = 'unknown_plan';
  end if;
  select jsonb_build_object('plan', plan) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set plan = p_plan, updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('plan', plan) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_subscription_plan', 'company', p_company_id,
    p_reason, v_before, v_after);
end;
$$;

create function public.platform_admin_set_subscription_status(p_company_id uuid, p_status text, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if p_status not in ('trialing', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Invalid subscription status' using errcode = 'P0001', hint = 'bad_status';
  end if;
  select jsonb_build_object('status', status, 'grace_until', grace_until) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set status = p_status,
         grace_until = case when p_status = 'active' then null else grace_until end,
         updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('status', status, 'grace_until', grace_until) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_subscription_status', 'company', p_company_id,
    p_reason, v_before, v_after);
end;
$$;

-- ── A payment that arrived by hand or webhook: mark it, name who marked it ──
create function public.platform_admin_mark_invoice_paid(p_invoice_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_before jsonb;
  v_rows bigint;
begin
  r := private.require_platform_admin('read');
  if r not in ('super_admin', 'finance', 'operations') then
    raise exception 'Not permitted for money operations' using errcode = 'P0001', hint = 'no_permission';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('status', status, 'company_id', company_id) into v_before
    from public.subscription_invoices where id = p_invoice_id;
  if v_before is null then
    raise exception 'Invoice not found' using errcode = 'P0001', hint = 'invoice_not_found';
  end if;
  update public.subscription_invoices
     set status = 'paid',
         paid_at = clock_timestamp(),
         paid_manually_by = (select id from public.profiles where id = auth.uid())
   where id = p_invoice_id and status in ('open', 'failed');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Only open or failed invoices may be marked paid' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  perform private.platform_admin_audit(r, 'mark_invoice_paid', 'subscription_invoice', p_invoice_id,
    p_reason, v_before, jsonb_build_object('status', 'paid', 'admin_user_id', auth.uid()));
end;
$$;

-- ── Money out: record and read the expense ledger ──────────────────────────
create function public.platform_admin_record_expense(
  p_company_id uuid,
  p_category text,
  p_description text,
  p_amount_tzs integer,
  p_occurred_on date default current_date
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_id uuid;
begin
  r := private.require_platform_admin('read');
  if r not in ('super_admin', 'finance', 'operations') then
    raise exception 'Not permitted for money operations' using errcode = 'P0001', hint = 'no_permission';
  end if;
  if p_category not in ('storage', 'whatsapp_api', 'email_resend', 'edge_runtime',
                        'ai_override', 'snippe_fees', 'infrastructure', 'support',
                        'marketing', 'tax', 'other') then
    raise exception 'Unknown expense category' using errcode = 'P0001', hint = 'bad_category';
  end if;
  if p_amount_tzs is null or p_amount_tzs <= 0 then
    raise exception 'Amount must be positive' using errcode = 'P0001', hint = 'bad_amount';
  end if;
  insert into public.platform_expenses
    (company_id, category, description, amount_tzs, occurred_on, recorded_by)
  values
    (p_company_id, p_category, btrim(p_description), p_amount_tzs, coalesce(p_occurred_on, current_date),
     (select id from public.profiles where id = auth.uid()))
  returning id into v_id;
  perform private.platform_admin_audit(r, 'record_expense', 'platform_expense', v_id,
    p_description, '{}'::jsonb, jsonb_build_object(
      'company_id', p_company_id, 'category', p_category, 'amount_tzs', p_amount_tzs,
      'occurred_on', coalesce(p_occurred_on, current_date)
    ));
  return v_id;
end;
$$;

create function public.platform_admin_expense_overview(p_from date, p_to date)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_from date := coalesce(p_from, current_date - 90);
  v_to date := coalesce(p_to, current_date);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'platformLedgerTzs', coalesce((select sum(amount_tzs) from public.platform_expenses
                                   where occurred_on between v_from and v_to), 0),
    'byCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'count', count, 'totalTzs', totalTzs))
                            from (select category, count(*)::int as count, sum(amount_tzs) as totalTzs
                                  from public.platform_expenses
                                  where occurred_on between v_from and v_to
                                  group by category order by totalTzs desc) s), '[]'::jsonb),
    'byCompany', coalesce((select jsonb_agg(jsonb_build_object('companyId', company_id, 'companyName', c.name, 'totalTzs', totalTzs))
                           from (select e.company_id, sum(e.amount_tzs) as totalTzs
                                 from public.platform_expenses e
                                 where e.company_id is not null
                                   and e.occurred_on between v_from and v_to
                                 group by e.company_id order by totalTzs desc limit 10) s
                           left join public.companies c on c.id = s.company_id), '[]'::jsonb),
    'aiCostUsd', coalesce((select sum(estimated_cost) from public.whatsapp_ai_usage_daily
                           where usage_day between v_from and v_to), 0)
  );
end;
$$;

create function public.platform_admin_list_expenses(p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', e.id, 'companyId', e.company_id, 'companyName', c.name,
                        'category', e.category, 'description', e.description,
                        'amountTzs', e.amount_tzs, 'occurredOn', e.occurred_on,
                        'createdAt', e.created_at, 'recordedBy', e.recorded_by))
                      from public.platform_expenses e
                      left join public.companies c on c.id = e.company_id
                      order by e.occurred_on desc, e.created_at desc
                      limit greatest(1, least(coalesce(p_limit, 100), 500))
                      offset greatest(0, coalesce(p_offset, 0))), '[]'::jsonb),
    'total', (select count(*)::int from public.platform_expenses)
  );
end;
$$;

-- ── Credit-readiness: which shop is doing well, in aggregates ──────────────
-- A lender wants to know: how long, how consistently, how much trade, and
-- whether money owed comes back. All four are answered here with counts and
-- sums; no individual record, message or price leaves these functions.
create function public.platform_admin_performance(p_days integer default 180, p_limit integer default 100)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(30, least(coalesce(p_days, 180), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'asOf', now(),
    'shops', coalesce((select jsonb_agg(to_jsonb(x))
                       from (
                         with base as (
                           select
                             c.id as company_id, c.name, c.hq_location, c.sector, c.created_at,
                             coalesce(s.plan, 'none') as plan,
                             coalesce(s.status, 'none') as subscription_status,
                             (select count(*)::int from public.whatsapp_messages w
                              where w.company_id = c.id and w.created_at >= v_start) as messages,
                             (select count(distinct w.created_at::date) from public.whatsapp_messages w
                              where w.company_id = c.id and w.created_at >= v_start) as wa_days,
                             (select count(distinct d.occurred_at::date) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.occurred_at >= v_start) as record_days,
                             (select count(distinct rc.created_at::date) from public.receipts rc
                              where rc.company_id = c.id and rc.created_at >= v_start) as receipt_days,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'sale' and d.occurred_at >= v_start) as sales_tzs,
                             (select count(*)::int from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'sale' and d.occurred_at >= v_start) as sales_count,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'expense' and d.occurred_at >= v_start) as expenses_tzs,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'debt_issued' and d.occurred_at >= v_start) as debt_tzs,
                             (select coalesce(sum(d.amount), 0) from public.daily_records d
                              where d.company_id = c.id and d.status = 'confirmed' and d.kind = 'customer_payment' and d.occurred_at >= v_start) as repaid_tzs,
                             (select count(*)::int from public.receipts rc
                              where rc.company_id = c.id and rc.status = 'confirmed' and rc.created_at >= v_start) as receipts_confirmed,
                             (select count(*)::int from public.invoices i
                              join public.projects p on p.id = i.project_id
                              where p.company_id = c.id and i.created_at >= v_start) as invoices_count,
                             (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u
                              where u.company_id = c.id and u.usage_day >= current_date - v_days) as ai_cost_usd
                           from public.companies c
                           left join public.subscriptions s on s.company_id = c.id
                           left join public.company_platform_controls pc on pc.company_id = c.id
                           where coalesce(pc.platform_status, 'active') = 'active'
                         )
                         select
                           company_id as "companyId", name as "companyName", hq_location as "hqLocation",
                           sector, created_at as "createdAt", plan, subscription_status as "subscriptionStatus",
                           messages, wa_days as "waDays", record_days as "recordDays", receipt_days as "receiptDays",
                           greatest(wa_days, record_days, receipt_days) as "activeDays",
                           sales_tzs as "salesTzs", sales_count as "salesCount", expenses_tzs as "expensesTzs",
                           debt_tzs as "debtTzs", repaid_tzs as "repaidTzs",
                           receipts_confirmed as "receiptsConfirmed", invoices_count as "invoicesCount",
                           ai_cost_usd as "aiCostUsd",
                           round(case when debt_tzs > 0 then (repaid_tzs * 100.0 / debt_tzs) else 100 end, 1) as "repaymentPct",
                           round((greatest(wa_days, record_days, receipt_days) * 100.0) / v_days, 1) as "consistencyPct",
                           (select count(*)::int from public.projects p where p.company_id = x.company_id and p.status = 'active') as "activeProjects",
                           round((
                             0.25 * least((greatest(wa_days, record_days, receipt_days) * 1.0) / v_days, 1) +
                             0.25 * least((sales_tzs * 1.0) / (v_days * 100000), 1) +
                             0.25 * (case when debt_tzs > 0 then (repaid_tzs / debt_tzs) else 1 end) +
                             0.15 * least((messages * 1.0) / (v_days * 5), 1) +
                             0.10 * least(((now()::date - created_at::date) * 1.0) / 365, 1)
                           ) * 100, 1) as "score"
                         from base x
                         order by score desc
                         limit greatest(1, least(coalesce(p_limit, 100), 500))
                       ) x), '[]'::jsonb)
  );
end;
$$;

-- ── Full product support: B2B orders, WhatsApp identities, scanner ─────────
create function public.platform_admin_shop_orders(p_days integer default 30)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'counts', jsonb_build_object(
      'placed', (select count(*)::int from public.shop_orders where placed_at >= v_start),
      'accepted', (select count(*)::int from public.shop_orders where accepted_at >= v_start),
      'delivered', (select count(*)::int from public.shop_orders where delivered_at >= v_start),
      'verified', (select count(*)::int from public.shop_orders where verified_at >= v_start),
      'rejected', (select count(*)::int from public.shop_orders where rejected_at >= v_start),
      'cancelled', (select count(*)::int from public.shop_orders where cancelled_at >= v_start)
    ),
    'totalWholesaleTzs', round(coalesce((select sum(total_wholesale) from public.shop_orders
                                         where placed_at >= v_start), 0), 2),
    'activeSuppliers', (select count(*)::int from public.company_suppliers where active),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', o.id, 'orderNo', o.order_no, 'status', o.status,
                         'totalWholesale', o.total_wholesale, 'currency', o.currency,
                         'placedAt', o.placed_at, 'verifiedAt', o.verified_at,
                         'buyer', b.name, 'supplier', s.name))
                        from public.shop_orders o
                        join public.companies b on b.id = o.buyer_company_id
                        join public.companies s on s.id = o.supplier_company_id
                        where o.placed_at >= v_start
                        order by o.placed_at desc limit 20), '[]'::jsonb)
  );
end;
$$;

create function public.platform_admin_whatsapp_identities()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', i.id, 'companyId', i.company_id, 'companyName', c.name,
                        'phoneE164', i.phone_e164, 'verifiedAt', i.verified_at,
                        'revokedAt', i.revoked_at, 'optedOutAt', i.opted_out_at,
                        'memberName', coalesce(p.full_name, '?')))
                      from public.whatsapp_identities i
                      join public.companies c on c.id = i.company_id
                      left join public.profiles p on p.id = i.profile_id
                      order by i.verified_at desc limit 200), '[]'::jsonb)
  );
end;
$$;

create function public.platform_admin_deactivate_whatsapp_identity(p_identity_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_before jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('revoked_at', revoked_at, 'company_id', company_id) into v_before
    from public.whatsapp_identities where id = p_identity_id;
  if v_before is null then
    raise exception 'Identity not found' using errcode = 'P0001', hint = 'identity_not_found';
  end if;
  update public.whatsapp_identities
     set revoked_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_identity_id and revoked_at is null;
  perform private.platform_admin_audit(r, 'deactivate_whatsapp_identity', 'whatsapp_identity', p_identity_id,
    p_reason, v_before, jsonb_build_object('revoked_at', clock_timestamp()));
end;
$$;

create function public.platform_admin_scanner_ops()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'companyId', c.id, 'companyName', c.name,
                        'scannerInboxToken', c.scanner_inbox_token, 'scannerSenderEmail', c.scanner_sender_email,
                        'inboundCount', (select count(*)::int from public.receipts rc
                                         where rc.company_id = c.id and rc.source = 'inbound'),
                        'lastInboundAt', (select max(rc.created_at) from public.receipts rc
                                          where rc.company_id = c.id and rc.source = 'inbound')))
                      from public.companies c
                      where c.scanner_inbox_token is not null
                       or c.scanner_sender_email is not null
                      order by c.created_at desc limit 200), '[]'::jsonb)
  );
end;
$$;

create function public.platform_admin_company_health(p_company_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
begin
  r := private.require_platform_admin('read');
  return jsonb_build_object(
    'receipts', jsonb_build_object(
      'total', (select count(*)::int from public.receipts where company_id = p_company_id),
      'confirmed', (select count(*)::int from public.receipts where company_id = p_company_id and status = 'confirmed'),
      'pendingReview', (select count(*)::int from public.receipts where company_id = p_company_id and status = 'pending_review'),
      'duplicate', (select count(*)::int from public.receipts where company_id = p_company_id and status = 'duplicate'),
      'rejected', (select count(*)::int from public.receipts where company_id = p_company_id and status in ('rejected', 'error'))
    ),
    'invoices', jsonb_build_object(
      'count', (select count(*)::int from public.invoices i join public.projects p on p.id = i.project_id where p.company_id = p_company_id),
      'totalTzs', round(coalesce((select sum(i.total_amount) from public.invoices i join public.projects p on p.id = i.project_id where p.company_id = p_company_id), 0), 2)
    ),
    'projects', (select count(*)::int from public.projects where company_id = p_company_id and status = 'active'),
    'members', (select count(*)::int from public.company_members where company_id = p_company_id and deactivated_at is null),
    'whatsappIdentities', (select count(*)::int from public.whatsapp_identities where company_id = p_company_id and revoked_at is null and opted_out_at is null),
    'dailyRecords30d', (select count(*)::int from public.daily_records where company_id = p_company_id and occurred_at >= now() - interval '30 days')
  );
end;
$$;

-- ── Grants: authenticated console users call these, service_role over API ──
do $grants$ declare signature text; begin
  foreach signature in array array[
    'platform_admin_billing(integer)',
    'platform_admin_company_finance(uuid)',
    'platform_admin_set_subscription_plan(uuid,text,text)',
    'platform_admin_set_subscription_status(uuid,text,text)',
    'platform_admin_mark_invoice_paid(uuid,text)',
    'platform_admin_record_expense(uuid,text,text,integer,date)',
    'platform_admin_expense_overview(date,date)',
    'platform_admin_list_expenses(integer,integer)',
    'platform_admin_performance(integer,integer)',
    'platform_admin_shop_orders(integer)',
    'platform_admin_whatsapp_identities()',
    'platform_admin_deactivate_whatsapp_identity(uuid,text)',
    'platform_admin_scanner_ops()',
    'platform_admin_company_health(uuid)'
  ] loop
    execute 'revoke all on function public.' || signature || ' from public, anon, authenticated, service_role';
    execute 'grant execute on function public.' || signature || ' to authenticated, service_role';
  end loop;
