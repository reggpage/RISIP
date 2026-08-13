-- A2: hard budget guard for the AI fallback.
--
-- Deterministic parsing remains free. Only a validated, linked identity can
-- consume this quota, and the counter is company-wide so adding WhatsApp
-- identities cannot bypass the limit. The webhook uses the service role, so
-- this RPC validates the identity/company pair explicitly rather than relying
-- on auth.uid().
--
-- Limits per company per UTC day:
--   20 fallback requests
--   24,000 input characters
--   approximately USD 0.10 estimated model cost

create table if not exists public.whatsapp_ai_usage_daily (
  company_id       uuid not null references public.companies(id) on delete cascade,
  usage_day       date not null default (timezone('utc', clock_timestamp()))::date,
  fallback_count  integer not null default 0 check (fallback_count >= 0),
  input_chars     integer not null default 0 check (input_chars >= 0),
  estimated_cost  numeric(12,6) not null default 0 check (estimated_cost >= 0),
  blocked_count   integer not null default 0 check (blocked_count >= 0),
  updated_at      timestamptz not null default clock_timestamp(),
  primary key (company_id, usage_day)
);

create index if not exists whatsapp_ai_usage_daily_day_idx
  on public.whatsapp_ai_usage_daily (usage_day desc, company_id);

alter table public.whatsapp_ai_usage_daily enable row level security;
revoke all on table public.whatsapp_ai_usage_daily from public, anon, authenticated;

create or replace function public.consume_whatsapp_ai_budget(
  p_company_id uuid,
  p_identity_id uuid,
  p_input_chars integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_identity_company uuid;
  v_day date := (timezone('utc', clock_timestamp()))::date;
  v_chars integer;
  v_cost numeric(12,6);
  v_row public.whatsapp_ai_usage_daily%rowtype;
  v_allowed boolean;
  v_reason text := null;
begin
  if p_company_id is null or p_identity_id is null then
    raise exception 'AI budget scope is required' using errcode = 'P0001', hint = 'invalid_scope';
  end if;

  select company_id into v_identity_company
    from public.whatsapp_identities
   where id = p_identity_id
     and revoked_at is null;
  if v_identity_company is null or v_identity_company <> p_company_id then
    raise exception 'WhatsApp identity is not linked to this company'
      using errcode = 'P0001', hint = 'invalid_identity';
  end if;

  v_chars := greatest(1, least(coalesce(p_input_chars, 0), 1200));
  -- Conservative estimate: fixed request overhead plus input length. This is a
  -- guardrail, not a provider invoice, and intentionally errs on the safe side.
  v_cost := round((0.001 + (v_chars * 0.0000015))::numeric, 6);

  insert into public.whatsapp_ai_usage_daily (company_id, usage_day)
  values (p_company_id, v_day)
  on conflict (company_id, usage_day) do nothing;

  select * into v_row
    from public.whatsapp_ai_usage_daily
   where company_id = p_company_id and usage_day = v_day
   for update;

  v_allowed := v_row.fallback_count < 20
    and v_row.input_chars + v_chars <= 24000
    and v_row.estimated_cost + v_cost <= 0.100000;

  if not v_allowed then
    v_reason := case
      when v_row.fallback_count >= 20 then 'daily_request_limit'
      when v_row.input_chars + v_chars > 24000 then 'daily_character_limit'
      else 'daily_cost_limit'
    end;
    update public.whatsapp_ai_usage_daily
       set blocked_count = blocked_count + 1, updated_at = clock_timestamp()
     where company_id = p_company_id and usage_day = v_day;
    return jsonb_build_object(
      'allowed', false,
      'reason', v_reason,
      'fallback_count', v_row.fallback_count,
      'input_chars', v_row.input_chars,
      'estimated_cost', v_row.estimated_cost
    );
  end if;

  update public.whatsapp_ai_usage_daily
     set fallback_count = fallback_count + 1,
         input_chars = input_chars + v_chars,
         estimated_cost = estimated_cost + v_cost,
         updated_at = clock_timestamp()
   where company_id = p_company_id and usage_day = v_day;

  return jsonb_build_object(
    'allowed', true,
    'fallback_count', v_row.fallback_count + 1,
    'input_chars', v_row.input_chars + v_chars,
    'estimated_cost', v_row.estimated_cost + v_cost
  );
end $$;

revoke execute on function public.consume_whatsapp_ai_budget(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_whatsapp_ai_budget(uuid, uuid, integer)
  to service_role;
