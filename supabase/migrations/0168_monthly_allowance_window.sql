-- The message allowance is monthly, on a yearly subscription too.
--
-- THE BUG. billing_refresh_usage counted messages over the whole billing
-- PERIOD and gave it the plan's allowance unscaled. On a monthly cycle the
-- period is a month and that is right. On a yearly cycle the period is twelve
-- months, so a shop that paid a year up front was given 100 messages for the
-- YEAR: ten months of price for one month of messages. The pricing page had
-- said "kwa mwezi" the whole time, so the page was right and the code was
-- wrong.
--
-- THE FIX. Usage is counted in a monthly window inside the billing period,
-- anchored on the day the period started. On a monthly cycle there is exactly
-- one window and it is the period itself, so nothing about a monthly
-- subscription changes. On a yearly cycle there are twelve.
--
-- WHY MONTHLY WINDOWS RATHER THAN TWELVE TIMES THE ALLOWANCE. A single yearly
-- pool of 1,200 lets a shop spend the whole year in January and then sit
-- against the ceiling for eleven months, which is worse for the shop than a
-- ceiling it meets gently, and worse for Risip than a cost spread evenly. It
-- also would not match what the page promises.

/**
 * The monthly usage window inside a billing period, on a given day.
 *
 * Boundaries follow the convention the sweep already uses for periods: the next
 * window starts on the day the previous one ended, and usage is counted from
 * window_start through window_end inclusive. A monthly period yields exactly
 * itself.
 */
create or replace function public.billing_usage_window(
  p_period_start date,
  p_period_end   date,
  p_on           date default current_date
)
returns table (window_start date, window_end date)
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
  with span as (
    select greatest(0, (extract(year  from age(greatest(p_on, p_period_start), p_period_start)) * 12
                      + extract(month from age(greatest(p_on, p_period_start), p_period_start)))::int) as elapsed,
           greatest(1, (extract(year  from age(p_period_end, p_period_start)) * 12
                      + extract(month from age(p_period_end, p_period_start)))::int) as total
  ),
  -- The last day of a period belongs to the LAST window, not to a new one.
  -- Without this clamp, day 30 of a monthly period was a fresh window one day
  -- long and the month's count restarted at nearly zero on the day the shop
  -- most needed it to be right.
  elapsed as (select least(elapsed, total - 1) as months from span)
  select (p_period_start + (months || ' months')::interval)::date,
         least((p_period_start + ((months + 1) || ' months')::interval)::date, p_period_end)
    from elapsed;
$function$;

comment on function public.billing_usage_window(date, date, date) is
  'The monthly slice of a billing period that contains a given day. A monthly '
  'period returns itself; a yearly period returns one of twelve slices.';

-- ── counting inside the window ─────────────────────────────────────────
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
           w.window_start,
           w.window_end,
           (select count(*)
              from public.whatsapp_messages m
             where m.company_id = s.company_id
               and m.created_at >= w.window_start::timestamptz
               and m.created_at <  (w.window_end + 1)::timestamptz),
           p.message_allowance
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
     cross join lateral public.billing_usage_window(
                  s.current_period_start, s.current_period_end) w
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

-- ── reading it back for the shop ───────────────────────────────────────
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

  -- The window that contains today, rather than the one whose start happens to
  -- equal the subscription's. On a yearly cycle those are the same thing only
  -- in the first month, which is how the old join hid the bug.
  select u.* into v_now
    from public.subscription_usage u
    join public.subscriptions s on s.id = u.subscription_id
   cross join lateral public.billing_usage_window(
                s.current_period_start, s.current_period_end) w
   where u.company_id = v_company
     and u.period_start = w.window_start;
  if not found then return null; end if;

  -- Counted backwards from the newest CLOSED window. The first window that was
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

revoke all on function public.billing_usage_window(date, date, date) from public, anon;
grant execute on function public.billing_usage_window(date, date, date) to authenticated, service_role;
revoke all on function public.billing_refresh_usage() from public, anon, authenticated;
grant execute on function public.billing_refresh_usage() to service_role;
revoke all on function public.billing_usage_now() from public, anon;
grant execute on function public.billing_usage_now() to authenticated;
