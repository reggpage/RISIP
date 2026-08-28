-- Closing the day, as an event the shop performs rather than a clock that fires.
--
-- The owner's decision, in his words: "apate ripoti pale duka linapofungwa".
-- The scheduled daily summary in 20260824120000 stays exactly as it is; this
-- writes the SAME (identity, kind, business_date, subject_key) row, so a shop
-- that closes pre-empts its own schedule through the existing unique index
-- rather than through a second code path. Nobody gets two reports.
--
-- The totals arrive as arguments rather than being recomputed here. Cost of
-- goods needs each sale line priced at the buying cost that was effective when
-- it was sold, and that logic already exists, tested, in calculateProfitEstimate.
-- A second implementation in SQL would be a second answer to the same question,
-- and the two would drift.

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  business_date date not null,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz not null default clock_timestamp(),
  sales numeric(14,2) not null default 0,
  cogs numeric(14,2) not null default 0,
  profit numeric(14,2) not null default 0,
  purchases numeric(14,2) not null default 0,
  new_debt numeric(14,2) not null default 0,
  debt_paid numeric(14,2) not null default 0,
  record_count integer not null default 0,
  worker_count integer not null default 0,
  -- One closure per shop per day. Closing twice is not an error the shopkeeper
  -- should see; it is the same day, already closed.
  unique (company_id, business_date)
);

comment on table public.daily_closures is
  'One row per shop per business day, written when a worker closes the day. '
  'Append-only: a correction is a new record, never an edit to history.';

create index if not exists daily_closures_company_date_idx
  on public.daily_closures(company_id, business_date desc);

alter table public.daily_closures enable row level security;

-- Same posture as daily_records: the company sees its own, and a whole-day
-- total is a company financial, so it stops at owner and accountant. Nothing
-- writes from the browser; closing happens in an edge function.
drop policy if exists daily_closures_select_own on public.daily_closures;
create policy daily_closures_select_own on public.daily_closures
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() = any (array['owner'::user_role, 'accountant'::user_role])
  );

revoke all on public.daily_closures from public, anon;
grant select on public.daily_closures to authenticated;

-- ---------------------------------------------------------------------------
-- A per-day, per-person marker for things Risip may say only once a day.
--
-- Two of them so far: the batching hint, and the evening reminder to close.
-- Both are helpful once and irritating twice, and an irritating reminder is one
-- people stop reading — which costs more than the message saves.
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_daily_nudges (
  identity_id uuid not null references public.whatsapp_identities(id) on delete cascade,
  business_date date not null,
  kind text not null check (kind in ('batch_hint', 'close_reminder')),
  sent_at timestamptz not null default clock_timestamp(),
  primary key (identity_id, business_date, kind)
);

alter table public.whatsapp_daily_nudges enable row level security;
revoke all on public.whatsapp_daily_nudges from public, anon, authenticated;

/**
 * Claim the right to say one thing, once, today.
 *
 * Returns true exactly once per identity per day per kind. The insert IS the
 * claim, so two workers hitting it at the same instant cannot both win.
 */
create or replace function public.wa_claim_daily_nudge(
  p_identity_id uuid,
  p_business_date date,
  p_kind text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_claimed boolean := false;
begin
  insert into public.whatsapp_daily_nudges (identity_id, business_date, kind)
  values (p_identity_id, p_business_date, p_kind)
  on conflict (identity_id, business_date, kind) do nothing;
  get diagnostics v_claimed = row_count;
  return v_claimed;
exception when others then
  -- A nudge is never worth failing a message for.
  return false;
end $function$;

revoke all on function public.wa_claim_daily_nudge(uuid, date, text) from public, anon, authenticated;
grant execute on function public.wa_claim_daily_nudge(uuid, date, text) to service_role;

-- ---------------------------------------------------------------------------
-- Close the day, and tell the owner.
-- ---------------------------------------------------------------------------

/**
 * Records the closure and queues the owner's report in one statement.
 *
 * The report goes to every OWNER identity of the company that has opted in,
 * excluding the person who closed — telling somebody what they just typed is
 * noise. It reuses subject_key 'daily', so the scheduled summary for the same
 * date finds the row already there and does nothing.
 */
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

  -- The owner's report. Reuses the approved risip_daily_summary template and
  -- its five parameters, so this ships without waiting on Meta. The fifth
  -- parameter is a short free-text note; it carries who recorded and what was
  -- kept, because those are the two things the approved body has no slot for.
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
             'expenses', coalesce(p_purchases, 0),
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
