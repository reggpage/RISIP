-- STAGE A — measure the brain before changing what it is allowed to do.
--
-- Every wrong decision this month came from not being able to see what the
-- assistant was doing. "Shingapi" cost three unanswered messages before anyone
-- noticed; a malformed tool schema returned 400 for a whole day and looked
-- exactly like a stupid model; an empty reply was answered with a help menu
-- that implied the question was off-topic. In all three cases the system knew
-- and had nowhere to write it down.
--
-- This table is that place. It records WHAT THE ASSISTANT DID, never what the
-- trader said.
--
-- WHAT IS DELIBERATELY ABSENT, and must stay absent:
--   message text, product wording, customer or supplier names, phone numbers,
--   prices, totals, balances, and any prose the model wrote.
--
-- The shop's data is already in the ledger. A second copy living in an
-- analytics table is a second place it can leak from, and none of the questions
-- Stage A has to answer need it. Free-text columns here are bounded to 64
-- characters and carry codes, not sentences.
--
-- ROLLBACK:
--   drop function if exists public.wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text);
--   drop table if exists public.whatsapp_ai_interpretations;

create table if not exists public.whatsapp_ai_interpretations (
  id                   uuid primary key default gen_random_uuid(),
  -- Cascade rather than an entry in the permanent-delete list: that function
  -- ends with `delete from public.companies`, so the FK removes these rows with
  -- it and 0138 does not have to be reopened and risk drifting.
  company_id           uuid not null references public.companies(id) on delete cascade,
  -- Links an interpretation to its message, and through daily_records.
  -- source_message_id to the draft it produced and whether the trader
  -- confirmed it. Enough for the confirmation signal in stage A's brief
  -- without changing confirmation itself.
  wa_message_id        text not null,

  -- Which interpreter produced this, so a later regression can be attributed.
  model                text,
  prompt_version       text,
  tool_schema_version  text,

  -- What the model did.
  chosen_tool          text,
  semantic_intent      text not null default 'unknown',
  tool_rounds          smallint,
  latency_ms           integer,

  -- What happened afterwards. Tool choice alone says nothing about whether the
  -- shop was served: a perfectly understood sale can still be rejected because
  -- the product is not in the catalogue.
  backend_outcome      text not null,
  rejection_code       text,
  clarification_field  text,

  -- Why the assistant did not serve the user, when it did not. "Fallback" on
  -- its own is the answer that hid a dead API for a day.
  fallback_used        boolean not null default false,
  fallback_reason      text,
  provider_failure_code text,

  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default now() + interval '30 days',

  constraint ai_interp_outcome_check check (backend_outcome in (
    'answered', 'drafted', 'clarified', 'rejected',
    'fallback', 'provider_failed', 'budget_blocked')),

  constraint ai_interp_fallback_reason_check check (
    fallback_reason is null or fallback_reason in (
      'model_success', 'model_empty', 'provider_error', 'provider_timeout',
      'budget_block', 'invalid_tool_schema', 'model_reply_deferred_for_safety',
      'not_eligible')),

  -- Codes, never sentences. The cap is the guard against merchant text
  -- arriving here by accident later.
  constraint ai_interp_short_codes_check check (
    coalesce(length(chosen_tool), 0) <= 64
    and coalesce(length(semantic_intent), 0) <= 48
    and coalesce(length(rejection_code), 0) <= 64
    and coalesce(length(clarification_field), 0) <= 48
    and coalesce(length(provider_failure_code), 0) <= 200
    and coalesce(length(model), 0) <= 64
    and coalesce(length(prompt_version), 0) <= 48
    and coalesce(length(tool_schema_version), 0) <= 48),

  constraint ai_interp_latency_check check (
    latency_ms is null or (latency_ms >= 0 and latency_ms <= 600000)),
  constraint ai_interp_rounds_check check (
    tool_rounds is null or (tool_rounds >= 0 and tool_rounds <= 20))
);

-- One row per message. A redelivered webhook must not double-count.
create unique index if not exists ai_interp_message_idx
  on public.whatsapp_ai_interpretations (wa_message_id);

-- The two questions this table exists to answer: what happened in this company
-- recently, and what has expired.
create index if not exists ai_interp_company_time_idx
  on public.whatsapp_ai_interpretations (company_id, created_at desc);
create index if not exists ai_interp_expiry_idx
  on public.whatsapp_ai_interpretations (expires_at);

alter table public.whatsapp_ai_interpretations enable row level security;
-- No policy, deliberately. No policy means deny, which is this repo's posture,
-- and service_role bypasses RLS. Ordinary clients cannot read operational
-- telemetry about other people's shops, or their own.

comment on table public.whatsapp_ai_interpretations is
  'Stage A telemetry: what the assistant DID with a message. Never what the trader wrote. No message text, names, prices or balances. Expires after 30 days.';

-- ── writing ────────────────────────────────────────────────────────────────

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
  p_provider_failure_code text
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
    fallback_used, fallback_reason, provider_failure_code)
  values (
    p_company_id, btrim(p_wa_message_id),
    left(p_model, 64), left(p_prompt_version, 48), left(p_tool_schema_version, 48),
    left(p_chosen_tool, 64), left(coalesce(nullif(btrim(p_semantic_intent), ''), 'unknown'), 48),
    p_tool_rounds, p_latency_ms,
    p_backend_outcome, left(p_rejection_code, 64), left(p_clarification_field, 48),
    coalesce(p_fallback_used, false), p_fallback_reason, left(p_provider_failure_code, 200))
  -- A redelivery updates the row rather than adding a second one, so counts
  -- stay honest.
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
    provider_failure_code = excluded.provider_failure_code;

  -- Retention, the same way whatsapp_ai_messages already does it: opportunistic
  -- cleanup inside the write, scoped to this company. No cron extension is
  -- installed on this project and Stage A is not the place to add one.
  delete from public.whatsapp_ai_interpretations
   where company_id = p_company_id and expires_at < now();
exception when others then
  -- Telemetry must never break a shop's message. If this row cannot be
  -- written, the trader still gets their answer.
  return;
end;
$fn$;

revoke all on function public.wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.wa_record_ai_interpretation(uuid, text, text, text, text, text, text, integer, integer, text, text, text, boolean, text, text)
  to service_role;
