-- Explicit consent and idempotent delivery control for proactive WhatsApp
-- account notifications. This does not change any finance record or total.

alter table public.whatsapp_identities
  add column if not exists daily_summary_opted_in_at timestamptz,
  add column if not exists debt_reminders_opted_in_at timestamptz,
  add column if not exists proactive_notifications_opted_out_at timestamptz;

comment on column public.whatsapp_identities.daily_summary_opted_in_at is
  'Explicit consent to receive the daily account summary template.';
comment on column public.whatsapp_identities.debt_reminders_opted_in_at is
  'Explicit consent to receive stale-debt reminder templates.';
comment on column public.whatsapp_identities.proactive_notifications_opted_out_at is
  'STOP/SITISHA timestamp. Null is required before any proactive notification may be sent.';

create table if not exists public.whatsapp_notification_consent_log (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.whatsapp_identities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('daily_summary', 'debt_reminder', 'all')),
  action text not null check (action in ('enabled', 'disabled', 'stopped')),
  source text not null check (source in ('app', 'whatsapp')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists whatsapp_notification_consent_identity_idx
  on public.whatsapp_notification_consent_log(identity_id, created_at desc);

create table if not exists public.whatsapp_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.whatsapp_identities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  notification_kind text not null check (notification_kind in ('daily_summary', 'debt_reminder')),
  business_date date not null,
  subject_key text not null,
  phone_e164_snapshot text not null,
  language_snapshot text not null check (language_snapshot in ('en', 'sw')),
  template_name text not null,
  parameters jsonb not null default '{}'::jsonb,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed', 'unknown', 'skipped')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  next_attempt_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (identity_id, notification_kind, business_date, subject_key)
);

create index if not exists whatsapp_notification_delivery_retry_idx
  on public.whatsapp_notification_deliveries(status, next_attempt_at)
  where status = 'failed';

alter table public.whatsapp_notification_consent_log enable row level security;
alter table public.whatsapp_notification_deliveries enable row level security;

revoke all on table public.whatsapp_notification_consent_log from public, anon, authenticated;
revoke all on table public.whatsapp_notification_deliveries from public, anon, authenticated;

-- People may inspect their own consent history. Delivery internals remain
-- service-role-only because they include destination snapshots and provider ids.
grant select on public.whatsapp_notification_consent_log to authenticated;
drop policy if exists whatsapp_notification_consent_self_read
  on public.whatsapp_notification_consent_log;
create policy whatsapp_notification_consent_self_read
  on public.whatsapp_notification_consent_log for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.my_whatsapp_notification_preferences()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'connected', i.id is not null,
    'daily_summary_enabled', i.daily_summary_opted_in_at is not null
      and i.proactive_notifications_opted_out_at is null,
    'debt_reminders_enabled', i.debt_reminders_opted_in_at is not null
      and i.proactive_notifications_opted_out_at is null,
    'closing_time', case when c.closing_time is null then null
      else to_char(c.closing_time, 'HH24:MI') end,
    'timezone', coalesce(c.timezone, 'Africa/Dar_es_Salaam')
  )
  from public.profiles p
  join public.companies c on c.id = p.active_company_id
  left join public.whatsapp_identities i
    on i.profile_id = p.id and i.revoked_at is null
  where p.id = auth.uid()
    and p.deactivated_at is null
  limit 1;
$$;

revoke execute on function public.my_whatsapp_notification_preferences()
  from public, anon;
grant execute on function public.my_whatsapp_notification_preferences()
  to authenticated;

