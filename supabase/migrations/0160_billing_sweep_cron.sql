-- The sweep, in the database rather than over HTTP.
--
-- billing-charge already has a `sweep` action, and it works, but scheduling it
-- would mean a cron row holding BILLING_SECRET in order to call our own
-- function over the public internet to do work that is entirely local. Every
-- part of raising an invoice is a read and a write in this database. So the
-- schedule calls SQL, the secret stays out of the crontab, and the Edge
-- Function keeps its sweep action as the button a human can press.
--
-- WHAT IT DOES, and the order matters:
--   1. A trial that has run out stops being a trial.
--   2. A period that ended unpaid becomes past_due, with grace days attached.
--   3. Grace that has run out becomes suspended: the shop still READS its own
--      books, it only stops being able to add to them.
--   4. Every subscription whose period ends within three days gets an invoice,
--      once, ever, enforced by the unique index rather than by this function
--      being careful.
--
-- Nothing here charges anybody. Money is only ever asked for by a person
-- saying yes on their own handset, and only ever confirmed by a signed webhook.

/** Days a shop keeps writing after its period ends unpaid. */
create or replace function public.billing_grace_days()
returns integer language sql immutable
set search_path to 'pg_catalog', 'public'
as $function$ select 3 $function$;

create or replace function public.billing_raise_due_invoices()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_grace    integer := public.billing_grace_days();
  v_expired  integer := 0;
  v_overdue  integer := 0;
  v_stopped  integer := 0;
  v_raised   integer := 0;
begin
  -- 1. A trial that has run out is no longer a trial. It does not go straight
  --    to suspended: the shop has never been asked for money yet, so it gets
  --    the same grace as anybody whose payment is late.
  with moved as (
    update public.subscriptions
       set status = 'past_due',
           grace_until = coalesce(grace_until, current_date + v_grace),
           updated_at = clock_timestamp()
     where status = 'trialing'
       and trial_ends_at is not null
       and trial_ends_at < clock_timestamp()
    returning 1
  ) select count(*) into v_expired from moved;

  -- 2. A period that ended and was not paid for.
  with moved as (
    update public.subscriptions
       set status = 'past_due',
           grace_until = coalesce(grace_until, current_period_end + v_grace),
           updated_at = clock_timestamp()
     where status = 'active'
       and current_period_end < current_date
    returning 1
  ) select count(*) into v_overdue from moved;

  -- 3. Grace spent. READ-ONLY, never deleted, never hidden.
  with moved as (
    update public.subscriptions
       set status = 'suspended',
           updated_at = clock_timestamp()
     where status = 'past_due'
       and grace_until is not null
       and grace_until < current_date
    returning 1
  ) select count(*) into v_stopped from moved;

  -- 4. The invoices themselves.
  --
  --    period_start is the OLD period's end, so a payment that arrives three
  --    days late still buys the month it was for rather than a month from
  --    today. The amount is snapshotted here and never read from the plan
  --    table again, because what a shop was charged in October is what it was
  --    charged in October.
  with raised as (
    insert into public.subscription_invoices
      (subscription_id, company_id, plan, cycle, amount_tzs, period_start, period_end)
    select s.id,
           s.company_id,
           s.plan,
           s.cycle,
           case when s.cycle = 'yearly' then p.yearly_tzs else p.monthly_tzs end,
           s.current_period_end,
           (s.current_period_end
              + case when s.cycle = 'yearly' then interval '12 months' else interval '1 month' end)::date
      from public.subscriptions s
      join public.billing_plans p on p.code = s.plan
     where s.status in ('trialing', 'active', 'past_due')
       and s.current_period_end <= current_date + v_grace
    -- The one-invoice-per-period index. A schedule that fires twice, a founder
    -- pressing the button and a retried job all land here and do nothing.
    on conflict (subscription_id, period_start) do nothing
    returning 1
  ) select count(*) into v_raised from raised;

  return jsonb_build_object(
    'ran_at', clock_timestamp(),
    'trials_expired', v_expired,
    'moved_to_past_due', v_overdue,
    'suspended', v_stopped,
    'invoices_raised', v_raised
  );
end
$function$;

comment on function public.billing_raise_due_invoices() is
  'Daily billing sweep. Moves subscription states and raises the invoices that '
  'are due. Charges nobody: money is asked for by a person saying yes on their '
  'own handset, and confirmed only by a signed webhook.';

-- Nobody but the scheduler and service_role runs this.
revoke all on function public.billing_raise_due_invoices() from public, anon, authenticated;
grant execute on function public.billing_raise_due_invoices() to service_role;
revoke all on function public.billing_grace_days() from public, anon;
