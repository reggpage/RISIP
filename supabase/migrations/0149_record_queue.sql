-- Recording without waiting: a tick now, one confirmation for the batch.
--
-- The owner's design, and his reason: "nilikuwa nafikiria jinsi ya kutatua
-- tatizo la kusubiri kila unaporekodi au gharama pia za ai". Today every line
-- costs a full turn — Haiku reads it, Sonnet writes a confirmation back, and
-- the shopkeeper waits six seconds at the counter before typing the next one.
--
-- MEASURED: the written confirmation is 81% of the cost of a record. Haiku
-- deciding what the message means is $0.0023; Sonnet writing the reply is
-- $0.0097. A tick costs nothing at all — it is a WhatsApp send, not a model
-- call — so acknowledging instantly and confirming the batch once is five
-- times cheaper AND removes the wait.
--
-- Nothing new is stored. A draft is ALREADY a daily_records row with status
-- 'pending_confirmation', and wa_confirm_daily_record_batch already takes an
-- array of ids. The queue is those rows; what changes is how they are shown.
--
-- BEHIND A FLAG, and deliberately. This is the path that writes money, and it
-- has to be provable on one shop before it is anybody's default. NULL keeps
-- today's behaviour exactly: one draft, one confirmation, one at a time.

alter table public.companies
  add column if not exists record_queue_size integer
    check (record_queue_size is null or record_queue_size between 2 and 30);

comment on column public.companies.record_queue_size is
  'How many drafts may wait before Risip asks the shopkeeper to confirm them '
  'together. NULL means the old behaviour: every record is confirmed on its '
  'own, immediately. The queue also flushes on any question and on closing '
  'the day, so nothing waits longer than the next thing the shopkeeper says.';

/**
 * The drafts waiting for this person right now, oldest first.
 *
 * Scoped to the PERSON rather than the shop: two workers recording at once
 * must not be handed each other's lines to confirm, and the ledger records who
 * entered what.
 */
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
   order by r.created_at asc
   limit 40;
$function$;

revoke all on function public.wa_pending_record_queue(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_pending_record_queue(uuid, uuid) to service_role;
