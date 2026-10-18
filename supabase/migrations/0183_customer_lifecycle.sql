-- Customer lifecycle behind the admin console: give an existing shop a trial,
-- create the subscription a pre-billing shop never got, and move a
-- subscription's plan, status and grace window deliberately and auditably.
--
-- WHY THIS EXISTS. 0155/0181 can change a subscription only when one already
-- exists — both `platform_admin_set_subscription_plan` and
-- `platform_admin_set_subscription_status` raise 'Company has no subscription'.
-- Every company that registered before billing was built has no row, and no
-- admin action anywhere sets `trial_ends_at`. So the console could not do the
-- one thing the business actually needs: hand an existing unpaid shop the same
-- five days a new shop gets from `wa_create_business`. These functions close
-- that gap.
--
-- READS return metadata only. WRITES are reason-gated and append to
-- `platform_admin_audit_logs`, exactly like the 0177/0181 operations.

-- ── Read: every shop with its subscription state ──────────────────────────
create or replace function public.platform_admin_subscriptions(
  p_search text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_rows jsonb;
begin
  r := private.require_platform_admin('read');
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."companyName"), '[]'::jsonb)
    into v_rows
  from (
    select
      c.id                                   as "companyId",
      c.name                                 as "companyName",
      (s.id is not null)                     as "hasSubscription",
      s.plan,
      s.status,
      s.trial_ends_at                        as "trialEndsAt",
      case when s.trial_ends_at is null then null
           else round(extract(epoch from (s.trial_ends_at - now())) / 86400.0, 2) end as "trialDaysLeft",
      s.grace_until                          as "graceUntil",
      s.current_period_end                   as "currentPeriodEnd"
    from public.companies c
    left join public.subscriptions s on s.company_id = c.id
    where v_search is null or c.name ilike '%' || v_search || '%'
    order by c.name
    limit v_limit
  ) x;
  return jsonb_build_object('asOf', now(), 'rows', v_rows);
end;
$$;

-- ── Read: one shop's subscription with the trial clock ────────────────────
create or replace function public.platform_admin_company_subscription(p_company_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v jsonb;
begin
  r := private.require_platform_admin('read');
  select jsonb_build_object(
    'companyId', c.id,
    'companyName', c.name,
    'hasSubscription', (s.id is not null),
    'plan', s.plan,
    'cycle', s.cycle,
    'status', s.status,
    'trialEndsAt', s.trial_ends_at,
    'trialDaysLeft', case when s.trial_ends_at is null then null
                          else round(extract(epoch from (s.trial_ends_at - now())) / 86400.0, 2) end,
    'graceUntil', s.grace_until,
    'currentPeriodEnd', s.current_period_end,
    'cancelledAt', s.cancelled_at
  )
  into v
  from public.companies c
  left join public.subscriptions s on s.company_id = c.id
  where c.id = p_company_id;
  if v is null then
    raise exception 'Company not found' using errcode = 'P0002', hint = 'company_not_found';
  end if;
  return v;
end;
$$;

-- ── Write: create the missing subscription (idempotent) ───────────────────
-- The fix for a shop that registered before billing existed. If a row is
-- already there nothing changes — being ABSENT is the only condition this
-- addresses, exactly like 0182.
create or replace function public.platform_admin_ensure_subscription(
  p_company_id uuid,
  p_plan text,
  p_trial_days integer,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_plan text := coalesce(nullif(btrim(coalesce(p_plan, '')), ''), 'ndogo');
  v_days integer := greatest(0, least(coalesce(p_trial_days, 0), 365));
  v_existed boolean;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if not exists (select 1 from public.billing_plans where code = v_plan) then
    raise exception 'Unknown plan' using errcode = 'P0001', hint = 'unknown_plan';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found' using errcode = 'P0002', hint = 'company_not_found';
  end if;
  select exists(select 1 from public.subscriptions where company_id = p_company_id) into v_existed;
  insert into public.subscriptions (
    company_id, plan, cycle, status, trial_ends_at,
    current_period_start, current_period_end, grace_until
  )
  values (
    p_company_id, v_plan, 'monthly',
    case when v_days > 0 then 'trialing' else 'active' end,
    case when v_days > 0 then clock_timestamp() + make_interval(days => v_days) else null end,
    current_date, (current_date + interval '1 month')::date, null
  )
  on conflict (company_id) do nothing;
  select jsonb_build_object('plan', plan, 'status', status, 'trialEndsAt', trial_ends_at) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'ensure_subscription', 'company', p_company_id,
    p_reason, jsonb_build_object('existed', v_existed), v_after);
  return v_after || jsonb_build_object('created', not v_existed);
end;
$$;

-- ── Write: give or extend a trial ─────────────────────────────────────────
-- EXTEND, never restart, and never backdate: the new end is measured from
-- whichever is later, the current trial end or now. A shop whose trial lapsed
-- yesterday gets a full window starting today; a shop mid-trial keeps what it
-- has and gains the days on top.
create or replace function public.platform_admin_set_trial(
  p_company_id uuid,
  p_days integer,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(1, least(coalesce(p_days, 5), 365));
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('status', status, 'trialEndsAt', trial_ends_at) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription; create one first' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set status = 'trialing',
         trial_ends_at = greatest(coalesce(trial_ends_at, clock_timestamp()), clock_timestamp())
                         + make_interval(days => v_days),
         grace_until = null,
         cancelled_at = null,
         updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('status', status, 'trialEndsAt', trial_ends_at) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_trial', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after || jsonb_build_object('grantedDays', v_days);
end;
$$;

-- ── Write: set the grace window ───────────────────────────────────────────
-- grace_until is a DATE: how long past current_period_end the shop keeps
-- writing. Zero clears it.
create or replace function public.platform_admin_set_subscription_grace(
  p_company_id uuid,
  p_grace_days integer,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r public.platform_admin_role;
  v_days integer := greatest(0, least(coalesce(p_grace_days, 0), 365));
  v_before jsonb;
  v_after jsonb;
begin
  r := private.require_platform_admin('write_company');
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  select jsonb_build_object('graceUntil', grace_until) into v_before
    from public.subscriptions where company_id = p_company_id;
  if v_before is null then
    raise exception 'Company has no subscription; create one first' using errcode = 'P0001', hint = 'no_subscription';
  end if;
  update public.subscriptions
     set grace_until = case when v_days = 0 then null else current_date + v_days end,
         updated_at = clock_timestamp()
   where company_id = p_company_id;
  select jsonb_build_object('graceUntil', grace_until) into v_after
    from public.subscriptions where company_id = p_company_id;
  perform private.platform_admin_audit(r, 'set_subscription_grace', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after || jsonb_build_object('graceDays', v_days);
end;
$$;

-- ── Grants: authenticated console users call these, service_role over API ──
do $grants$ declare signature text; begin
  foreach signature in array array[
    'platform_admin_subscriptions(text,integer)',
    'platform_admin_company_subscription(uuid)',
    'platform_admin_ensure_subscription(uuid,text,integer,text)',
    'platform_admin_set_trial(uuid,integer,text)',
    'platform_admin_set_subscription_grace(uuid,integer,text)'
  ] loop
    execute 'revoke all on function public.' || signature || ' from public, anon, authenticated, service_role';
    execute 'grant execute on function public.' || signature || ' to authenticated, service_role';
  end loop;
end;
$grants$;
