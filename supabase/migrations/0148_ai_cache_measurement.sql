-- "Je Risip inatumia cache kweli?"
--
-- The owner asked, and the honest answer was that nobody had ever measured it.
-- The code had cache_control in the right places, the Console showed a hit rate
-- across ALL API usage including receipt extraction, and neither of those is
-- evidence about the WhatsApp assistant specifically.
--
-- Reading it turned up a real fault: the system prompt carried the clock
-- rendered to the MINUTE, and prompt caching is a prefix match — so that
-- breakpoint was invalidated 1,440 times a day while the tools above it went on
-- caching normally. Roughly five thousand tokens were re-billed at full price
-- on every message and written to the cache again at 1.25x for a copy nothing
-- would ever read. The clock has moved into the trader's message, which sits
-- after every breakpoint and is not cached anyway.
--
-- These two columns exist so the question is never answered from belief again.
-- Token counts are not business data: no wording, no name, no price, no total.

alter table public.whatsapp_ai_interpretations
  add column if not exists cache_read_tokens integer,
  add column if not exists cache_write_tokens integer;

comment on column public.whatsapp_ai_interpretations.cache_read_tokens is
  'Prefix tokens served from cache across the whole turn. Zero with a non-zero '
  'write means something upstream changed between calls and the cache was paid '
  'for and thrown away.';
comment on column public.whatsapp_ai_interpretations.cache_write_tokens is
  'Prefix tokens written to cache across the whole turn, billed at 1.25x.';

-- DROP FIRST, and this is not tidiness.
--
-- Adding two defaulted parameters changes the SIGNATURE, so `create or replace`
-- creates an OVERLOAD rather than replacing anything. Both versions would then
-- accept the webhook's sixteen named arguments, Postgres would refuse to choose
-- ("function is not unique"), and every telemetry write would fail — silently,
-- because the write is deliberately wrapped so it can never cost a shop its
-- answer. The rollback test caught this before it was applied.
drop function if exists public.wa_record_ai_interpretation(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text,
  boolean, text, text, text
);

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
  p_route text default null,
  p_cache_read_tokens integer default null,
  p_cache_write_tokens integer default null
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  delete from public.whatsapp_ai_interpretations where expires_at < now();

  insert into public.whatsapp_ai_interpretations (
    company_id, wa_message_id, model, prompt_version, tool_schema_version,
    chosen_tool, semantic_intent, tool_rounds, latency_ms, backend_outcome,
    rejection_code, clarification_field, fallback_used, fallback_reason,
    provider_failure_code, route, cache_read_tokens, cache_write_tokens
  ) values (
    p_company_id, p_wa_message_id, left(p_model, 64), left(p_prompt_version, 64),
    left(p_tool_schema_version, 64), left(p_chosen_tool, 64), left(p_semantic_intent, 48),
    p_tool_rounds, p_latency_ms, p_backend_outcome, left(p_rejection_code, 64),
    left(p_clarification_field, 48), coalesce(p_fallback_used, false),
    p_fallback_reason, left(p_provider_failure_code, 200), left(p_route, 32),
    greatest(0, p_cache_read_tokens), greatest(0, p_cache_write_tokens)
  )
  on conflict (wa_message_id) do update set
    model = excluded.model,
    prompt_version = excluded.prompt_version,
    tool_schema_version = excluded.tool_schema_version,
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
    route = excluded.route,
    cache_read_tokens = excluded.cache_read_tokens,
    cache_write_tokens = excluded.cache_write_tokens;
exception when others then
  -- Telemetry has never been allowed to cost a shop its answer.
  null;
end $function$;

revoke all on function public.wa_record_ai_interpretation(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text,
  boolean, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.wa_record_ai_interpretation(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text,
  boolean, text, text, text, integer, integer
) to service_role;
