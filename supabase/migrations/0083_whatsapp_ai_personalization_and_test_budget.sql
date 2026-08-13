-- Personalize the conversational assistant from the authoritative linked
-- profile, expose an exact quota reset timestamp, and modestly raise the
-- company-wide test allowance. The quota remains hard, tenant-scoped and UTC
-- day based.

create or replace function public.wa_resolve_context(p_identity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'identity_id', i.id,
    'profile_id', p.id,
    'profile_name', p.full_name,
    'company_id', c.id,
    'company_name', c.name,
    'role', m.role,
    'lang', coalesce(i.lang, p.lang, 'en'),
    'approval_flow_enabled', coalesce(c.approval_flow_enabled, false),
    'reversal_enabled', coalesce(c.reversal_enabled, false),
    'payouts_enabled', coalesce(c.payouts_enabled, false)
  )
  from public.whatsapp_identities i
  join public.profiles p
    on p.id = i.profile_id
   and p.deactivated_at is null
  join public.company_members m
    on m.profile_id = p.id
   and m.company_id = p.active_company_id
   and m.deactivated_at is null
  join public.companies c on c.id = m.company_id
  where i.id = p_identity_id
    and i.revoked_at is null
    and i.opted_out_at is null;
$$;

revoke execute on function public.wa_resolve_context(uuid) from public, anon, authenticated;
grant execute on function public.wa_resolve_context(uuid) to service_role;

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
  v_reset_at timestamptz := (
    date_trunc('day', clock_timestamp() at time zone 'utc') + interval '1 day'
  ) at time zone 'utc';
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
  v_cost := round((0.001 + (v_chars * 0.0000015))::numeric, 6);

  insert into public.whatsapp_ai_usage_daily (company_id, usage_day)
  values (p_company_id, v_day)
  on conflict (company_id, usage_day) do nothing;

  select * into v_row
    from public.whatsapp_ai_usage_daily
   where company_id = p_company_id and usage_day = v_day
   for update;

  v_allowed := v_row.fallback_count < 30
    and v_row.input_chars + v_chars <= 36000
    and v_row.estimated_cost + v_cost <= 0.150000;

  if not v_allowed then
    v_reason := case
      when v_row.fallback_count >= 30 then 'daily_request_limit'
      when v_row.input_chars + v_chars > 36000 then 'daily_character_limit'
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
end $$;

revoke execute on function public.consume_whatsapp_ai_budget(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_whatsapp_ai_budget(uuid, uuid, integer)
  to service_role;
