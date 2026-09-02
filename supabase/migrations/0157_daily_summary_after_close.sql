-- Send the daily summary two hours after the business closes.
-- This is a new migration so the already-recorded 20260824 migration history is
-- not edited or bulk-repaired.

create or replace function public.claim_whatsapp_notification_deliveries(
  p_now timestamptz default clock_timestamp(),
  p_debt_stale_days integer default 7,
  p_limit integer default 50
)
returns table (
  delivery_id uuid, phone_e164 text, lang text, notification_kind text,
  template_name text, parameters jsonb
)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
begin
  if p_debt_stale_days < 1 or p_debt_stale_days > 365 then
    raise exception 'Debt staleness must be between 1 and 365 days';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Delivery limit must be between 1 and 200';
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_whatsapp_notification_deliveries'));

  return query
  with retried as (
    update public.whatsapp_notification_deliveries d
       set status = 'sending', attempt_count = d.attempt_count + 1,
           next_attempt_at = null, updated_at = p_now
     where d.id in (
       select f.id from public.whatsapp_notification_deliveries f
        where f.status = 'failed' and f.attempt_count < 3
          and f.next_attempt_at <= p_now
        order by f.next_attempt_at, f.created_at limit p_limit
        for update skip locked
     ) returning d.*
  )
  select r.id, r.phone_e164_snapshot, r.language_snapshot,
         r.notification_kind, r.template_name, r.parameters from retried r;

  return query
  with eligible as (
    select i.id as identity_id, i.phone_e164,
           case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end as lang,
           c.id as company_id, c.name as company_name,
           coalesce(c.timezone, 'Africa/Dar_es_Salaam') as timezone,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as local_date,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam')) as local_now,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as current_date
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
      join public.company_members m on m.profile_id = p.id
       and m.company_id = p.active_company_id and m.deactivated_at is null
       and m.role::text in ('owner', 'accountant')
      join public.companies c on c.id = m.company_id
     where i.revoked_at is null and i.opted_out_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.daily_summary_opted_in_at is not null and c.closing_time is not null
  ), scheduled as (
    select e.*,
           case when e.local_now >= e.current_date + e.closing_time + interval '2 hours'
             then e.current_date else e.current_date - 1 end as business_date
      from eligible e
  ), daily as (
    select e.*, coalesce(sum(r.amount) filter (where r.kind in ('sale', 'debt_issued')), 0) as sales,
           coalesce(sum(r.amount) filter (where r.kind = 'expense'), 0) as expenses,
           count(r.id) as record_count
      from scheduled e join public.daily_records r on r.company_id = e.company_id
       and r.status = 'confirmed'
       and (r.occurred_at at time zone e.timezone)::date = e.business_date
     where e.local_now >= e.business_date + e.closing_time + interval '2 hours'
     group by e.identity_id, e.phone_e164, e.lang, e.company_id, e.company_name,
              e.timezone, e.local_date, e.local_now, e.current_date, e.closing_time, e.business_date
  ), inserted as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select d.identity_id, d.company_id, 'daily_summary', d.business_date, 'daily',
           d.phone_e164, d.lang, 'risip_daily_summary',
           jsonb_build_object('business_name', d.company_name,
             'business_date', d.business_date, 'sales', d.sales, 'expenses', d.expenses,
             'note_key', case when d.expenses > d.sales then 'expenses_exceed_sales' else 'no_issues' end)
      from daily d where d.record_count > 0
     order by d.company_id, d.identity_id limit p_limit
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning *
  )
  select n.id, n.phone_e164_snapshot, n.language_snapshot,
         n.notification_kind, n.template_name, n.parameters from inserted n;

  return query
  with eligible as (
    select i.id as identity_id, i.phone_e164,
           case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end as lang,
           c.id as company_id, coalesce(c.timezone, 'Africa/Dar_es_Salaam') as timezone,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as local_date
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
      join public.company_members m on m.profile_id = p.id
       and m.company_id = p.active_company_id and m.deactivated_at is null
       and m.role::text in ('owner', 'accountant')
      join public.companies c on c.id = m.company_id
     where i.revoked_at is null and i.opted_out_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.debt_reminders_opted_in_at is not null
  ), debts as (
    select r.company_id, lower(regexp_replace(btrim(r.party_name), '\s+', ' ', 'g')) as party_key,
           (array_agg(btrim(r.party_name) order by r.occurred_at desc))[1] as party_name,
           sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) as balance,
           min(r.occurred_at) filter (where r.kind = 'debt_issued') as recorded_at
      from public.daily_records r where r.status = 'confirmed'
       and r.kind in ('debt_issued', 'customer_payment')
       and nullif(btrim(r.party_name), '') is not null
     group by r.company_id, lower(regexp_replace(btrim(r.party_name), '\s+', ' ', 'g'))
    having sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) > 0
  ), candidates as (
    select e.*, d.party_key, d.party_name, d.balance, d.recorded_at from eligible e
    cross join lateral (select x.* from debts x where x.company_id = e.company_id
      and x.recorded_at <= p_now - make_interval(days => p_debt_stale_days)
      and not exists (select 1 from public.whatsapp_notification_deliveries old
        where old.identity_id = e.identity_id and old.notification_kind = 'debt_reminder'
          and old.subject_key = x.party_key and old.status in ('sending', 'sent', 'unknown')
          and old.created_at > p_now - interval '7 days')
      order by x.recorded_at, x.party_key limit 1) d
  ), inserted as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select c.identity_id, c.company_id, 'debt_reminder', c.local_date, c.party_key,
           c.phone_e164, c.lang, 'risip_debt_reminder',
           jsonb_build_object('debtor_name', c.party_name, 'amount', c.balance,
             'recorded_date', (c.recorded_at at time zone c.timezone)::date)
      from candidates c order by c.company_id, c.identity_id limit p_limit
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning *
  )
  select n.id, n.phone_e164_snapshot, n.language_snapshot,
         n.notification_kind, n.template_name, n.parameters from inserted n;
end;
$$;

revoke execute on function public.claim_whatsapp_notification_deliveries(timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_whatsapp_notification_deliveries(timestamptz, integer, integer)
  to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('0157', 'daily_summary_after_close')
on conflict (version) do nothing;
