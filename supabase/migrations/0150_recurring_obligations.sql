-- Rent, and everything else that comes back every month whether you sold
-- anything or not.
--
-- The owner's words: "tumesahau swala la kodi ni lazima system imuulize mteja
-- gharama za jengo kila mwezi ni shingapi kuna wengine wanalipa mwezi, miezi
-- mitatu, miezi 6 na wengine mwaka". He is right, and it was a real hole: a
-- shop could be told its profit every day for a month and never be told that
-- the rent falls due on Friday.
--
-- THREE DECISIONS I TOOK, because he asked me to build rather than ask again:
--
--   1. A payment records the PERIOD IT COVERS, not just the day it left the
--      till. Six months paid at once is one cash movement and six months of
--      rent, and a shop needs both readings: what left this month, and what
--      this month actually cost. Storing covers_from/covers_to is the only way
--      to have either without guessing.
--   2. Reminders at five days before, and again on the day.
--   3. NOT only rent. Licence, electricity, water and a security guard are the
--      same shape — an amount, a period, a due date — and modelling only rent
--      would mean building this twice.
--
-- APPEND-ONLY, like every other ledger here. A rent increase is a NEW row that
-- supersedes the old one; the old amount stays, because "kodi ilikuwa ngapi
-- mwaka jana" is a question with an answer.

create table if not exists public.recurring_obligations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('rent', 'licence', 'electricity', 'water', 'security', 'other')),
  /** What the shopkeeper calls it, when "rent" is not enough — "duka la pili". */
  label text,
  amount numeric(14, 2) not null check (amount > 0),
  /** 1 monthly, 3 quarterly, 6 half-yearly, 12 yearly. */
  period_months integer not null check (period_months in (1, 2, 3, 4, 6, 12)),
  /** The first period this amount applies to. */
  effective_from date not null,
  /** Set when a later row replaces this one. The old amount is never edited. */
  superseded_at timestamptz,
  next_due_on date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

comment on table public.recurring_obligations is
  'Rent and other costs that fall due on a schedule. Append-only: a change of '
  'amount is a new row that supersedes the old, so last year''s rent is still '
  'answerable.';

create index if not exists recurring_obligations_live_idx
  on public.recurring_obligations(company_id, kind)
  where superseded_at is null;

create table if not exists public.obligation_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.recurring_obligations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  /** The stretch of time this money bought. */
  covers_from date not null,
  covers_to date not null,
  paid_on date not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  /** The expense row in the ledger, so the money is counted exactly once. */
  daily_record_id uuid references public.daily_records(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  check (covers_to >= covers_from)
);

create index if not exists obligation_payments_by_obligation_idx
  on public.obligation_payments(obligation_id, paid_on desc);

alter table public.recurring_obligations enable row level security;
alter table public.obligation_payments enable row level security;

-- A fixed cost is a company financial: owner and accountant, same as the rest.
drop policy if exists recurring_obligations_select on public.recurring_obligations;
create policy recurring_obligations_select on public.recurring_obligations
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() = any (array['owner'::user_role, 'accountant'::user_role])
  );

drop policy if exists obligation_payments_select on public.obligation_payments;
create policy obligation_payments_select on public.obligation_payments
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() = any (array['owner'::user_role, 'accountant'::user_role])
  );

revoke all on public.recurring_obligations from public, anon;
revoke all on public.obligation_payments from public, anon;
grant select on public.recurring_obligations to authenticated;
grant select on public.obligation_payments to authenticated;

/**
 * Set or change what a recurring cost is.
 *
 * A change supersedes rather than edits. "Mwenye nyumba amepandisha kodi" is a
 * new fact from a date, not a correction of an old one, and a shop that is
 * asked what it paid last year deserves the number it actually paid.
 */
