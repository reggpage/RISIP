-- P1: a person can start from WhatsApp, and can move between their businesses.
--
-- P0 made multi-business possible in the schema. This makes it reachable: an
-- unknown number can create a business or join one with a code, a linked number
-- can switch which business it is recording into, and either can ask for a
-- short-lived link to sign in on the web.
--
-- WHAT THIS DOES NOT DO: no sales, stock, debts or analytics; no finance-control
-- logic changes; no flag changes.
--
-- SECURITY POSTURE
--   * One phone number maps to one person, globally. That is the existing partial
--     unique index on whatsapp_identities(phone_e164) where revoked_at is null,
--     and it is deliberately unchanged.
--   * One person may belong to many companies: company_members (P0).
--   * Switching is membership-checked in a SECURITY DEFINER RPC. Nothing writes
--     profiles.active_company_id directly -- 0073 already fails closed if it ever
--     pointed somewhere the person does not belong, and this is the second lock.
--   * Login tokens live 5 minutes, are single use, are stored only as a SHA-256
--     hash, and are attempt-capped. Shorter than the 15-minute account-linking
--     token because this one hands over a session rather than binding a number.
--   * No password is ever sent through WhatsApp, and no money action is reachable
--     from a plain text message. Those stay behind a real web session.
--
-- ROLLBACK
--   drop the four new tables and the RPCs added here; alter table profiles drop
--   column lang. whatsapp_identities.company_id keeps its data either way.

-- ── The person's default language ─────────────────────────────────────────
-- Chosen in WhatsApp, remembered for the web. The browser keeps its own
-- localStorage override, so a shared laptop can still be read in English while
-- the owner's phone speaks Kiswahili.
alter table profiles add column if not exists lang text
  check (lang is null or lang in ('en', 'sw'));

-- The identity's company binding is now legacy: profiles.active_company_id is the
-- context, so a number that serves two businesses is not lying about either.
alter table whatsapp_identities alter column company_id drop not null;

-- ── Company-level invite codes ────────────────────────────────────────────
-- invite_links is project-scoped (project_id NOT NULL) and a Kariakoo shop has no
-- projects, so joining a COMPANY needs its own code.
create table if not exists company_invite_codes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  code        text not null unique,
  role        user_role not null default 'worker',
  expires_at  timestamptz,
  max_uses    integer,
  uses        integer not null default 0,
  revoked_at  timestamptz,
  created_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint invite_code_role_not_owner check (role <> 'owner'),
  constraint invite_code_uses_sane check (max_uses is null or max_uses > 0)
);
create index if not exists company_invite_codes_company_idx on company_invite_codes (company_id);

alter table company_invite_codes enable row level security;
drop policy if exists company_invite_codes_select on company_invite_codes;
create policy company_invite_codes_select on company_invite_codes
  for select to authenticated
  using (company_id = private.auth_company_id()
         and private.auth_role() = any (array['owner', 'accountant']::user_role[]));
-- No write policy: codes are minted by the RPC below.

