-- ============================================================================
-- The support view: answering "nilituma mauzo, hayakuingia"
-- ============================================================================
-- The console could see failure COUNTS and error codes. It could not see what
-- happened to one shop's messages, which is the only thing that answers the
-- call support actually receives.
--
-- Two causes account for most of those calls and neither was visible:
--
--   1. The record is sitting as an unconfirmed draft waiting for NDIYO. The
--      trader believes they sent it; Risip is waiting for a word back.
--   2. The model chose a tool that did not write, or the write failed with a
--      code nobody surfaced.
--
-- PRIVACY. No merchant wording crosses this boundary, and that is deliberate
-- rather than incidental: backend-contract.md promises the console never
-- returns raw messages, AI prompts or ledger rows. What it returns is the
-- SHAPE of what happened - intent, tool, outcome, latency, status - which
-- answers the support question without reading the shop's business. A trader
-- asking for help should not have their sales read to them by an operator.

create or replace function public.platform_admin_company_support(
  p_company_id uuid,
  p_days       integer default 7
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  perform private.require_platform_admin('read');
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'companyId', p_company_id,
    'days', v_days,

    -- ── Cause 1: waiting on the trader ───────────────────────────────────
    -- Pending drafts. The single most common "it did not save" that is not a
    -- fault at all.
    'pendingDrafts', (select count(*)::int from public.daily_records r
                       where r.company_id = p_company_id and r.status = 'pending'),
    'oldestPendingAt', (select min(r.created_at) from public.daily_records r
                         where r.company_id = p_company_id and r.status = 'pending'),

    -- A parked question the shop never answered stops everything behind it.
    'awaitingAnswer', (select jsonb_build_object('awaiting', w.awaiting, 'since', w.updated_at)
                       from public.whatsapp_conversations w
                       join public.whatsapp_identities i on i.id = w.identity_id
                       where i.company_id = p_company_id
                         and w.awaiting is not null
                         and (w.expires_at is null or w.expires_at > now())
                       order by w.updated_at desc limit 1),

    -- ── Cause 2: the message itself ──────────────────────────────────────
    'messages', jsonb_build_object(
      'total',   (select count(*)::int from public.whatsapp_messages m
                   where m.company_id = p_company_id and m.created_at >= v_start),
      'done',    (select count(*)::int from public.whatsapp_messages m
                   where m.company_id = p_company_id and m.created_at >= v_start and m.status = 'done'),
      'failed',  (select count(*)::int from public.whatsapp_messages m
                   where m.company_id = p_company_id and m.created_at >= v_start and m.status = 'failed'),
      'stuck',   (select count(*)::int from public.whatsapp_messages m
                   where m.company_id = p_company_id
                     and m.status in ('pending', 'processing')
                     and m.created_at < now() - interval '15 minutes')),

    -- The interpretation trail, newest first. Codes and outcomes only: which
    -- tool ran, whether the backend accepted it, how long it took. Enough to
    -- say "your message on Tuesday was read as a stock count, not a sale"
    -- without quoting a single word the trader wrote.
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', t.created_at,
               'status', t.status,
               'intent', t.semantic_intent,
               'tool', t.chosen_tool,
               'route', t.route,
               'outcome', t.backend_outcome,
               'failureCode', t.provider_failure_code,
               'latencyMs', t.latency_ms,
               'retries', t.retry_count) order by t.created_at desc)
      from (
        select m.created_at, m.status, m.retry_count,
               i.semantic_intent, i.chosen_tool, i.route,
               i.backend_outcome, i.provider_failure_code, i.latency_ms
        from public.whatsapp_messages m
        left join public.whatsapp_ai_interpretations i on i.wa_message_id = m.wa_message_id
        where m.company_id = p_company_id and m.created_at >= v_start
        order by m.created_at desc
        limit 30
      ) t), '[]'::jsonb),

    -- ── Can this shop even be reached ────────────────────────────────────
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'phone', w.phone_e164, 'verified', w.verified_at is not null,
               'revoked', w.revoked_at is not null,
               'optedOut', w.opted_out_at is not null,
               'proactiveOff', w.proactive_notifications_opted_out_at is not null))
      from public.whatsapp_identities w where w.company_id = p_company_id), '[]'::jsonb),

    -- ── And is it paid up ────────────────────────────────────────────────
    -- Support's second question, and the reason a shop may be blocked.
    'subscription', (select jsonb_build_object(
                        'plan', s.plan, 'status', s.status,
                        'periodEnd', s.current_period_end,
                        'daysLeft', case when s.current_period_end is null then null
                                         else (s.current_period_end::date - now()::date) end,
                        'graceUntil', s.grace_until)
                     from public.subscriptions s where s.company_id = p_company_id)
  );
end $$;

revoke all on function public.platform_admin_company_support(uuid, integer) from public, anon;
grant execute on function public.platform_admin_company_support(uuid, integer) to authenticated;
grant execute on function public.platform_admin_company_support(uuid, integer) to service_role;
