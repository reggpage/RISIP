-- Billing reminders must work when the owner has not opened WhatsApp in the
-- last 24 hours.  0163 queued them as plain text while the Meta template was
-- still pending.  Keep the same queue, claims, retries and audit trail; only
-- change the delivery shape and the parameter contract.

-- Rows that have not successfully gone out must use the new configured
-- template.  Sent/unknown rows are historical provider outcomes and are never
-- rewritten.
update public.whatsapp_notification_deliveries
   set template_name = 'risip_bili',
       parameters = parameters - 'channel',
       updated_at = clock_timestamp()
 where notification_kind in ('billing_due', 'billing_overdue', 'billing_suspended')
   and status in ('sending', 'failed', 'skipped');

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

  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_due', current_date, 'bill',
           t.phone, t.lang, 'risip_bili',
           jsonb_build_object(
             'business_name', t.business_name,
             'plan_name', t.plan_name,
             'amount_tzs', t.amount_tzs,
             'period_start', t.period_start
           )
      from _billing_targets t
     where t.status in ('trialing', 'active')
       and t.period_start >= current_date
       and not t.muted
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  ) select count(*) into v_due from queued;

  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_overdue', current_date, 'bill',
           t.phone, t.lang, 'risip_bili',
           jsonb_build_object(
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

  with queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select t.identity_id, t.company_id, 'billing_suspended', current_date, 'bill',
           t.phone, t.lang, 'risip_bili',
           jsonb_build_object(
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
  'Queues owner billing reminders through the risip_bili utility '
  'template, including when the WhatsApp 24-hour customer-service window is closed.';

revoke all on function public.billing_queue_reminders() from public, anon, authenticated;
grant execute on function public.billing_queue_reminders() to service_role;

-- This migration is applied with `supabase db query --linked --file` because
-- the repository intentionally does not bulk-repair the remote legacy history.
-- Record this one migration only, so future checks can see exactly what ran.
insert into supabase_migrations.schema_migrations (version, name)
values ('0164', '0164_billing_template.sql')
on conflict (version) do nothing;