-- ── Onboarding state for a number with no identity yet ────────────────────
-- Keyed by phone because there is nothing else to key it by. Short-lived so an
-- abandoned conversation does not become a permanent record of a stranger.
create table if not exists whatsapp_onboarding (
  phone_e164 text primary key,
  step       text not null,
  lang       text check (lang in ('en', 'sw')),
  draft      jsonb not null default '{}'::jsonb,
  attempts   integer not null default 0,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table whatsapp_onboarding enable row level security;
-- No policy at all: service-role only. Nobody signed in has any business reading
-- the half-finished sign-up of a phone number that is not theirs.

-- ── Web login tokens issued over WhatsApp ─────────────────────────────────
create table if not exists wa_login_tokens (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  profile_id uuid not null references profiles(id) on delete cascade,
  phone_e164 text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  attempts   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wa_login_tokens_profile_idx on wa_login_tokens (profile_id, created_at desc);
alter table wa_login_tokens enable row level security;
-- No policy: service-role only, and the plaintext never touches this table.

-- ══ RPCs ══════════════════════════════════════════════════════════════════

-- What businesses am I in? Drives both the web switcher and the WhatsApp list.
create or replace function public.my_memberships()
returns table (company_id uuid, company_name text, role user_role, is_active boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select c.id, c.name, m.role, (p.active_company_id = c.id)
    from company_members m
    join companies c on c.id = m.company_id
    join profiles p on p.id = m.profile_id
   where m.profile_id = auth.uid()
     and m.deactivated_at is null
   order by c.name;
$$;
revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

-- The only door to changing business context, for the web.
create or replace function public.switch_active_company(p_company uuid)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = 'P0001'; end if;
  select c.name into v_name
    from company_members m join companies c on c.id = m.company_id
   where m.profile_id = auth.uid() and m.company_id = p_company
     and m.deactivated_at is null;
  if v_name is null then
    raise exception 'you are not a member of that business'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;
  update profiles set active_company_id = p_company where id = auth.uid();
  return v_name;
end $$;
revoke execute on function public.switch_active_company(uuid) from public, anon;
grant execute on function public.switch_active_company(uuid) to authenticated;

-- Same rule, reached from WhatsApp, where there is no JWT to read.
create or replace function public.wa_switch_active_company(p_phone text, p_company uuid)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_profile uuid; v_name text;
begin
  select i.profile_id into v_profile from whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  select c.name into v_name
    from company_members m join companies c on c.id = m.company_id
   where m.profile_id = v_profile and m.company_id = p_company
     and m.deactivated_at is null;
  if v_name is null then
    raise exception 'you are not a member of that business'
      using errcode = 'P0001', hint = 'not_a_member';
  end if;
  update profiles set active_company_id = p_company where id = v_profile;
  return v_name;
end $$;
revoke execute on function public.wa_switch_active_company(text, uuid) from public, anon, authenticated;

-- Businesses for a phone number, for the WhatsApp switch list.
create or replace function public.wa_memberships(p_phone text)
returns table (company_id uuid, company_name text, role user_role, is_active boolean)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select c.id, c.name, m.role, (p.active_company_id = c.id)
    from whatsapp_identities i
    join company_members m on m.profile_id = i.profile_id and m.deactivated_at is null
    join companies c on c.id = m.company_id
    join profiles p on p.id = i.profile_id
   where i.phone_e164 = p_phone and i.revoked_at is null
   order by c.name;
$$;
revoke execute on function public.wa_memberships(text) from public, anon, authenticated;

-- ── Language ──────────────────────────────────────────────────────────────
create or replace function public.wa_set_language(p_phone text, p_lang text)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_profile uuid;
begin
  if p_lang not in ('en', 'sw') then raise exception 'unknown language %', p_lang; end if;
  update whatsapp_identities set lang = p_lang, updated_at = now()
   where phone_e164 = p_phone and revoked_at is null
   returning profile_id into v_profile;
  -- Sync to the person, so the web opens in the language they chose on the phone.
  if v_profile is not null then
    update profiles set lang = p_lang where id = v_profile;
  end if;
  update whatsapp_onboarding set lang = p_lang, updated_at = now() where phone_e164 = p_phone;
  return p_lang;
end $$;
revoke execute on function public.wa_set_language(text, text) from public, anon, authenticated;

-- ── Invite codes ──────────────────────────────────────────────────────────
create or replace function public.create_company_invite_code(
  p_role user_role default 'worker', p_days integer default 14, p_max_uses integer default null
)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_code text; v_company uuid;
begin
  if private.auth_role() <> 'owner' then
    raise exception 'only the owner may create an invite code'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_role = 'owner' then
    raise exception 'an invite code cannot grant ownership' using errcode = 'P0001';
  end if;
  v_company := private.auth_company_id();

  -- No 0/O/1/I/L: this gets read aloud and typed on a phone keypad.
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                             (floor(random() * 31) + 1)::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from company_invite_codes where code = v_code);
  end loop;

  insert into company_invite_codes (company_id, code, role, expires_at, max_uses, created_by)
  values (v_company, v_code, p_role,
          case when p_days is null then null else now() + make_interval(days => p_days) end,
          p_max_uses, auth.uid());
  return v_code;
end $$;
revoke execute on function public.create_company_invite_code(user_role, integer, integer) from public, anon;
grant execute on function public.create_company_invite_code(user_role, integer, integer) to authenticated;

-- ── Onboarding completion (called by the webhook after it creates the auth user) ──
create or replace function public.wa_create_business(
  p_user uuid, p_phone text, p_full_name text, p_company_name text, p_location text
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_company uuid;
begin
  if exists (select 1 from whatsapp_identities where phone_e164 = p_phone and revoked_at is null) then
    raise exception 'this number is already linked' using errcode = 'P0001', hint = 'already_linked';
  end if;
  if coalesce(btrim(p_company_name), '') = '' then
    raise exception 'a business needs a name' using errcode = 'P0001';
  end if;

  insert into companies (name, hq_location) values (btrim(p_company_name), coalesce(nullif(btrim(p_location), ''), 'Tanzania'))
  returning id into v_company;

  insert into profiles (id, company_id, active_company_id, full_name, phone, role)
  values (p_user, v_company, v_company, coalesce(nullif(btrim(p_full_name), ''), 'Mmiliki'), p_phone, 'owner');

  insert into company_members (profile_id, company_id, role) values (p_user, v_company, 'owner');

  insert into whatsapp_identities (profile_id, company_id, phone_e164, lang)
  values (p_user, v_company, p_phone,
          (select lang from whatsapp_onboarding where phone_e164 = p_phone));

  delete from whatsapp_onboarding where phone_e164 = p_phone;
  return jsonb_build_object('company_id', v_company, 'company_name', btrim(p_company_name));
end $$;
revoke execute on function public.wa_create_business(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.wa_join_by_code(
  p_user uuid, p_phone text, p_code text, p_full_name text
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v record; v_existing uuid;
begin
  select ic.* into v from company_invite_codes ic
   where ic.code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'that code was not recognised' using errcode = 'P0001', hint = 'bad_code';
  end if;
  if v.revoked_at is not null then
    raise exception 'that code has been cancelled' using errcode = 'P0001', hint = 'revoked_code';
  end if;
  if v.expires_at is not null and v.expires_at < now() then
    raise exception 'that code has expired' using errcode = 'P0001', hint = 'expired_code';
  end if;
  if v.max_uses is not null and v.uses >= v.max_uses then
    raise exception 'that code has already been used the maximum number of times'
      using errcode = 'P0001', hint = 'code_used_up';
  end if;

  -- A number already linked to somebody else must never be re-pointed silently.
  select profile_id into v_existing from whatsapp_identities
   where phone_e164 = p_phone and revoked_at is null;
  if v_existing is not null and v_existing <> p_user then
    raise exception 'this number is already linked to another account'
      using errcode = 'P0001', hint = 'already_linked';
  end if;

  if not exists (select 1 from profiles where id = p_user) then
    insert into profiles (id, company_id, active_company_id, full_name, phone, role)
    values (p_user, v.company_id, v.company_id,
            coalesce(nullif(btrim(p_full_name), ''), 'Mfanyakazi'), p_phone, v.role);
  end if;

  insert into company_members (profile_id, company_id, role)
  values (p_user, v.company_id, v.role)
  on conflict (profile_id, company_id) do update set deactivated_at = null;

  update profiles set active_company_id = v.company_id where id = p_user;

  if v_existing is null then
    insert into whatsapp_identities (profile_id, company_id, phone_e164, lang)
    values (p_user, v.company_id, p_phone,
            (select lang from whatsapp_onboarding where phone_e164 = p_phone));
  end if;

  update company_invite_codes set uses = uses + 1 where id = v.id;
  delete from whatsapp_onboarding where phone_e164 = p_phone;

  return jsonb_build_object('company_id', v.company_id, 'role', v.role,
    'company_name', (select name from companies where id = v.company_id));
end $$;
revoke execute on function public.wa_join_by_code(uuid, text, text, text) from public, anon, authenticated;

-- ── Login links ───────────────────────────────────────────────────────────
create or replace function public.wa_issue_login_token(p_phone text)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_profile uuid; v_token text;
begin
  select profile_id into v_profile from whatsapp_identities
   where phone_e164 = p_phone and revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;

  -- Only the newest link works, so an old message in the chat history is dead.
  update wa_login_tokens set used_at = now()
   where profile_id = v_profile and used_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into wa_login_tokens (token_hash, profile_id, phone_e164, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_profile, p_phone,
          now() + interval '5 minutes');
  return v_token;
end $$;
revoke execute on function public.wa_issue_login_token(text) from public, anon, authenticated;

create or replace function public.wa_consume_login_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v record;
begin
  select * into v from wa_login_tokens
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    raise exception 'that link is not valid' using errcode = 'P0001', hint = 'bad_token';
  end if;
  update wa_login_tokens set attempts = attempts + 1 where id = v.id;
  if v.used_at is not null then
    raise exception 'that link has already been used' using errcode = 'P0001', hint = 'used_token';
  end if;
  if v.expires_at < now() then
    raise exception 'that link has expired' using errcode = 'P0001', hint = 'expired_token';
  end if;

  update wa_login_tokens set used_at = now() where id = v.id;
  return jsonb_build_object('profile_id', v.profile_id, 'phone', v.phone_e164);
end $$;
revoke execute on function public.wa_consume_login_token(text) from public, anon, authenticated;

-- ── Bring the account-linking token in line with P0 ────────────────────────
-- It read profiles.company_id, which is no longer what "my company" means.
create or replace function public.create_whatsapp_link_token()
returns text
language plpgsql security definer set search_path = public
as $$
declare v_profile uuid := auth.uid(); v_company uuid; v_token text;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  v_company := private.auth_company_id();
  if v_company is null then raise exception 'no active business'; end if;

  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = v_profile and used_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into whatsapp_link_tokens (token_hash, profile_id, company_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_profile, v_company,
          now() + interval '15 minutes');
  return v_token;
end $$;
