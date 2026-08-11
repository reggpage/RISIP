-- Language preference lives on the WhatsApp identity: it is a property of how the
-- person talks to the bot, not of their Risip profile, and it must survive
-- re-linking. Null means "not asked yet", which is what triggers the one-time
-- language prompt for identities linked before this migration.
alter table whatsapp_identities
  add column if not exists lang text check (lang in ('sw', 'en'));

-- The smallest conversation state the narrow flow needs: which question we asked,
-- and what it was about. One row per identity; a new question replaces the old.
create table if not exists whatsapp_conversations (
  identity_id  uuid primary key references whatsapp_identities(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  awaiting     text check (awaiting in ('language', 'project', 'payment_source')),
  receipt_id   uuid references receipts(id) on delete cascade,
  options      jsonb,
  expires_at   timestamptz not null default now() + interval '30 minutes',
  updated_at   timestamptz not null default now()
);

-- Append-only trail of what the assistant did and why. Deliberately holds intent
-- and outcome, never message bodies, tokens or secrets.
create table if not exists whatsapp_audit_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  profile_id    uuid references profiles(id) on delete set null,
  wa_message_id text,
  intent        text,
  action        text,
  outcome       text,
  receipt_id    uuid references receipts(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists whatsapp_audit_log_company_idx
  on whatsapp_audit_log (company_id, created_at desc);

alter table whatsapp_conversations enable row level security;
alter table whatsapp_audit_log enable row level security;

-- Neither table is read from the browser; the webhook and worker use the service
-- role. No policies = deny, which is the posture we want.

comment on column whatsapp_identities.lang is
  'sw | en | null. Null means the one-time language question has not been asked yet.';

-- The caption sent with a receipt photo. Treated strictly as untrusted data: it
-- is matched against the sender's own authorised projects, never executed as an
-- instruction and never used to widen access.
alter table whatsapp_messages add column if not exists caption text;

-- Per-step latency so the slowest part of the pipeline is measurable rather than
-- guessed. Holds elapsed milliseconds only: no tokens, image bytes or personal data.
alter table whatsapp_messages add column if not exists timings jsonb;
