-- WhatsApp-first public authentication hardening.
--
-- Supabase Auth still requires an internal identifier, so WhatsApp-created users
-- keep their unrouteable @wa.invalid address. This migration deliberately does
-- not alter auth.users: WhatsApp is the public credential, while the synthetic
-- address remains an implementation detail that cannot receive mail.

alter table public.whatsapp_identities
  drop constraint if exists whatsapp_identities_phone_e164_format;
alter table public.whatsapp_identities
  add constraint whatsapp_identities_phone_e164_format
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$') not valid;

alter table public.whatsapp_onboarding
  drop constraint if exists whatsapp_onboarding_phone_e164_format;
alter table public.whatsapp_onboarding
  add constraint whatsapp_onboarding_phone_e164_format
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$') not valid;

create unique index if not exists whatsapp_identities_active_phone_uniq
  on public.whatsapp_identities (phone_e164)
  where revoked_at is null;

create table if not exists public.wa_web_auth_request_log (
  id uuid primary key default extensions.gen_random_uuid(),
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists wa_web_auth_request_phone_idx
  on public.wa_web_auth_request_log (phone_hash, created_at desc);
create index if not exists wa_web_auth_request_ip_idx
  on public.wa_web_auth_request_log (ip_hash, created_at desc);

alter table public.wa_web_auth_request_log enable row level security;
-- No policies: only the service-role endpoint may inspect authentication probes.

create or replace function public.wa_allow_web_auth_request(
  p_phone_hash text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_phone_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request fingerprint' using errcode = '22023';
  end if;

  -- One lock per phone prevents concurrent serverless invocations from racing
  -- past the count and issuing multiple login links.
  perform pg_advisory_xact_lock(hashtextextended(p_phone_hash, 0));

  if (select count(*) from public.wa_web_auth_request_log
      where phone_hash = p_phone_hash and created_at > now() - interval '15 minutes') >= 5
     or
     (select count(*) from public.wa_web_auth_request_log
      where ip_hash = p_ip_hash and created_at > now() - interval '15 minutes') >= 20 then
    return false;
  end if;

  insert into public.wa_web_auth_request_log (phone_hash, ip_hash)
  values (p_phone_hash, p_ip_hash);

  -- Opportunistic bounded retention; hashes are useful only for short-term abuse control.
  delete from public.wa_web_auth_request_log where created_at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on table public.wa_web_auth_request_log from public, anon, authenticated;
revoke all on function public.wa_allow_web_auth_request(text, text) from public, anon, authenticated;
grant execute on function public.wa_allow_web_auth_request(text, text) to service_role;

-- The former public company directory and shared-password entry door are no
-- longer part of Risip. Keep historical columns/data for rollback and audit,
-- but remove direct browser execution. Service-role legacy functions are left
-- intact until their deployed edge endpoints are retired separately.
revoke execute on function public.search_companies(text) from anon, authenticated;
revoke execute on function public.verify_company_password(uuid, text) from anon, authenticated;
revoke execute on function public.set_company_password(text) from authenticated;

comment on column public.companies.password_hash is
  'Deprecated shared-company password. Retained temporarily for rollback; WhatsApp invite codes replace it.';
comment on table public.wa_web_auth_request_log is
  'HMAC fingerprints used only for WhatsApp login request rate limiting; no raw phone or IP is stored.';
