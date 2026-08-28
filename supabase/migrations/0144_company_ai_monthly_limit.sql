-- A MONTHLY ceiling, because the subscription is monthly and the cost is not.
--
-- The daily caps in 0116 exist to stop a runaway loop spending real money in an
-- afternoon. They do not protect the price. A shop can sit under every daily
-- limit and still cost more in a month than it pays: at the measured $0.012 a
-- message, a 28,000 TZS subscription is break-even at about 873 messages, and
-- the daily cap of 30 allows 900.
--
-- NULL means no monthly ceiling, so this migration changes nothing for anyone
-- until a number is set. Same posture as 0116: ship the mechanism, set the
-- number when the price is decided.
--
-- Counted from whatsapp_ai_usage_daily, which already carries one row per
-- company per UTC day. No new table, no second place for the truth to live.

alter table public.companies
  add column if not exists ai_monthly_request_limit integer;

comment on column public.companies.ai_monthly_request_limit is
  'Monthly WhatsApp AI request ceiling, counted over the UTC calendar month. '
  'NULL means no monthly ceiling. The daily limits in 0116 still apply.';

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
  v_month_start date := date_trunc('month', (timezone('utc', clock_timestamp()))::date)::date;
  v_month_reset timestamptz := (
    date_trunc('month', clock_timestamp() at time zone 'utc') + interval '1 month'
  ) at time zone 'utc';
  v_chars integer;
  v_cost numeric(12,6);
  v_row public.whatsapp_ai_usage_daily%rowtype;
  v_allowed boolean;
  v_reason text := null;
  v_max_requests integer;
  v_max_chars integer;
  v_max_cost numeric(12,6);
  v_max_month integer;
  v_month_used integer;
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
         coalesce(c.ai_daily_cost_limit, 0.150000),
         c.ai_monthly_request_limit
    into v_max_requests, v_max_chars, v_max_cost, v_max_month
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

  -- The month so far, this row included. Only read when a ceiling exists, so
  -- the common path is exactly the query it was before.
  if v_max_month is not null then
    select coalesce(sum(u.fallback_count), 0)
      into v_month_used
      from public.whatsapp_ai_usage_daily u
     where u.company_id = p_company_id
       and u.usage_day >= v_month_start;
  end if;

  v_allowed := v_row.fallback_count < v_max_requests
    and v_row.input_chars + v_chars <= v_max_chars
    and v_row.estimated_cost + v_cost <= v_max_cost
    and (v_max_month is null or v_month_used < v_max_month);

  if not v_allowed then
    -- The MONTHLY reason is decided first. A shop that has spent its month is
    -- told that, not "come back tomorrow" — tomorrow will refuse it too, and
    -- being sent back into the same wall is worse than being told the truth.
    v_reason := case
      when v_max_month is not null and v_month_used >= v_max_month then 'monthly_request_limit'
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
      'reset_at', case when v_reason = 'monthly_request_limit' then v_month_reset else v_reset_at end,
      'fallback_count', v_row.fallback_count,
      'input_chars', v_row.input_chars,
      'estimated_cost', v_row.estimated_cost,
      'month_used', v_month_used,
      'month_limit', v_max_month
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
    'estimated_cost', v_row.estimated_cost + v_cost,
    'month_used', case when v_max_month is null then null else v_month_used + 1 end,
    'month_limit', v_max_month
  );
end $function$;
