-- Capture the owner's location and business hours during WhatsApp onboarding.
-- Hours are local wall-clock values in the company's timezone; they are not
-- financial records and must never be inferred from a worker's message.

alter table public.companies
  add column if not exists opening_time time,
  add column if not exists opening_time_asked_at timestamptz;

comment on column public.companies.opening_time is
  'Local wall-clock time the shop opens, captured during owner onboarding.';

comment on column public.companies.opening_time_asked_at is
  'When Risip captured the opening time during onboarding.';

create or replace function public.wa_set_business_hours(
  p_phone text,
  p_opening_time time,
  p_closing_time time
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid;
  v_role text;
  v_name text;
begin
  select p.active_company_id, m.role::text, c.name
    into v_company, v_role, v_name
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
    join public.companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_company is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may set business hours'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_opening_time is null or p_closing_time is null then
    raise exception 'both business hours are required'
      using errcode = 'P0001', hint = 'empty';
  end if;

  update public.companies
     set opening_time = p_opening_time,
         opening_time_asked_at = coalesce(opening_time_asked_at, clock_timestamp()),
         closing_time = p_closing_time,
         closing_time_asked_at = coalesce(closing_time_asked_at, clock_timestamp())
   where id = v_company;

  return jsonb_build_object(
    'company_name', coalesce(v_name, ''),
    'opening_time', to_char(p_opening_time, 'HH24:MI'),
    'closing_time', to_char(p_closing_time, 'HH24:MI')
  );
end;
$$;

revoke all on function public.wa_set_business_hours(text, time, time)
  from public, anon, authenticated;
grant execute on function public.wa_set_business_hours(text, time, time)
  to service_role;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('0156', 'business_hours_onboarding')
on conflict (version) do nothing;
