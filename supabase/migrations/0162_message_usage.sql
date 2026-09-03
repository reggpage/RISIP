-- Counting what a shop actually uses, so the allowance on the price list is a
-- real number rather than a promise.
--
-- WHAT IS COUNTED, AND WHY IT IS ONLY ONE DIRECTION. whatsapp_messages records
-- messages that ARRIVE. Nothing records the replies that leave, so counting
-- "both directions" would mean adding a database write to the hot reply path,
-- on a product whose owner has spent weeks making replies faster. The unit
-- customers are sold is therefore the message THEY send, which is the one we
-- can count exactly, and it is also the unit the cost model was always built
-- on: outbound was priced as a multiple of inbound, never capped separately.
--
-- THE ALLOWANCE IS SOFT, ON PURPOSE. Nothing here blocks anybody. A shopkeeper
-- mid-sale must never be stopped by a counter, and the plan the owner chose is
-- to notice, then ask, then move them up. This migration builds the noticing.
--
-- APPEND-ONE-ROW-PER-PERIOD. Usage is stored per billing period rather than as
-- a running total, because "has this shop gone over two months in a row?" is
-- the question the upgrade rule is written in, and a single counter cannot
-- answer it.

create table if not exists public.subscription_usage (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  company_id       uuid not null references public.companies(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  /** Messages the shop sent to Risip inside this period. */
  messages_used    integer not null default 0 check (messages_used >= 0),
  /** Snapshotted from the plan, so a later price change does not rewrite history. */
  allowance        integer not null check (allowance > 0),
  refreshed_at     timestamptz not null default clock_timestamp(),
  constraint subscription_usage_period_forward check (period_end > period_start)
);

create unique index if not exists subscription_usage_one_per_period
  on public.subscription_usage (subscription_id, period_start);

create index if not exists subscription_usage_by_company_idx
  on public.subscription_usage (company_id, period_start desc);

comment on table public.subscription_usage is
  'One row per subscription per billing period. Counts messages the shop sent. '
  'Never blocks anything: the allowance is soft and enforcement is a '
  'conversation, not a wall.';

-- The count runs over this every day, for every live shop.
create index if not exists whatsapp_messages_company_created_idx
  on public.whatsapp_messages (company_id, created_at);

/**
 * Recompute usage for the CURRENT period of every subscription that is running.
 *
 * Recomputed rather than incremented: a counter that drifts is worse than no
 * counter, and this is cheap enough to redo from the source every day.
 */
create or replace function public.billing_refresh_usage()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_rows integer := 0;
  v_over integer := 0;
begin
  with counted as (
    insert into public.subscription_usage
      (subscription_id, company_id, period_start, period_end, messages_used, allowance)
    select s.id,
           s.company_id,
           s.current_period_start,
           s.current_period_end,
           (select count(*)
              from public.whatsapp_messages m
             where m.company_id = s.company_id
               and m.created_at >= s.current_period_start::timestamptz
               and m.created_at <  (s.current_period_end + 1)::timestamptz),
           p.message_allowance
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
     where s.status in ('trialing', 'active', 'past_due', 'suspended')
    on conflict (subscription_id, period_start) do update
      set messages_used = excluded.messages_used,
          period_end    = excluded.period_end,
          allowance     = excluded.allowance,
          refreshed_at  = clock_timestamp()
    returning messages_used, allowance
  )
  select count(*), count(*) filter (where messages_used > allowance)
    into v_rows, v_over
    from counted;

  return jsonb_build_object(
    'ran_at', clock_timestamp(),
    'subscriptions_counted', v_rows,
    'over_allowance', v_over
  );
end
$function$;

comment on function public.billing_refresh_usage() is
  'Recomputes this period''s message count for every running subscription. '
  'Recomputed from source rather than incremented, because a counter that '
  'drifts is worse than none.';

/**
 * What the shop is using right now, and whether it has a habit of going over.
 *
 * `consecutive_over` is what the upgrade rule reads: one month over is a busy
 * month, two in a row is the wrong plan.
 */
create or replace function public.billing_usage_now()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_company uuid := private.auth_company_id();
  v_now public.subscription_usage%rowtype;
  v_streak integer := 0;
  r record;
begin
  if v_company is null then return null; end if;

  select u.* into v_now
    from public.subscription_usage u
    join public.subscriptions s
      on s.id = u.subscription_id and s.current_period_start = u.period_start
   where u.company_id = v_company;
  if not found then return null; end if;

  -- Counted backwards from the newest CLOSED period. The first period that was
  -- inside its allowance ends the streak.
  for r in
    select messages_used, allowance
      from public.subscription_usage
     where company_id = v_company
       and period_start < v_now.period_start
     order by period_start desc
     limit 12
  loop
    exit when r.messages_used <= r.allowance;
    v_streak := v_streak + 1;
  end loop;

  return jsonb_build_object(
    'period_start', v_now.period_start,
    'period_end', v_now.period_end,
    'messages_used', v_now.messages_used,
    'allowance', v_now.allowance,
    'over_by', greatest(0, v_now.messages_used - v_now.allowance),
    'consecutive_over', v_streak,
    'refreshed_at', v_now.refreshed_at
  );
end
$function$;

alter table public.subscription_usage enable row level security;

drop policy if exists subscription_usage_select on public.subscription_usage;
create policy subscription_usage_select on public.subscription_usage
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() = 'owner'::user_role
  );

revoke all on public.subscription_usage from public, anon;
grant select on public.subscription_usage to authenticated;

revoke all on function public.billing_refresh_usage() from public, anon, authenticated;
grant execute on function public.billing_refresh_usage() to service_role;
revoke all on function public.billing_usage_now() from public, anon;
grant execute on function public.billing_usage_now() to authenticated;