create or replace function public.wa_set_recurring_obligation(
  p_company_id uuid,
  p_profile_id uuid,
  p_kind text,
  p_label text,
  p_amount numeric,
  p_period_months integer,
  p_next_due_on date
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_previous public.recurring_obligations%rowtype;
  -- FOUND is rewritten by the INSERT below, so the answer to "was there one
  -- before?" has to be taken the moment it is known. The rollback test caught
  -- this reporting every first-ever rent as a replacement.
  v_replaced boolean := false;
  v_id uuid;
begin
  if p_company_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'a recurring cost needs a company and an amount'
      using errcode = 'P0001', hint = 'invalid_obligation';
  end if;

  select * into v_previous
    from public.recurring_obligations
   where company_id = p_company_id
     and kind = p_kind
     and coalesce(label, '') = coalesce(p_label, '')
     and superseded_at is null
   order by effective_from desc
   limit 1;
  v_replaced := found;

  if v_replaced then
    update public.recurring_obligations
       set superseded_at = clock_timestamp()
     where id = v_previous.id;
  end if;

  insert into public.recurring_obligations
    (company_id, kind, label, amount, period_months, effective_from, next_due_on, created_by)
  values
    (p_company_id, p_kind, nullif(btrim(p_label), ''), p_amount, p_period_months,
     (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date, p_next_due_on, p_profile_id)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'replaced', v_replaced,
    'previous_amount', case when v_replaced then v_previous.amount else null end
  );
end $function$;

/**
 * What is owed, what has been paid against it, and what is still short.
 *
 * A half payment is not a special case: it is a payment smaller than the
 * period's amount, and what is left is arithmetic rather than a status field
 * somebody has to remember to set.
 */
create or replace function public.wa_recurring_obligations(p_company_id uuid)
returns table (
  id uuid,
  kind text,
  label text,
  amount numeric,
  period_months integer,
  next_due_on date,
  days_until_due integer,
  paid_for_current_period numeric,
  outstanding numeric,
  last_paid_on date,
  previous_amount numeric
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with live as (
    select o.*
      from public.recurring_obligations o
     where o.company_id = p_company_id
       and o.superseded_at is null
  ), paid as (
    select p.obligation_id,
           sum(p.amount) filter (
             where p.covers_to >= (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date
           ) as current_paid,
           max(p.paid_on) as last_paid_on
      from public.obligation_payments p
     where p.company_id = p_company_id
     group by p.obligation_id
  ), prior as (
    select distinct on (o.kind, coalesce(o.label, ''))
           o.kind, coalesce(o.label, '') as label_key, o.amount
      from public.recurring_obligations o
     where o.company_id = p_company_id
       and o.superseded_at is not null
     order by o.kind, coalesce(o.label, ''), o.superseded_at desc
  )
  select l.id, l.kind, l.label, l.amount, l.period_months, l.next_due_on,
         (l.next_due_on - (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date)::integer
           as days_until_due,
         coalesce(pd.current_paid, 0) as paid_for_current_period,
         greatest(0, l.amount - coalesce(pd.current_paid, 0)) as outstanding,
         pd.last_paid_on,
         pr.amount as previous_amount
    from live l
    left join paid pd on pd.obligation_id = l.id
    left join prior pr on pr.kind = l.kind and pr.label_key = coalesce(l.label, '')
   order by l.next_due_on asc;
$function$;

/**
 * Record money paid against a recurring cost.
 *
 * covers_to is computed from the period rather than taken as an argument, so
 * a half payment cannot silently claim a whole period. Paying half the rent
 * buys the same stretch of time and leaves the rest outstanding, which is what
 * a landlord thinks and what the shopkeeper needs to be reminded of.
 */
create or replace function public.wa_record_obligation_payment(
  p_company_id uuid,
  p_profile_id uuid,
  p_obligation_id uuid,
  p_amount numeric,
  p_daily_record_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_obligation public.recurring_obligations%rowtype;
  v_today date := (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date;
  v_covers_from date;
  v_covers_to date;
  v_paid numeric;
  v_outstanding numeric;
begin
  select * into v_obligation
    from public.recurring_obligations
   where id = p_obligation_id and company_id = p_company_id;
  if not found then
    raise exception 'no such recurring cost for this company'
      using errcode = 'P0001', hint = 'unknown_obligation';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'a payment needs an amount' using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  v_covers_from := v_obligation.next_due_on;
  v_covers_to := (v_obligation.next_due_on + (v_obligation.period_months || ' months')::interval)::date - 1;

  insert into public.obligation_payments
    (obligation_id, company_id, amount, covers_from, covers_to, paid_on, recorded_by, daily_record_id)
  values
    (p_obligation_id, p_company_id, p_amount, v_covers_from, v_covers_to, v_today,
     p_profile_id, p_daily_record_id);

  select coalesce(sum(amount), 0) into v_paid
    from public.obligation_payments
   where obligation_id = p_obligation_id and covers_from = v_covers_from;
  v_outstanding := greatest(0, v_obligation.amount - v_paid);

  -- The due date only moves once the period is actually paid for. A half
  -- payment must not make the reminder go quiet.
  if v_outstanding <= 0 then
    update public.recurring_obligations
       set next_due_on = (v_obligation.next_due_on + (v_obligation.period_months || ' months')::interval)::date
     where id = p_obligation_id;
  end if;

  return jsonb_build_object(
    'paid', p_amount,
    'covers_from', v_covers_from,
    'covers_to', v_covers_to,
    'outstanding', v_outstanding,
    'period_settled', v_outstanding <= 0
  );
end $function$;

revoke all on function public.wa_set_recurring_obligation(uuid, uuid, text, text, numeric, integer, date)
  from public, anon, authenticated;
revoke all on function public.wa_recurring_obligations(uuid) from public, anon, authenticated;
revoke all on function public.wa_record_obligation_payment(uuid, uuid, uuid, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.wa_set_recurring_obligation(uuid, uuid, text, text, numeric, integer, date) to service_role;
grant execute on function public.wa_recurring_obligations(uuid) to service_role;
grant execute on function public.wa_record_obligation_payment(uuid, uuid, uuid, numeric, uuid) to service_role;