create or replace function public.set_whatsapp_notification_preferences(
  p_daily_summary boolean,
  p_debt_reminders boolean,
  p_closing_time time default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_identity public.whatsapp_identities;
  v_closing_time time;
  v_now timestamptz := clock_timestamp();
begin
  select p.active_company_id, m.role::text, c.closing_time
    into v_company, v_role, v_closing_time
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
    join public.companies c on c.id = m.company_id
   where p.id = v_profile and p.deactivated_at is null;

  if v_profile is null or v_company is null then
    raise exception 'Active company membership is required'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'Only an owner or accountant may enable account notifications'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select * into v_identity
    from public.whatsapp_identities i
   where i.profile_id = v_profile and i.revoked_at is null
   for update;
  if v_identity.id is null then
    raise exception 'Connect WhatsApp before enabling notifications'
      using errcode = 'P0001', hint = 'whatsapp_not_connected';
  end if;

  if p_daily_summary and coalesce(p_closing_time, v_closing_time) is null then
    raise exception 'Set the business closing time before enabling daily summaries'
      using errcode = 'P0001', hint = 'closing_time_required';
  end if;

  if p_closing_time is not null then
    update public.companies
       set closing_time = p_closing_time,
           closing_time_asked_at = coalesce(closing_time_asked_at, v_now)
     where id = v_company;
    v_closing_time := p_closing_time;
  end if;

  update public.whatsapp_identities
     set daily_summary_opted_in_at = case
           when p_daily_summary then coalesce(daily_summary_opted_in_at, v_now)
           else null end,
         debt_reminders_opted_in_at = case
           when p_debt_reminders then coalesce(debt_reminders_opted_in_at, v_now)
           else null end,
         proactive_notifications_opted_out_at = case
           when p_daily_summary or p_debt_reminders then null
           else coalesce(proactive_notifications_opted_out_at, v_now) end,
         updated_at = v_now
   where id = v_identity.id;

  if (v_identity.daily_summary_opted_in_at is null) is distinct from (not p_daily_summary) then
    insert into public.whatsapp_notification_consent_log
      (identity_id, company_id, profile_id, channel, action, source)
    values
      (v_identity.id, v_company, v_profile, 'daily_summary',
       case when p_daily_summary then 'enabled' else 'disabled' end, 'app');
  end if;
  if (v_identity.debt_reminders_opted_in_at is null) is distinct from (not p_debt_reminders) then
    insert into public.whatsapp_notification_consent_log
      (identity_id, company_id, profile_id, channel, action, source)
    values
      (v_identity.id, v_company, v_profile, 'debt_reminder',
       case when p_debt_reminders then 'enabled' else 'disabled' end, 'app');
  end if;

  return jsonb_build_object(
    'connected', true,
    'daily_summary_enabled', p_daily_summary,
    'debt_reminders_enabled', p_debt_reminders,
    'closing_time', case when v_closing_time is null then null
      else to_char(v_closing_time, 'HH24:MI') end
  );
end;
$$;

revoke execute on function public.set_whatsapp_notification_preferences(boolean, boolean, time)
  from public, anon;
grant execute on function public.set_whatsapp_notification_preferences(boolean, boolean, time)
  to authenticated;

create or replace function public.wa_stop_proactive_notifications(p_phone text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_identity public.whatsapp_identities;
  v_company uuid;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_identity
    from public.whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null
   for update;
  if v_identity.id is null then
    return jsonb_build_object('stopped', false);
  end if;

  select p.active_company_id into v_company
    from public.profiles p where p.id = v_identity.profile_id;

  update public.whatsapp_identities
     set daily_summary_opted_in_at = null,
         debt_reminders_opted_in_at = null,
         proactive_notifications_opted_out_at = v_now,
         updated_at = v_now
   where id = v_identity.id;

  insert into public.whatsapp_notification_consent_log
    (identity_id, company_id, profile_id, channel, action, source)
  values
    (v_identity.id, v_company, v_identity.profile_id, 'all', 'stopped', 'whatsapp');

  return jsonb_build_object('stopped', true);
end;
$$;

revoke execute on function public.wa_stop_proactive_notifications(text)
  from public, anon, authenticated;
grant execute on function public.wa_stop_proactive_notifications(text)
  to service_role;

create or replace function public.claim_whatsapp_notification_deliveries(
  p_now timestamptz default clock_timestamp(),
  p_debt_stale_days integer default 7,
  p_limit integer default 50
)
returns table (
  delivery_id uuid,
  phone_e164 text,
  lang text,
  notification_kind text,
  template_name text,
  parameters jsonb
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

  -- Retry only definite provider failures. Network-ambiguous attempts are marked
  -- unknown and deliberately require human review instead of risking duplicates.
  return query
  with retried as (
    update public.whatsapp_notification_deliveries d
       set status = 'sending',
           attempt_count = d.attempt_count + 1,
           next_attempt_at = null,
           updated_at = p_now
     where d.id in (
       select f.id
         from public.whatsapp_notification_deliveries f
        where f.status = 'failed'
          and f.attempt_count < 3
          and f.next_attempt_at <= p_now
        order by f.next_attempt_at, f.created_at
        limit p_limit
        for update skip locked
     )
     returning d.*
  )
  select r.id, r.phone_e164_snapshot, r.language_snapshot,
         r.notification_kind, r.template_name, r.parameters
    from retried r;

  return query
  with eligible as (
    select i.id as identity_id, i.phone_e164,
           case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end as lang,
           c.id as company_id, c.name as company_name,
           c.closing_time, coalesce(c.timezone, 'Africa/Dar_es_Salaam') as timezone,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as local_date,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::time as local_time,
           case
             when (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::time >= c.closing_time
               then (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date
             else (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date - 1
           end as business_date
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
      join public.company_members m
        on m.profile_id = p.id
       and m.company_id = p.active_company_id
       and m.deactivated_at is null
       and m.role::text in ('owner', 'accountant')
      join public.companies c on c.id = m.company_id
     where i.revoked_at is null
       and i.opted_out_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.daily_summary_opted_in_at is not null
       and c.closing_time is not null
  ), daily as (
    select e.*,
           coalesce(sum(r.amount) filter (where r.kind = 'sale'), 0) as sales,
           coalesce(sum(r.amount) filter (where r.kind = 'expense'), 0) as expenses,
           count(r.id) as record_count
      from eligible e
      join public.daily_records r
        on r.company_id = e.company_id
       and r.status = 'confirmed'
       and (r.occurred_at at time zone e.timezone)::date = e.business_date
     group by e.identity_id, e.phone_e164, e.lang, e.company_id, e.company_name,
              e.closing_time, e.timezone, e.local_date, e.local_time, e.business_date
  ), inserted as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select d.identity_id, d.company_id, 'daily_summary', d.business_date, 'daily',
           d.phone_e164, d.lang, 'risip_daily_summary',
           jsonb_build_object(
             'business_name', d.company_name,
             'business_date', d.business_date,
             'sales', d.sales,
             'expenses', d.expenses,
             'note_key', case when d.expenses > d.sales then 'expenses_exceed_sales' else 'no_issues' end
           )
      from daily d
     where d.record_count > 0
     order by d.company_id, d.identity_id
     limit p_limit
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning *
  )
  select n.id, n.phone_e164_snapshot, n.language_snapshot,
         n.notification_kind, n.template_name, n.parameters
    from inserted n;

  return query
  with eligible as (
    select i.id as identity_id, i.phone_e164,
           case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end as lang,
           c.id as company_id,
           coalesce(c.timezone, 'Africa/Dar_es_Salaam') as timezone,
           (p_now at time zone coalesce(c.timezone, 'Africa/Dar_es_Salaam'))::date as local_date
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
      join public.company_members m
        on m.profile_id = p.id
       and m.company_id = p.active_company_id
       and m.deactivated_at is null
       and m.role::text in ('owner', 'accountant')
      join public.companies c on c.id = m.company_id
     where i.revoked_at is null
       and i.opted_out_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.debt_reminders_opted_in_at is not null
  ), debts as (
    select r.company_id,
           lower(regexp_replace(btrim(r.party_name), '\s+', ' ', 'g')) as party_key,
           (array_agg(btrim(r.party_name) order by r.occurred_at desc))[1] as party_name,
           sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) as balance,
           min(r.occurred_at) filter (where r.kind = 'debt_issued') as recorded_at
      from public.daily_records r
     where r.status = 'confirmed'
       and r.kind in ('debt_issued', 'customer_payment')
       and nullif(btrim(r.party_name), '') is not null
     group by r.company_id, lower(regexp_replace(btrim(r.party_name), '\s+', ' ', 'g'))
    having sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) > 0
  ), candidates as (
    select e.*, d.party_key, d.party_name, d.balance, d.recorded_at
      from eligible e
      cross join lateral (
        select x.* from debts x
         where x.company_id = e.company_id
           and x.recorded_at <= p_now - make_interval(days => p_debt_stale_days)
           and not exists (
             select 1 from public.whatsapp_notification_deliveries old
              where old.identity_id = e.identity_id
                and old.notification_kind = 'debt_reminder'
                and old.subject_key = x.party_key
                and old.status in ('sending', 'sent', 'unknown')
                and old.created_at > p_now - interval '7 days'
           )
         order by x.recorded_at, x.party_key
         limit 1
      ) d
  ), inserted as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select c.identity_id, c.company_id, 'debt_reminder', c.local_date, c.party_key,
           c.phone_e164, c.lang, 'risip_debt_reminder',
           jsonb_build_object(
             'debtor_name', c.party_name,
             'amount', c.balance,
             'recorded_date', (c.recorded_at at time zone c.timezone)::date
           )
      from candidates c
     order by c.company_id, c.identity_id
     limit p_limit
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning *
  )
  select n.id, n.phone_e164_snapshot, n.language_snapshot,
         n.notification_kind, n.template_name, n.parameters
    from inserted n;
end;
$$;

revoke execute on function public.claim_whatsapp_notification_deliveries(timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_whatsapp_notification_deliveries(timestamptz, integer, integer)
  to service_role;

create or replace function public.complete_whatsapp_notification_delivery(
  p_delivery_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('sent', 'failed', 'unknown', 'skipped') then
    raise exception 'Invalid delivery completion status';
  end if;

  update public.whatsapp_notification_deliveries
     set status = p_status,
         provider_message_id = nullif(left(btrim(p_provider_message_id), 255), ''),
         last_error = nullif(left(btrim(p_error), 500), ''),
         sent_at = case when p_status = 'sent' then clock_timestamp() else sent_at end,
         next_attempt_at = case when p_status = 'failed' and attempt_count < 3
           then clock_timestamp() + interval '1 hour' else null end,
         updated_at = clock_timestamp()
   where id = p_delivery_id and status = 'sending';
  return found;
end;
$$;

revoke execute on function public.complete_whatsapp_notification_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_whatsapp_notification_delivery(uuid, text, text, text)
  to service_role;
