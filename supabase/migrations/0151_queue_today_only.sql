-- The queue is TODAY'S, and a draft nobody answered is not waiting, it is lost.
--
-- MEASURED, on the owner's own number, within an hour of shipping the queue.
-- It showed him "vitu 3" to confirm and he asked the right question: "mbona si
-- records za leo?" They were from 22, 23 and 27 August. Today was the 30th.
--
-- Two separate faults, and only one of them was new.
--
-- MINE: wa_pending_record_queue had no date filter at all, so it swept up
-- every draft the shop had ever left unanswered and presented them as this
-- morning's batch — including one from a week earlier that had been read as a
-- stock purchase when the trader plainly said "matumizi... nimetumia nauli".
--
-- OLDER, and this is why there were three: nothing ever cleaned up a draft
-- that was never confirmed. Somebody is shown a sale, they do not reply, and
-- the row sits on pending_confirmation for ever. It is not in any total — the
-- ledger only counts confirmed rows, so no figure was ever wrong — but it is a
-- question still hanging in a conversation that moved on days ago.
--
-- A draft is a question. A question nobody answered by the end of the day was
-- not answered, and pretending otherwise is how a week-old misreading arrives
-- at somebody's till this morning.

create or replace function public.wa_pending_record_queue(
  p_company_id uuid,
  p_profile_id uuid
)
returns table (
  id uuid,
  kind text,
  amount numeric,
  party_name text,
  description text,
  occurred_at timestamptz,
  lines jsonb
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select r.id, r.kind, r.amount, r.party_name, r.description, r.occurred_at,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
              'description', l.description,
              'quantity', l.quantity,
              'line_total', l.line_total
            ) order by l.line_number)
            from public.daily_record_lines l
           where l.daily_record_id = r.id),
           '[]'::jsonb
         ) as lines
    from public.daily_records r
   where r.company_id = p_company_id
     and r.recorded_by = p_profile_id
     and r.status = 'pending_confirmation'
     and r.voided_at is null
     -- TODAY, in the shop's own timezone. A draft from another day belongs to
     -- that day's batch, and that batch is over.
     and (r.created_at at time zone 'Africa/Dar_es_Salaam')::date
         = (clock_timestamp() at time zone 'Africa/Dar_es_Salaam')::date
   order by r.created_at asc
   limit 40;
$function$;

revoke all on function public.wa_pending_record_queue(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_pending_record_queue(uuid, uuid) to service_role;

/**
 * Drop drafts nobody answered.
 *
 * Safe by construction: a pending_confirmation row has never been counted
 * anywhere — every total in Risip reads confirmed rows only — so dropping one
 * removes a question, never a figure. What it protects is the shopkeeper's
 * attention: a batch should hold what they typed this morning and nothing
 * else.
 *
 * Twelve hours rather than a calendar day: somebody drafting at eleven at
 * night should still be able to answer at midnight, and nobody answers a
 * question from yesterday morning.
 */
create or replace function public.wa_sweep_abandoned_drafts(p_older_than_hours integer default 12)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_dropped integer := 0;
begin
  with abandoned as (
    update public.daily_records
       set status = 'voided',
           -- The constraint requires a person, and a sweep has none. The
           -- person who drafted it is the honest answer: it was their draft
           -- and they left it. void_reason says how it ended, so nobody reads
           -- this as a deliberate reversal by them.
           voided_by = recorded_by,
           voided_at = clock_timestamp(),
           -- The reason has to be a real sentence: is_meaningful_reason
           -- demands twenty characters and eight distinct ones, which is
           -- deliberate — "voided" as a reason tells a shopkeeper nothing
           -- about their own books a year later.
           void_reason = 'Rasimu iliachwa bila kuthibitishwa ndani ya masaa 12',
           updated_at = clock_timestamp()
     where status = 'pending_confirmation'
       and voided_at is null
       and created_at < clock_timestamp()
           - (greatest(1, least(168, p_older_than_hours)) || ' hours')::interval
    returning 1
  )
  select count(*) into v_dropped from abandoned;
  return v_dropped;
exception when others then
  -- Housekeeping is never allowed to cost a shop its message.
  return 0;
end $function$;

revoke all on function public.wa_sweep_abandoned_drafts(integer) from public, anon, authenticated;
grant execute on function public.wa_sweep_abandoned_drafts(integer) to service_role;
