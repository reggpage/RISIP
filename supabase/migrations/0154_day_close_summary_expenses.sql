-- Fix the boss daily-summary queued by manual day close.
--
-- 0145 queued the approved daily-summary template when a worker closed the day,
-- but put stock purchases into the template's "expenses" slot. The edge
-- function already passes gross/net profit, so the real recorded expenses are
-- recoverable as sales - cogs - profit. Keep the public RPC signature stable so
-- deployed webhook versions do not race the migration.

create or replace function public.wa_close_business_day(
  p_company_id uuid,
  p_profile_id uuid,
  p_business_date date,
  p_sales numeric,
  p_cogs numeric,
  p_profit numeric,
  p_purchases numeric,
  p_new_debt numeric,
  p_debt_paid numeric,
  p_record_count integer,
  p_worker_count integer,
  p_worker_label text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_existing public.daily_closures%rowtype;
  v_company_name text;
  v_queued integer := 0;
  v_expenses numeric := greatest(0, coalesce(p_sales, 0) - coalesce(p_cogs, 0) - coalesce(p_profit, 0));
begin
  if p_company_id is null or p_business_date is null then
    raise exception 'closure scope is required' using errcode = 'P0001', hint = 'invalid_scope';
  end if;

  select * into v_existing
    from public.daily_closures
   where company_id = p_company_id and business_date = p_business_date;
  if found then
    return jsonb_build_object(
      'closed', true, 'already_closed', true,
      'closed_at', v_existing.closed_at, 'queued', 0
    );
  end if;

  select name into v_company_name from public.companies where id = p_company_id;

  insert into public.daily_closures (
    company_id, business_date, closed_by, sales, cogs, profit,
    purchases, new_debt, debt_paid, record_count, worker_count
  ) values (
    p_company_id, p_business_date, p_profile_id,
    coalesce(p_sales, 0), coalesce(p_cogs, 0), coalesce(p_profit, 0),
    coalesce(p_purchases, 0), coalesce(p_new_debt, 0), coalesce(p_debt_paid, 0),
    coalesce(p_record_count, 0), coalesce(p_worker_count, 0)
  )
  on conflict (company_id, business_date) do nothing;

  with owners as (
    select i.id as identity_id, i.phone_e164, i.company_id,
           case when p.lang = 'sw' then 'sw' else 'en' end as lang
      from public.whatsapp_identities i
      join public.profiles p on p.id = i.profile_id
     where i.company_id = p_company_id
       and i.revoked_at is null
       and p.role = 'owner'
       and p.deactivated_at is null
       and i.proactive_notifications_opted_out_at is null
       and i.daily_summary_opted_in_at is not null
       and (p_profile_id is null or p.id <> p_profile_id)
  ), queued as (
    insert into public.whatsapp_notification_deliveries
      (identity_id, company_id, notification_kind, business_date, subject_key,
       phone_e164_snapshot, language_snapshot, template_name, parameters)
    select o.identity_id, o.company_id, 'daily_summary', p_business_date, 'daily',
           o.phone_e164, o.lang, 'risip_daily_summary',
           jsonb_build_object(
             'business_name', coalesce(v_company_name, 'Risip'),
             'business_date', p_business_date,
             'sales', coalesce(p_sales, 0),
             'expenses', v_expenses,
             'note_key', 'day_closed',
             'note_worker', coalesce(p_worker_label, ''),
             'note_profit', coalesce(p_profit, 0),
             'note_records', coalesce(p_record_count, 0)
           )
      from owners o
    on conflict (identity_id, notification_kind, business_date, subject_key) do nothing
    returning 1
  )
  select count(*) into v_queued from queued;

  return jsonb_build_object('closed', true, 'already_closed', false, 'queued', v_queued);
end $function$;

revoke all on function public.wa_close_business_day(
  uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.wa_close_business_day(
  uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, text
) to service_role;
