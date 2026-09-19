-- ============================================================================
-- Fix: proactive notifications have been failing since 9 September
-- ============================================================================
-- claim_whatsapp_notification_deliveries raised
--
--   42703: column e.closing_time does not exist
--
-- on every single call. The `eligible` CTE filters on c.closing_time but never
-- projects it, and the `scheduled` CTE two lines later reads e.closing_time.
--
-- MEASURED: one daily_summary sent on 1 September, seven close_reminders
-- between the 1st and the 9th, and nothing at all since. The Vercel cron has
-- been calling this every night and receiving a 500, which no one saw because
-- a failing cron is silent by nature. Daily summaries, debt reminders and
-- BILLING reminders all drain through this one function.
--
-- The fix is one column in one select list. It is applied by rewriting the
-- stored source rather than by retyping the function: this is the money path,
-- and ~150 lines re-keyed by hand to change one line is how a second bug gets
-- introduced while fixing the first.

do $patch$
declare
  v_src  text;
  v_new  text;
  v_from text := '(p_now at time zone coalesce(c.timezone, ''Africa/Dar_es_Salaam''))::date as current_date
      from public.whatsapp_identities i';
  v_to   text := '(p_now at time zone coalesce(c.timezone, ''Africa/Dar_es_Salaam''))::date as current_date,
           c.closing_time
      from public.whatsapp_identities i';
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_whatsapp_notification_deliveries';

  if v_src is null then
    raise exception 'claim_whatsapp_notification_deliveries not found';
  end if;

  -- Idempotence check has to look for the PROJECTION, not the name. The first
  -- attempt tested for 'c.closing_time' anywhere in the source and matched the
  -- WHERE clause that was already there, so the patch skipped itself and the
  -- function stayed broken. Test for the patched shape instead.
  if position(v_to in v_src) > 0 then
    raise notice 'closing_time already projected; no change';
    return;
  end if;

  -- The marker appears only in the daily-summary CTE. The debt-reminder CTE
  -- below it selects local_date and never current_date, so a single
  -- substitution cannot touch the wrong one. Verify that before relying on it.
  if (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'expected exactly one match for the eligible CTE marker';
  end if;

  v_new := replace(v_src, v_from, v_to);

  execute format($fmt$
    create or replace function public.claim_whatsapp_notification_deliveries(
      p_now timestamp with time zone default clock_timestamp(),
      p_debt_stale_days integer default 7,
      p_limit integer default 50)
    returns table(delivery_id uuid, phone_e164 text, lang text,
                  notification_kind text, template_name text, parameters jsonb)
    language plpgsql security definer
    set search_path to 'pg_catalog', 'public'
    as %L
  $fmt$, v_new);
end $patch$;

-- ── The seven that were claimed and never finished ───────────────────────
-- Claimed into 'sending' and orphaned when the function started throwing. The
-- retry lane only picks up 'failed', so they would sit there for ever.
--
-- They are marked skipped, not retried. A close reminder for the 9th of
-- September, delivered on the 19th, is not a late reminder — it is a wrong
-- one, and telling a shop to close a day that closed ten days ago is worse
-- than saying nothing.
update public.whatsapp_notification_deliveries
   set status = 'skipped',
       last_error = 'orphaned_by_claim_failure',
       updated_at = now()
 where status = 'sending'
   and created_at < now() - interval '2 days';
