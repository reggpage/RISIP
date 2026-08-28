-- "Umerekodi leo lakini hujafunga siku."
--
-- The owner asked for this, and the interesting part is not the reminder — it
-- is that there are two of them, and only one can be built today.
--
-- Somebody who sent anything through WhatsApp today has an open 24-hour
-- window, so their reminder is an ORDINARY message: free, and as long as it
-- needs to be. That is what this queues.
--
-- Somebody who sent NOTHING has no window, and their reminder must be a
-- template. That is the one that matters most — a shopkeeper who wrote nothing
-- down is the one losing money — and it cannot be sent until
-- risip_close_reminder exists and is approved. This function deliberately does
-- not queue it: a row naming a template that does not exist would fail at the
-- Graph API and retry twice before giving up.
--
-- A new function rather than an edit to claim_whatsapp_notification_deliveries,
-- which works and is carrying the daily summaries.

alter table public.whatsapp_notification_deliveries
  drop constraint if exists whatsapp_notification_deliveries_notification_kind_check;

alter table public.whatsapp_notification_deliveries
  add constraint whatsapp_notification_deliveries_notification_kind_check
  check (notification_kind in ('daily_summary', 'debt_reminder', 'close_reminder'));

/**
 * Queue an evening nudge for everyone who recorded today and has not closed.
 *
 * Scoped by the company's own closing_time: the reminder goes out 45 minutes
 * after the shop was due to shut, so it lands when the day really is over
 * rather than in the middle of trading. Shops with no closing_time set are
 * skipped entirely — Risip does not guess when somebody's shop closes.
 */
create or replace function public.wa_queue_close_reminders(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_queued integer := 0;
begin
  with candidate as (
    select i.id as identity_id,
           i.company_id,
           i.phone_e164,
           case when p.lang = 'sw' then 'sw' else 'en' end as lang,
           coalesce(nullif(btrim(p.full_name), ''), null) as full_name,
           coalesce(c.timezone, 'Africa/Dar_es_Salaam') as tz,
           (clock_timestamp() at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as business_date,
           (clock_timestamp() at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::time as local_time,
           c.closing_time
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id
      join public.companies c on c.id = i.company_id
     where i.revoked_at is null
       and p.deactivated_at is null
       and i.proactive_notifications_opted_out_at is null
       and c.closing_time is not null
  ), due as (
    select k.*,
           -- What they put in today, and only through WhatsApp: that is what
           -- proves the 24-hour window is open and this may go as plain text.
           (select count(*) from public.daily_records r
             where r.company_id = k.company_id
               and r.recorded_by = (select profile_id from public.whatsapp_identities where id = k.identity_id)
               and r.status = 'confirmed'
               and r.source = 'whatsapp'
               and (r.occurred_at at time zone k.tz)::date = k.business_date) as recorded_today
      from candidate k
     where k.local_time >= (k.closing_time + interval '45 minutes')
  ), eligible as (
    select d.*
      from due d
     where d.recorded_today > 0
       and not exists (
         select 1 from public.daily_closures dc
          where dc.company_id = d.company_id and dc.business_date = d.business_date)
       and not exists (
         select 1 from public.whatsapp_daily_nudges n
          where n.identity_id = d.identity_id
            and n.business_date = d.business_date
            and n.kind = 'close_reminder')
     order by d.company_id, d.identity_id
     limit greatest(1, least(500, p_limit))
  ), marked as (
    -- Claiming the nudge IS the lock: two runs cannot both queue the same
    -- person, whatever the delivery table does afterwards.
    insert into public.whatsapp_daily_nudges (identity_id, business_date, kind)
    select e.identity_id, e.business_date, 'close_reminder' from eligible e
    on conflict (identity_id, business_date, kind) do nothing
    returning identity_id, business_date
  ), queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select e.identity_id, e.company_id, 'close_reminder', e.business_date, 'close',
           e.phone_e164, e.lang, 'text',
           jsonb_build_object(
             'channel', 'text',
             'full_name', coalesce(e.full_name, ''),
             'recorded_today', e.recorded_today
           )
      from eligible e
      join marked m on m.identity_id = e.identity_id and m.business_date = e.business_date
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  )
  select count(*) into v_queued from queued;

  return v_queued;
end $function$;

revoke all on function public.wa_queue_close_reminders(integer) from public, anon, authenticated;
grant execute on function public.wa_queue_close_reminders(integer) to service_role;
