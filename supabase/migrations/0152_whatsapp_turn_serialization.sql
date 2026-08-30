-- Serialize text and control turns per WhatsApp number.
--
-- Separate webhook invocations can overlap. The lease is held while one turn
-- reads/writes conversation state and sends its reply; different phone numbers
-- keep running in parallel. The owner token prevents an expired invocation from
-- releasing a newer owner's lease.

create table if not exists public.whatsapp_turn_locks (
  phone_e164  text primary key,
  owner_token uuid not null,
  lease_until timestamptz not null,
  created_at  timestamptz not null default clock_timestamp(),
  updated_at  timestamptz not null default clock_timestamp()
);

alter table public.whatsapp_turn_locks enable row level security;

create or replace function public.wa_try_acquire_whatsapp_turn(
  p_phone text,
  p_owner_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_acquired boolean;
begin
  insert into public.whatsapp_turn_locks (phone_e164, owner_token, lease_until)
  values (
    p_phone,
    p_owner_token,
    clock_timestamp() + (greatest(30, least(600, p_lease_seconds)) || ' seconds')::interval
  )
  on conflict (phone_e164) do update
     set owner_token = excluded.owner_token,
         lease_until = excluded.lease_until,
         updated_at = clock_timestamp()
   where public.whatsapp_turn_locks.lease_until <= clock_timestamp()
      or public.whatsapp_turn_locks.owner_token = p_owner_token
  returning true into v_acquired;
  return coalesce(v_acquired, false);
end;
$function$;

create or replace function public.wa_release_whatsapp_turn(
  p_phone text,
  p_owner_token uuid
)
returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  delete from public.whatsapp_turn_locks
   where phone_e164 = p_phone
     and owner_token = p_owner_token
  returning true;
$function$;

create or replace function public.wa_renew_whatsapp_turn(
  p_phone text,
  p_owner_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  update public.whatsapp_turn_locks
     set lease_until = clock_timestamp() + (greatest(30, least(600, p_lease_seconds)) || ' seconds')::interval,
         updated_at = clock_timestamp()
   where phone_e164 = p_phone
     and owner_token = p_owner_token
  returning true;
$function$;

revoke all on table public.whatsapp_turn_locks from public, anon, authenticated;
revoke all on function public.wa_try_acquire_whatsapp_turn(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.wa_release_whatsapp_turn(text, uuid) from public, anon, authenticated;
revoke all on function public.wa_renew_whatsapp_turn(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.wa_try_acquire_whatsapp_turn(text, uuid, integer) to service_role;
grant execute on function public.wa_release_whatsapp_turn(text, uuid) to service_role;
grant execute on function public.wa_renew_whatsapp_turn(text, uuid, integer) to service_role;
