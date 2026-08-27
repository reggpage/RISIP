-- WHICH BRAIN ANSWERED THIS MESSAGE.
--
-- The architecture has said "AI-first" for four stages while two deterministic
-- parsers still stood in front of the model and took ordinary business language
-- away from it. A shop that sent three product lines never reached Haiku at all:
-- a parser counted the quantities, asked MAUZO or MANUNUZI, and offered to
-- register a product the shop already sells.
--
-- Nothing in the telemetry could have shown that. Every row said the assistant
-- was working, because the rows were only written when the assistant ran. The
-- messages it never saw left no trace.
--
-- This column is that trace. For ordinary business language the expected value
-- is 'ai_primary', and a rise in anything else is the regression showing itself
-- before a shopkeeper has to notice it.
--
--   ai_primary          the model interpreted it. The normal route.
--   pending_protocol    it answered a bounded question Risip had just asked.
--   ai_outage_fallback  the model could not be reached; parsers served it.
--
-- ROLLBACK:
--   drop function if exists public.wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text, text);
--   alter table public.whatsapp_ai_interpretations drop column if exists route;
--   (then re-apply 0140's function definition)

alter table public.whatsapp_ai_interpretations
  add column if not exists route text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ai_interp_route_check'
       and conrelid = 'public.whatsapp_ai_interpretations'::regclass
  ) then
    alter table public.whatsapp_ai_interpretations
      add constraint ai_interp_route_check check (
        route is null or route in ('ai_primary', 'pending_protocol', 'ai_outage_fallback'));
  end if;
end $$;

comment on column public.whatsapp_ai_interpretations.route is
  'Who interpreted this message: ai_primary (the model, and the expected value for ordinary business language), pending_protocol (a bounded answer to a question Risip asked), ai_outage_fallback (the deterministic parsers, because the model could not be reached).';

-- The old signature goes, rather than sitting beside the new one as a silent
-- overload that writes rows with no route.
drop function if exists public.wa_record_ai_interpretation(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text);

create or replace function public.wa_record_ai_interpretation(
  p_company_id uuid,
  p_wa_message_id text,
  p_model text,
  p_prompt_version text,
  p_tool_schema_version text,
  p_chosen_tool text,
  p_semantic_intent text,
  p_tool_rounds integer,
  p_latency_ms integer,
  p_backend_outcome text,
  p_rejection_code text,
  p_clarification_field text,
  p_fallback_used boolean,
  p_fallback_reason text,
  p_provider_failure_code text,
  p_route text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if p_company_id is null or nullif(btrim(coalesce(p_wa_message_id, '')), '') is null then
    return;
  end if;

  insert into public.whatsapp_ai_interpretations (
    company_id, wa_message_id, model, prompt_version, tool_schema_version,
    chosen_tool, semantic_intent, tool_rounds, latency_ms,
    backend_outcome, rejection_code, clarification_field,
    fallback_used, fallback_reason, provider_failure_code, route)
  values (
    p_company_id, btrim(p_wa_message_id),
    left(p_model, 64), left(p_prompt_version, 48), left(p_tool_schema_version, 48),
    left(p_chosen_tool, 64), left(coalesce(nullif(btrim(p_semantic_intent), ''), 'unknown'), 48),
    p_tool_rounds, p_latency_ms,
    p_backend_outcome, left(p_rejection_code, 64), left(p_clarification_field, 48),
    coalesce(p_fallback_used, false), p_fallback_reason, left(p_provider_failure_code, 200),
    left(p_route, 32))
  on conflict (wa_message_id) do update set
    chosen_tool = excluded.chosen_tool,
    semantic_intent = excluded.semantic_intent,
    tool_rounds = excluded.tool_rounds,
    latency_ms = excluded.latency_ms,
    backend_outcome = excluded.backend_outcome,
    rejection_code = excluded.rejection_code,
    clarification_field = excluded.clarification_field,
    fallback_used = excluded.fallback_used,
    fallback_reason = excluded.fallback_reason,
    provider_failure_code = excluded.provider_failure_code,
    route = excluded.route;

  delete from public.whatsapp_ai_interpretations
   where company_id = p_company_id and expires_at < now();
exception when others then
  -- Telemetry must never break a shop's message.
  return;
end;
$fn$;

revoke all on function public.wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text, text)
  to service_role;
