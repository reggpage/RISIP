-- What time does this shop close its books?
--
-- The owner's own description of the problem: the worker writes into a counter
-- book all day, and the boss learns the day's takings only when he physically
-- arrives. A reminder is the cheapest fix for that — but only if it lands at the
-- hour the shop actually closes. A shop that shuts at 20:00 being nudged at
-- 17:00 learns to ignore Risip, and then the one nudge that mattered is ignored
-- too.
--
-- So Risip asks, once, and stores the answer per company. Nothing here sends
-- anything; scheduling is a separate concern and needs pg_cron/pg_net, which are
-- not installed yet. This is the piece that makes the reminder worth sending.

alter table public.companies
  add column if not exists closing_time time,
  add column if not exists closing_time_asked_at timestamptz,
  add column if not exists timezone text not null default 'Africa/Dar_es_Salaam';

comment on column public.companies.closing_time is
  'Local wall-clock time the shop closes its books. Null means never answered.';
comment on column public.companies.closing_time_asked_at is
  'When Risip last asked. Asked once, never nagged.';

/**
 * Records the closing time from WhatsApp.
 *
 * Owner or accountant only: this drives a message that goes to everybody, and a
 * worker changing when the boss is told is exactly backwards.
 */
create or replace function public.wa_set_closing_time(
  p_phone text,
  p_time time
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text;
begin
  select i.profile_id, p.active_company_id, m.role, c.name
    into v_profile, v_company, v_role, v_name
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set the closing time'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_time is null then
    raise exception 'no time given' using errcode = 'P0001', hint = 'empty';
  end if;

  update companies
     set closing_time = p_time,
         closing_time_asked_at = coalesce(closing_time_asked_at, clock_timestamp())
   where id = v_company;

  return jsonb_build_object('closing_time', to_char(p_time, 'HH24:MI'),
                            'company_name', coalesce(v_name, ''));
end;
$$;

revoke all on function public.wa_set_closing_time(text, time) from public, anon, authenticated;
grant execute on function public.wa_set_closing_time(text, time) to service_role;

/**
 * Which shops have not closed their books yet today.
 *
 * "Closed" means at least one confirmed record exists for the shop's own day, in
 * the shop's own timezone — three hours from UTC here, which is enough to file
 * an evening sale on the wrong day and then nag somebody who did nothing wrong.
 */
create or replace function public.companies_awaiting_close(p_now timestamptz default now())
returns table (company_id uuid, company_name text, closing_time time, records_today integer)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select
    c.id,
    c.name,
    c.closing_time,
    (select count(*)::int
       from daily_records r
      where r.company_id = c.id
        and r.status = 'confirmed'
        and (r.occurred_at at time zone c.timezone)::date
            = (p_now at time zone c.timezone)::date) as records_today
  from companies c
  where c.closing_time is not null
    and (p_now at time zone c.timezone)::time >= c.closing_time;
$$;

revoke all on function public.companies_awaiting_close(timestamptz) from public, anon, authenticated;
grant execute on function public.companies_awaiting_close(timestamptz) to service_role;
