-- Telling the shop its bill is due, through the queue that already works.
--
-- There is a delivery queue with retries, a claim function and a sender. A
-- second path for money would be a second path to keep correct, so a bill is
-- queued exactly like a close reminder: a row, a kind, and parameters.
--
-- THE 24-HOUR RULE, AND WHAT IT COSTS US. These go as PLAIN TEXT, which Meta
-- only allows inside 24 hours of the shop's own last message. A shop that
-- writes to Risip most days will get its bill. A shop that has gone quiet will
-- not, and that is precisely the shop most likely to be about to lapse. The
-- honest fix is an approved utility template, which is a Meta dashboard job,
-- not a code job. Until that exists this reminder is best-effort, and the
-- dashboard and the suspension gate are what actually carry the message.
--
-- WHO IS TOLD. The owner, and only the owner. Billing is not a worker's
-- business and a worker cannot act on it.
--
-- ONE PER DAY PER KIND, enforced by the queue's own unique key rather than by
-- this function being careful. A cron that fires twice sends one message.

-- The queue only knew three kinds of message. Widening the list rather than
-- dropping the constraint: an unknown kind should still be refused, because the
-- sender switches on this value and a typo would deliver nothing while looking
-- like it had been queued.
alter table public.whatsapp_notification_deliveries
  drop constraint if exists whatsapp_notification_deliveries_notification_kind_check;

alter table public.whatsapp_notification_deliveries
  add constraint whatsapp_notification_deliveries_notification_kind_check
  check (notification_kind = any (array[
    'daily_summary', 'debt_reminder', 'close_reminder',
    'billing_due', 'billing_overdue', 'billing_suspended'
  ]));

create or replace function public.billing_queue_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_due       integer := 0;
  v_overdue   integer := 0;
  v_suspended integer := 0;
begin
  -- The owner's live WhatsApp identity, the open invoice, and the shop's name.
  -- Anything missing means the shop simply is not reminded; nothing here
  -- invents a phone number or a figure.
  create temporary table if not exists _billing_targets (
    identity_id uuid, company_id uuid, phone text, lang text,
    business_name text, plan_name text, amount_tzs integer,
    period_start date, status text, grace_days_left integer,
    muted boolean
  ) on commit drop;
  delete from _billing_targets;

  insert into _billing_targets
  select wi.id, s.company_id, wi.phone_e164, coalesce(wi.lang, pr.lang, 'sw'),
         coalesce(c.name, 'Risip'), bp.name_sw, i.amount_tzs, i.period_start,
         s.status,
         case when s.grace_until is null then null
              else greatest(0, s.grace_until - current_date) end,
         wi.proactive_notifications_opted_out_at is not null
    from public.subscriptions s
    join public.subscription_invoices i
      on i.subscription_id = s.id
     and i.status = 'open'
     and i.period_start = s.current_period_end
    join public.billing_plans bp on bp.code = s.plan
    join public.companies c on c.id = s.company_id
    join public.profiles pr on pr.company_id = s.company_id
     and pr.role = 'owner' and pr.deactivated_at is null
    join public.whatsapp_identities wi
      on wi.profile_id = pr.id and wi.revoked_at is null
   where s.status in ('trialing', 'active', 'past_due', 'suspended');

  -- 1. Due soon. The period has not ended; nothing is late and the message
  --    says so by not mentioning grace at all.
  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_due', current_date, 'bill',
           t.phone, t.lang, 'text',
           jsonb_build_object(
             'channel', 'text',
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start
           )
      from _billing_targets t
     where t.status in ('trialing', 'active')
       and t.period_start >= current_date
       -- A NUDGE IS A CONVENIENCE, A CONSEQUENCE IS NOT.
       --
       -- Somebody who typed STOP asked for daily summaries and debt reminders
       -- to end. This one is neither urgent nor about their money running out,
       -- so it respects that. The overdue and suspended messages below do not:
       -- being cut off without warning is worse than one message somebody did
       -- not want, and both concern the account itself rather than reporting.
       and not t.muted
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_due from queued;

  -- 2. Late, inside grace. Says how many days are left, because "soon" is not
  --    a number anybody can plan around.
  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_overdue', current_date, 'bill',
           t.phone, t.lang, 'text',
           jsonb_build_object(
             'channel', 'text',
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start,
             'grace_days_left', coalesce(t.grace_days_left, 0)
           )
      from _billing_targets t
     where t.status = 'past_due'
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_overdue from queued;

  -- 3. Stopped. Sent ONCE, on the day it stops, not every day afterwards.
  --    Nagging a shop daily about money is how a product gets muted.
  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_suspended', current_date, 'bill',
           t.phone, t.lang, 'text',
           jsonb_build_object(
             'channel', 'text',
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start
           )
      from _billing_targets t
     where t.status = 'suspended'
       and not exists (
         select 1 from public.whatsapp_notification_deliveries d
          where d.identity_id = t.identity_id
            and d.notification_kind = 'billing_suspended'
       )
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_suspended from queued;

  return jsonb_build_object(
    'ran_at', clock_timestamp(),
    'due', v_due,
    'overdue', v_overdue,
    'suspended', v_suspended
  );
end
$function$;

comment on function public.billing_queue_reminders() is
  'Queues billing reminders for the OWNER only, through the existing delivery '
  'queue. Plain text, so subject to Meta''s 24-hour window: a shop that has '
  'gone quiet will not receive one until an approved template exists.';

revoke all on function public.billing_queue_reminders() from public, anon, authenticated;
grant execute on function public.billing_queue_reminders() to service_role;
