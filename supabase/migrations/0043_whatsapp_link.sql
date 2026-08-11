-- WhatsApp as an additional front door for receipt capture.
--
-- Scope is deliberately narrow: a linked employee sends a photo to Risip's one
-- official number, we run the existing extraction pipeline, and file the result as
-- a pending_review receipt that they finish in the web app. No conversation state
-- machine, no multi-org, no payments — one profile still belongs to one company.

-- ── Receipt provenance ─────────────────────────────────────────────────────
-- Until now the channel was implicit (scanned_doc_id set = batch/inbound). Make it
-- explicit so the dashboard can label WhatsApp receipts without guessing, and so a
-- second parallel source system never gets invented.
alter table receipts
  add column if not exists source text not null default 'web';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'receipts_source_check'
  ) then
    alter table receipts add constraint receipts_source_check
      check (source in ('web', 'batch', 'inbound_email', 'whatsapp'));
  end if;
end $$;

-- ── Verified WhatsApp identities ───────────────────────────────────────────
create table if not exists whatsapp_identities (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  phone_e164   text not null,
  wa_id        text,
  verified_at  timestamptz not null default now(),
  revoked_at   timestamptz,
  opted_out_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A live number resolves to exactly one profile, and a profile keeps one live
-- number. Revoked rows stay for audit but drop out of both constraints.
create unique index if not exists whatsapp_identities_active_phone_uniq
  on whatsapp_identities (phone_e164) where revoked_at is null;
create unique index if not exists whatsapp_identities_active_profile_uniq
  on whatsapp_identities (profile_id) where revoked_at is null;

-- ── Single-use linking tokens ──────────────────────────────────────────────
-- Only the SHA-256 hash is stored; the plaintext is returned to the caller once
-- and never persisted, so a database leak cannot be replayed into a link.
create table if not exists whatsapp_link_tokens (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  profile_id uuid not null references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  revoked_at timestamptz,
  attempts   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_link_tokens_profile_idx
  on whatsapp_link_tokens (profile_id, created_at desc);

-- ── Inbound message log doubling as the job queue ───────────────────────────
-- wa_message_id is unique, which is what makes Meta's at-least-once webhook
-- retries safe: a duplicate delivery collides here instead of creating a receipt.
create table if not exists whatsapp_messages (
  id             uuid primary key default gen_random_uuid(),
  wa_message_id  text not null unique,
  phone_e164     text,
  profile_id     uuid references profiles(id) on delete set null,
  company_id     uuid references companies(id) on delete set null,
  kind           text not null default 'image',
  media_id       text,
  media_mime     text,
  media_bytes    bigint,
  status         text not null default 'pending'
                 check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  retry_count    integer not null default 0,
  last_error     text,
  receipt_id     uuid references receipts(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  processed_at   timestamptz
);
-- Drives the worker's claim query and the stale-job sweep.
create index if not exists whatsapp_messages_pending_idx
  on whatsapp_messages (status, created_at) where status in ('pending', 'processing');

-- ── RLS ────────────────────────────────────────────────────────────────────
-- The webhook and worker use the service role (which bypasses RLS) and scope every
-- statement by company in code. These policies exist so the app itself can only
-- ever read a user's own linkage, never another tenant's.
alter table whatsapp_identities enable row level security;
alter table whatsapp_link_tokens enable row level security;
alter table whatsapp_messages enable row level security;

drop policy if exists whatsapp_identities_self_select on whatsapp_identities;
create policy whatsapp_identities_self_select on whatsapp_identities
  for select to authenticated
  using (profile_id = auth.uid());

-- No select policy on link tokens or the message log: nothing in the client needs
-- them, and token hashes should never reach the browser.

-- ── Linking RPCs ───────────────────────────────────────────────────────────
-- Mints a one-time token for the caller. Returns the plaintext exactly once.
create or replace function create_whatsapp_link_token()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := auth.uid();
  v_company uuid;
  v_token text;
begin
  if v_profile is null then raise exception 'not authenticated'; end if;
  select company_id into v_company from profiles
   where id = v_profile and deactivated_at is null;
  if v_company is null then raise exception 'no active profile'; end if;

  -- Supersede any outstanding token so only the newest one can be used.
  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = v_profile and used_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into whatsapp_link_tokens (token_hash, profile_id, company_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_profile, v_company,
          now() + interval '15 minutes');
  return v_token;
end;
$$;

-- Revokes the caller's own WhatsApp connection. Future messages from that number
-- resolve to no identity and are rejected by the webhook.
create or replace function revoke_whatsapp_identity()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_changed integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update whatsapp_identities
     set revoked_at = now(), updated_at = now()
   where profile_id = auth.uid() and revoked_at is null;
  get diagnostics v_changed = row_count;
  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = auth.uid() and used_at is null and revoked_at is null;
  return v_changed;
end;
$$;

grant execute on function create_whatsapp_link_token() to authenticated;
grant execute on function revoke_whatsapp_identity() to authenticated;

-- Deactivating an employee immediately kills their WhatsApp channel. The webhook
-- also re-checks deactivated_at, so this is defence in depth rather than the only
-- guard.
create or replace function whatsapp_revoke_on_deactivate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deactivated_at is not null and (old.deactivated_at is null) then
    update whatsapp_identities
       set revoked_at = now(), updated_at = now()
     where profile_id = new.id and revoked_at is null;
  end if;
  return new;
end $$;

drop trigger if exists whatsapp_revoke_on_deactivate_au on profiles;
create trigger whatsapp_revoke_on_deactivate_au
  after update of deactivated_at on profiles
  for each row execute function whatsapp_revoke_on_deactivate();
