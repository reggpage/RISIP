-- What Meta actually said when we asked for "typing…".
--
-- Four fixes have now been aimed at this and every one of them shipped without
-- a single observation of the request that is supposedly failing. The webhook
-- logs `whatsapp typing indicator failed: <status>` to stderr, which is exactly
-- where nobody can reach it afterwards: no log query in the CLI, and the
-- dashboard keeps a short window. So the same guess got made four times.
--
-- This records the one thing that settles it: for EVERY typing request, which
-- message it was for, how many attempts had already been made for that same
-- message, how long after the message arrived, whether it had queued behind an
-- earlier message, and the HTTP status Meta returned.
--
-- The hypothesis it exists to test: a typing indicator is raised with
-- `status: read`, which also marks the message read, and a message can only be
-- marked read ONCE. If that is so, then only attempt 1 for any message can ever
-- produce a bubble, every heartbeat pulse after it is a no-op, and a second
-- message whose single effective attempt is spent in the same instant that the
-- FIRST message's reply is delivered — which dismisses any active indicator —
-- can never show typing at all. That would explain the symptom exactly, and it
-- would explain why raising delays and adding heartbeats changed nothing.
--
-- Stores no message text, no phone number, no customer data. The message id is
-- already held by whatsapp_messages; nothing new is exposed.

create table if not exists public.whatsapp_typing_attempts (
  id bigserial primary key,
  wa_message_id text not null,
  -- 1 for the first request for this message, 2 for the next, and so on. The
  -- whole question is whether anything above 1 ever works.
  attempt smallint not null,
  -- Meta's HTTP status, or null when the call threw or timed out before a
  -- response (the indicator is cosmetic, so it is never allowed to raise).
  http_status smallint,
  -- Meta's own error code when it returns one, for telling "already read" apart
  -- from an expired token or a bad message id.
  meta_code integer,
  -- How late this pulse was. A pulse at 11 seconds is a pulse that spent the
  -- whole queue wait silent.
  ms_since_received integer,
  -- True when this message had to wait for an earlier message from the same
  -- phone. These are the ones the shopkeeper says show no typing.
  queued_behind_earlier boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

comment on table public.whatsapp_typing_attempts is
  'Every WhatsApp typing-indicator request and Meta''s answer. Diagnostic only; no message text, no phone number.';

create index if not exists whatsapp_typing_attempts_message_idx
  on public.whatsapp_typing_attempts (wa_message_id, attempt);
create index if not exists whatsapp_typing_attempts_recent_idx
  on public.whatsapp_typing_attempts (created_at desc);

-- Same posture as every other table here: RLS on, no policies, so nothing
-- reaches it except the service role the edge functions use.
alter table public.whatsapp_typing_attempts enable row level security;
revoke all on public.whatsapp_typing_attempts from public, anon, authenticated;
grant select, insert on public.whatsapp_typing_attempts to service_role;
grant usage, select on sequence public.whatsapp_typing_attempts_id_seq to service_role;

/**
 * Keep the diagnostic from becoming its own problem.
 *
 * This writes on every pulse of a heartbeat. Without a cap it would be the
 * fastest-growing table in the database and nobody would notice until it was.
 */
create or replace function public.wa_trim_typing_attempts(p_keep_hours integer default 72)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_dropped integer := 0;
begin
  with gone as (
    delete from public.whatsapp_typing_attempts
     where created_at < clock_timestamp()
           - (greatest(1, least(720, p_keep_hours)) || ' hours')::interval
    returning 1
  )
  select count(*) into v_dropped from gone;
  return v_dropped;
exception when others then
  -- Housekeeping never costs a shop its message.
  return 0;
end $function$;

revoke all on function public.wa_trim_typing_attempts(integer) from public, anon, authenticated;
grant execute on function public.wa_trim_typing_attempts(integer) to service_role;
