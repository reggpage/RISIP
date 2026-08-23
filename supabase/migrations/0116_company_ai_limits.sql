-- Per-company AI limits, so a shop that is being TESTED is not rationed like a
-- shop that is being used.
--
-- The caps were three constants buried in a function body: 30 requests, 36,000
-- characters and $0.15 a day, per company. They exist for a good reason — a
-- runaway loop on somebody else's number should not be able to spend real money
-- — but they could only be changed by editing and redeploying SQL, and the
-- owner hit the request cap four times in one afternoon of testing.
--
-- Now each company may carry its own ceiling. NULL means "use the default", so
-- every existing company keeps exactly the limits it had, and raising one
-- shop's ceiling is an UPDATE rather than a migration.
--
-- The defaults stay where they were. Nothing here loosens anything by itself.

alter table public.companies
  add column if not exists ai_daily_request_limit integer,
  add column if not exists ai_daily_char_limit integer,
  add column if not exists ai_daily_cost_limit numeric(12, 6);

comment on column public.companies.ai_daily_request_limit is
  'Daily WhatsApp AI request ceiling. NULL uses the platform default (30).';
comment on column public.companies.ai_daily_char_limit is
  'Daily WhatsApp AI input-character ceiling. NULL uses the platform default (36000).';
comment on column public.companies.ai_daily_cost_limit is
  'Daily WhatsApp AI estimated-cost ceiling in USD. NULL uses the platform default (0.15).';

create or replace function public.consume_whatsapp_ai_budget(
  p_company_id uuid,
  p_identity_id uuid,
  p_input_chars integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_identity_company uuid;
  v_day date := (timezone('utc', clock_timestamp()))::date;
  v_reset_at timestamptz := (
    date_trunc('day', clock_timestamp() at time zone 'utc') + interval '1 day'
  ) at time zone 'utc';
  v_chars integer;
  v_cost numeric(12,6);
  v_row public.whatsapp_ai_usage_daily%rowtype;
  v_allowed boolean;
  v_reason text := null;
  v_max_requests integer;
  v_max_chars integer;
  v_max_cost numeric(12,6);
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

  -- The company's own ceiling where it has one, the platform default where it
  -- does not. Read once, under the same statement as the usage row.
  select coalesce(c.ai_daily_request_limit, 30),
         coalesce(c.ai_daily_char_limit, 36000),
         coalesce(c.ai_daily_cost_limit, 0.150000)
    into v_max_requests, v_max_chars, v_max_cost
    from public.companies c
   where c.id = p_company_id;
  v_max_requests := coalesce(v_max_requests, 30);
  v_max_chars := coalesce(v_max_chars, 36000);
  v_max_cost := coalesce(v_max_cost, 0.150000);

  v_chars := greatest(1, least(coalesce(p_input_chars, 0), 1200));
  v_cost := round((0.001 + (v_chars * 0.0000015))::numeric, 6);

  insert into public.whatsapp_ai_usage_daily (company_id, usage_day)
  values (p_company_id, v_day)
  on conflict (company_id, usage_day) do nothing;

  select * into v_row
    from public.whatsapp_ai_usage_daily
   where company_id = p_company_id and usage_day = v_day
   for update;

  v_allowed := v_row.fallback_count < v_max_requests
    and v_row.input_chars + v_chars <= v_max_chars
    and v_row.estimated_cost + v_cost <= v_max_cost;

  if not v_allowed then
    v_reason := case
      when v_row.fallback_count >= v_max_requests then 'daily_request_limit'
      when v_row.input_chars + v_chars > v_max_chars then 'daily_character_limit'
      else 'daily_cost_limit'
    end;
    update public.whatsapp_ai_usage_daily
       set blocked_count = blocked_count + 1, updated_at = clock_timestamp()
     where company_id = p_company_id and usage_day = v_day;
    return jsonb_build_object(
      'allowed', false,
      'reason', v_reason,
      'reset_at', v_reset_at,
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
    'reset_at', v_reset_at,
    'fallback_count', v_row.fallback_count + 1,
    'input_chars', v_row.input_chars + v_chars,
    'estimated_cost', v_row.estimated_cost + v_cost
  );
end $function$;
