-- Risip plain-PostgreSQL bootstrap.
--
-- Reproduces the Supabase-provided shell (roles, schemas, auth/storage objects)
-- that the numbered migrations assume but do NOT create. Run this ONCE against
-- an empty PostgreSQL database before applying the migrations.
--
-- On Supabase these objects are created by the platform. On a plain Postgres
-- (e.g. a Namecheap VPS) nothing provides them, so this file does.

-- ─── roles ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit nologin bypassrls;
  end if;
end
$$;

-- ─── schemas ──────────────────────────────────────────────────────────────
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists supabase_migrations;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists net;

-- ─── extensions ───────────────────────────────────────────────────────────
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ─── auth.users (minimal: only what the FKs reference) ────────────────────
create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  phone      text unique,
  email      text unique,
  created_at timestamptz not null default now()
);

-- ─── auth helper functions (Supabase semantics: read request JWT claims) ──
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- ─── storage ──────────────────────────────────────────────────────────────
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id                 uuid primary key default gen_random_uuid(),
  bucket_id          text references storage.buckets(id),
  name               text,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  last_accessed_at   timestamptz default now(),
  metadata           jsonb
);

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- ─── Realtime publication (Supabase-managed on hosted) ────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- ─── supabase_migrations bookkeeping ──────────────────────────────────────
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name    text,
  statements text[],
  created_by text,
  inserted_at timestamptz not null default now()
);

-- ─── pg_cron / pg_net / vault stubs (Supabase-managed on hosted) ──────────
create table if not exists vault.decrypted_secrets (
  id uuid primary key default gen_random_uuid(),
  name text,
  decrypted_secret text
);

create table if not exists cron.job (
  jobid    bigint generated always as identity primary key,
  jobname  text,
  schedule text,
  command  text,
  active   boolean default true
);

create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  returning jobid
$$;

create or replace function cron.unschedule(p_jobid bigint)
returns boolean language sql as $$
  delete from cron.job where jobid = p_jobid; select true
$$;

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000
) returns bigint language sql as $$ select 1::bigint $$;