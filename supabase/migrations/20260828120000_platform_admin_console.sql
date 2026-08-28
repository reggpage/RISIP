-- RISIP platform-admin console foundation.
-- This migration is deliberately separate from business roles and ledger access.
-- Apply after 0148_ai_cache_measurement.sql.
--
-- Bootstrap (trusted SQL session only):
-- insert into public.platform_admins (user_id, role, created_by)
-- select id, 'super_admin', id from auth.users
-- where email = 'operator@example.com'
-- on conflict (user_id) do update set role = excluded.role, active = true;

do $$
begin
  create type public.platform_admin_role as enum (
    'super_admin', 'operations', 'support', 'finance', 'read_only'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       public.platform_admin_role not null,
  active     boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_platform_controls (
  company_id         uuid primary key references public.companies(id) on delete cascade,
  platform_status    text not null default 'active' check (platform_status in ('active', 'suspended')),
  whatsapp_ai_enabled boolean not null default true,
  updated_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.platform_admin_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid,
  admin_role     public.platform_admin_role not null,
  action         text not null check (length(action) between 1 and 96),
  target_type    text not null check (length(target_type) between 1 and 64),
  target_id      uuid,
  reason         text not null check (length(reason) between 1 and 1000),
  before_metadata jsonb not null default '{}'::jsonb,
  after_metadata  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists platform_admin_audit_logs_time_idx
  on public.platform_admin_audit_logs (created_at desc);
create index if not exists platform_admin_audit_logs_target_idx
  on public.platform_admin_audit_logs (target_type, target_id, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.company_platform_controls enable row level security;
alter table public.platform_admin_audit_logs enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;
revoke all on public.company_platform_controls from public, anon, authenticated;
revoke all on public.platform_admin_audit_logs from public, anon, authenticated;

create or replace function private.platform_admin_role()
returns public.platform_admin_role
language sql stable security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select pa.role
  from public.platform_admins pa
  where pa.user_id = auth.uid()
    and pa.active = true
$$;

create or replace function private.require_platform_admin(p_action text)
returns public.platform_admin_role
language plpgsql stable security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  v_role public.platform_admin_role;
begin
  select private.platform_admin_role() into v_role;
  if v_role is null then
    raise exception 'platform admin access required' using errcode = '42501', hint = 'platform_admin_required';
  end if;
  if p_action = 'write_company'
     and v_role not in ('super_admin', 'operations') then
    raise exception 'company controls require operations access' using errcode = '42501', hint = 'platform_admin_write_denied';
  end if;
  if p_action = 'settings' and v_role <> 'super_admin' then
    raise exception 'platform settings require super admin access' using errcode = '42501', hint = 'platform_admin_settings_denied';
  end if;
  return v_role;
end $$;

create or replace function private.platform_admin_audit(
  p_role public.platform_admin_role,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.platform_admin_audit_logs (
    admin_user_id, admin_role, action, target_type, target_id, reason,
    before_metadata, after_metadata
  ) values (
    auth.uid(), p_role, left(p_action, 96), left(p_target_type, 64), p_target_id,
    left(btrim(p_reason), 1000), coalesce(p_before, '{}'::jsonb), coalesce(p_after, '{}'::jsonb)
  );
end $$;

create or replace function public.platform_admin_me()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_role public.platform_admin_role;
begin
  select private.platform_admin_role() into v_role;
  return jsonb_build_object('role', v_role);
end $$;

create or replace function public.platform_admin_overview(p_days integer default 14)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.platform_admin_role;
  v_start date := (timezone('utc', now()))::date - greatest(1, least(coalesce(p_days, 14), 90)) + 1;
  v_today date := (timezone('utc', now()))::date;
begin
  v_role := private.require_platform_admin('read');
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalCompanies', (select count(*) from public.companies),
      'activeCompanies', (select count(*) from public.companies c left join public.company_platform_controls pc on pc.company_id = c.id where coalesce(pc.platform_status, 'active') = 'active'),
      'totalMembers', (select count(*) from public.company_members m where m.deactivated_at is null),
      'activeWhatsappIdentities', (select count(*) from public.whatsapp_identities i where i.revoked_at is null),
      'messagesToday', (select count(*) from public.whatsapp_messages m where m.created_at >= v_today),
      'aiRequestsToday', (select coalesce(sum(u.fallback_count), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = v_today),
      'aiFailuresToday', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_today and (i.backend_outcome = 'provider_failed' or i.provider_failure_code is not null)),
      'aiP50LatencyMs', (select round(percentile_cont(0.50) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null),
      'aiP95LatencyMs', (select round(percentile_cont(0.95) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null),
      'companiesAtAiLimit', (select count(*) from public.whatsapp_ai_usage_daily u join public.companies c on c.id = u.company_id where u.usage_day = v_today and (u.blocked_count > 0 or u.fallback_count >= coalesce(c.ai_daily_request_limit, 30) or u.input_chars >= coalesce(c.ai_daily_char_limit, 36000) or u.estimated_cost >= coalesce(c.ai_daily_cost_limit, 0.150000))),
      'estimatedCostToday', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = v_today),
      'estimatedCostMonth', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day >= date_trunc('month', v_today)::date),
      'stalePendingMessages', (select count(*) from public.whatsapp_messages m where m.status in ('pending', 'processing') and m.created_at < now() - interval '15 minutes'),
      'failedMessagesToday', (select count(*) from public.whatsapp_messages m where m.status = 'failed' and m.created_at >= v_today)
    ),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'severity', x.severity, 'title', x.title, 'detail', x.detail, 'createdAt', x.created_at) order by x.created_at desc)
      from (
        select m.id::text, 'critical' as severity, 'WhatsApp message failed' as title,
               'A message failed in the worker pipeline.' as detail, m.created_at
        from public.whatsapp_messages m
        where m.status = 'failed'
        order by m.created_at desc limit 6
      ) x
    ), '[]'::jsonb),
    'trends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(g.day, 'YYYY-MM-DD'),
        'messages', (select count(*) from public.whatsapp_messages m where m.created_at >= g.day and m.created_at < g.day + 1),
        'aiRequests', (select coalesce(sum(u.fallback_count), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = g.day),
        'aiFailures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= g.day and i.created_at < g.day + 1 and (i.backend_outcome = 'provider_failed' or i.provider_failure_code is not null)),
        'cost', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day = g.day)
      ) order by g.day)
      from generate_series(v_start, v_today, interval '1 day') as g(day)
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.platform_admin_list_companies(p_search text default null)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  perform private.require_platform_admin('read');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'sector', c.sector, 'createdAt', c.created_at,
      'memberCount', (select count(*) from public.company_members m where m.company_id = c.id and m.deactivated_at is null),
      'whatsappIdentities', (select count(*) from public.whatsapp_identities i where i.company_id = c.id and i.revoked_at is null),
      'lastActivity', greatest(c.created_at, coalesce((select max(m.created_at) from public.whatsapp_messages m where m.company_id = c.id), c.created_at), coalesce((select max(i.created_at) from public.whatsapp_ai_interpretations i where i.company_id = c.id), c.created_at)),
      'platformStatus', coalesce(pc.platform_status, 'active'),
      'ai', jsonb_build_object(
        'today', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day = timezone('utc', now())::date), 0),
        'month', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= date_trunc('month', timezone('utc', now())::date)::date), 0),
        'dailyLimit', coalesce(c.ai_daily_request_limit, 30),
        'monthlyLimit', c.ai_monthly_request_limit,
        'charLimit', coalesce(c.ai_daily_char_limit, 36000),
        'costLimit', coalesce(c.ai_daily_cost_limit, 0.150000)
      )
    ) order by c.created_at desc)
    from public.companies c
    left join public.company_platform_controls pc on pc.company_id = c.id
    where p_search is null or btrim(p_search) = '' or c.name ilike '%' || left(btrim(p_search), 80) || '%'
  ), '[]'::jsonb);
end $$;

create or replace function public.platform_admin_company_detail(p_company_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  perform private.require_platform_admin('read');
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  return (
    select jsonb_build_object(
      'id', c.id, 'name', c.name, 'sector', c.sector, 'hqLocation', c.hq_location,
      'currency', c.currency, 'createdAt', c.created_at,
      'memberCount', (select count(*) from public.company_members m where m.company_id = c.id and m.deactivated_at is null),
      'ownerCount', (select count(*) from public.company_members m where m.company_id = c.id and m.role = 'owner' and m.deactivated_at is null),
      'whatsappIdentities', (select count(*) from public.whatsapp_identities i where i.company_id = c.id and i.revoked_at is null),
      'lastActivity', greatest(c.created_at, coalesce((select max(m.created_at) from public.whatsapp_messages m where m.company_id = c.id), c.created_at)),
      'platformStatus', coalesce(pc.platform_status, 'active'),
      'whatsappAiEnabled', coalesce(pc.whatsapp_ai_enabled, true),
      'ai', jsonb_build_object(
        'today', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day = timezone('utc', now())::date), 0),
        'month', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= date_trunc('month', timezone('utc', now())::date)::date), 0),
        'dailyLimit', coalesce(c.ai_daily_request_limit, 30),
        'monthlyLimit', c.ai_monthly_request_limit,
        'charLimit', coalesce(c.ai_daily_char_limit, 36000),
        'costLimit', coalesce(c.ai_daily_cost_limit, 0.150000)
      ),
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.profile_id, 'role', m.role, 'joinedAt', m.joined_at, 'deactivatedAt', m.deactivated_at) order by m.joined_at) from public.company_members m where m.company_id = c.id), '[]'::jsonb),
      'failures', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', 'whatsapp_message', 'status', m.status, 'code', left(m.last_error, 120), 'createdAt', m.created_at) order by m.created_at desc) from public.whatsapp_messages m where m.company_id = c.id and m.status = 'failed' limit 20), '[]'::jsonb)
    )
    from public.companies c left join public.company_platform_controls pc on pc.company_id = c.id
    where c.id = p_company_id
  );
end $$;

create or replace function public.platform_admin_whatsapp_ops(p_days integer default 7)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'incoming', (select count(*) from public.whatsapp_messages m where m.created_at >= v_start),
      'completed', (select count(*) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'done'),
      'failed', (select count(*) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'failed'),
      'stalePending', (select count(*) from public.whatsapp_messages m where m.status in ('pending', 'processing') and m.created_at < now() - interval '15 minutes'),
      'retries', (select coalesce(sum(m.retry_count), 0) from public.whatsapp_messages m where m.created_at >= v_start),
      'p50LatencyMs', (select round(percentile_cont(0.50) within group (order by extract(epoch from (m.processed_at - m.created_at)) * 1000) ) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'done' and m.processed_at is not null),
      'p95LatencyMs', (select round(percentile_cont(0.95) within group (order by extract(epoch from (m.processed_at - m.created_at)) * 1000) ) from public.whatsapp_messages m where m.created_at >= v_start and m.status = 'done' and m.processed_at is not null)
    ),
    'routes', coalesce((select jsonb_agg(jsonb_build_object('route', coalesce(i.route, 'unclassified'), 'count', i.count) order by i.count desc) from (select route, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by route) i), '[]'::jsonb),
    'failures', coalesce((select jsonb_agg(jsonb_build_object('code', coalesce(i.provider_failure_code, 'worker_failed'), 'count', i.count) order by i.count desc) from (select provider_failure_code, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start and (provider_failure_code is not null or backend_outcome = 'provider_failed') group by provider_failure_code) i), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'companyName', c.name, 'status', m.status, 'retryCount', m.retry_count, 'route', i.route, 'createdAt', m.created_at, 'processedAt', m.processed_at) order by m.created_at desc) from public.whatsapp_messages m left join public.companies c on c.id = m.company_id left join public.whatsapp_ai_interpretations i on i.wa_message_id = m.wa_message_id where m.created_at >= v_start limit 50), '[]'::jsonb)
  );
end $$;

create or replace function public.platform_admin_ai_ops(p_days integer default 30)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 180)));
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'requests', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start),
      'estimatedCost', (select coalesce(sum(u.estimated_cost), 0) from public.whatsapp_ai_usage_daily u where u.usage_day >= v_start::date),
      'failures', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and (i.backend_outcome = 'provider_failed' or i.provider_failure_code is not null)),
      'clarifications', (select count(*) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.backend_outcome = 'clarified'),
      'p50LatencyMs', (select round(percentile_cont(0.50) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null),
      'p95LatencyMs', (select round(percentile_cont(0.95) within group (order by i.latency_ms)) from public.whatsapp_ai_interpretations i where i.created_at >= v_start and i.latency_ms is not null)
    ),
    'intents', coalesce((select jsonb_agg(jsonb_build_object('intent', i.semantic_intent, 'count', i.count) order by i.count desc) from (select semantic_intent, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by semantic_intent) i), '[]'::jsonb),
    'tools', coalesce((select jsonb_agg(jsonb_build_object('tool', coalesce(i.chosen_tool, 'none'), 'count', i.count) order by i.count desc) from (select chosen_tool, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by chosen_tool) i), '[]'::jsonb),
    'models', coalesce((select jsonb_agg(jsonb_build_object('model', coalesce(i.model, 'unknown'), 'promptVersion', i.prompt_version, 'toolSchemaVersion', i.tool_schema_version, 'count', i.count) order by i.count desc) from (select model, prompt_version, tool_schema_version, count(*) from public.whatsapp_ai_interpretations where created_at >= v_start group by model, prompt_version, tool_schema_version) i), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'usedToday', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day = timezone('utc', now())::date), 0), 'dailyLimit', coalesce(c.ai_daily_request_limit, 30), 'usedMonth', coalesce((select sum(u.fallback_count) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= date_trunc('month', timezone('utc', now())::date)::date), 0), 'monthlyLimit', c.ai_monthly_request_limit, 'estimatedCost', coalesce((select sum(u.estimated_cost) from public.whatsapp_ai_usage_daily u where u.company_id = c.id and u.usage_day >= v_start::date), 0)) order by c.name) from public.companies c), '[]'::jsonb)
  );
end $$;

create or replace function public.platform_admin_settings()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'defaults', jsonb_build_object('dailyRequests', 30, 'dailyCharacters', 36000, 'dailyCostUsd', 0.150000, 'monthlyRequests', null),
    'featureFlags', '[]'::jsonb
  );
end $$;

create or replace function public.platform_admin_set_company_status(p_company_id uuid, p_status text, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if p_status not in ('active', 'suspended') or nullif(btrim(p_reason), '') is null then
    raise exception 'valid status and reason are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company not found' using errcode = 'P0002'; end if;
  select jsonb_build_object('platformStatus', coalesce(platform_status, 'active')) into v_before from public.company_platform_controls where company_id = p_company_id;
  v_before := coalesce(v_before, jsonb_build_object('platformStatus', 'active'));
  insert into public.company_platform_controls (company_id, platform_status, updated_by, updated_at)
  values (p_company_id, p_status, auth.uid(), now())
  on conflict (company_id) do update set platform_status = excluded.platform_status, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  v_after := jsonb_build_object('platformStatus', p_status);
  perform private.platform_admin_audit(v_role, 'set_company_status', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;

create or replace function public.platform_admin_set_whatsapp_ai(p_company_id uuid, p_enabled boolean, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if p_enabled is null or nullif(btrim(p_reason), '') is null then raise exception 'enabled and reason are required' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company not found' using errcode = 'P0002'; end if;
  select jsonb_build_object('whatsappAiEnabled', whatsapp_ai_enabled) into v_before from public.company_platform_controls where company_id = p_company_id;
  v_before := coalesce(v_before, jsonb_build_object('whatsappAiEnabled', true));
  insert into public.company_platform_controls (company_id, whatsapp_ai_enabled, updated_by, updated_at)
  values (p_company_id, p_enabled, auth.uid(), now())
  on conflict (company_id) do update set whatsapp_ai_enabled = excluded.whatsapp_ai_enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  v_after := jsonb_build_object('whatsappAiEnabled', p_enabled);
  perform private.platform_admin_audit(v_role, 'set_whatsapp_ai', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;

create or replace function public.platform_admin_set_company_ai_limits(
  p_company_id uuid, p_daily_request_limit integer, p_daily_char_limit integer,
  p_daily_cost_limit numeric, p_monthly_request_limit integer, p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if nullif(btrim(p_reason), '') is null
     or p_daily_request_limit < 0 or p_daily_char_limit < 0
     or p_daily_cost_limit < 0 or p_monthly_request_limit < 0 then
    raise exception 'valid non-negative limits and reason are required' using errcode = '22023';
  end if;
  select jsonb_build_object('dailyRequests', ai_daily_request_limit, 'dailyCharacters', ai_daily_char_limit, 'dailyCostUsd', ai_daily_cost_limit, 'monthlyRequests', ai_monthly_request_limit) into v_before from public.companies where id = p_company_id;
  if v_before is null then raise exception 'company not found' using errcode = 'P0002'; end if;
  update public.companies set ai_daily_request_limit = p_daily_request_limit, ai_daily_char_limit = p_daily_char_limit, ai_daily_cost_limit = p_daily_cost_limit, ai_monthly_request_limit = p_monthly_request_limit where id = p_company_id;
  v_after := jsonb_build_object('dailyRequests', p_daily_request_limit, 'dailyCharacters', p_daily_char_limit, 'dailyCostUsd', p_daily_cost_limit, 'monthlyRequests', p_monthly_request_limit);
  perform private.platform_admin_audit(v_role, 'set_company_ai_limits', 'company', p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;

create or replace function public.platform_admin_reset_company_ai_limits(p_company_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_role public.platform_admin_role; v_before jsonb;
begin
  perform private.require_platform_admin('write_company');
  if nullif(btrim(p_reason), '') is null then raise exception 'reason is required' using errcode = '22023'; end if;
  select jsonb_build_object('dailyRequests', ai_daily_request_limit, 'dailyCharacters', ai_daily_char_limit, 'dailyCostUsd', ai_daily_cost_limit, 'monthlyRequests', ai_monthly_request_limit) into v_before from public.companies where id = p_company_id;
  if v_before is null then raise exception 'company not found' using errcode = 'P0002'; end if;
  update public.companies set ai_daily_request_limit = null, ai_daily_char_limit = null, ai_daily_cost_limit = null, ai_monthly_request_limit = null where id = p_company_id;
  perform private.platform_admin_audit(private.platform_admin_role(), 'reset_company_ai_limits', 'company', p_company_id, p_reason, v_before, jsonb_build_object('dailyRequests', 30, 'dailyCharacters', 36000, 'dailyCostUsd', 0.150000, 'monthlyRequests', null));
  return jsonb_build_object('reset', true);
end $$;

revoke all on function public.platform_admin_me() from public, anon;
revoke all on function public.platform_admin_overview(integer) from public, anon;
revoke all on function public.platform_admin_list_companies(text) from public, anon;
revoke all on function public.platform_admin_company_detail(uuid) from public, anon;
revoke all on function public.platform_admin_whatsapp_ops(integer) from public, anon;
revoke all on function public.platform_admin_ai_ops(integer) from public, anon;
revoke all on function public.platform_admin_settings() from public, anon;
revoke all on function public.platform_admin_set_company_status(uuid, text, text) from public, anon;
revoke all on function public.platform_admin_set_whatsapp_ai(uuid, boolean, text) from public, anon;
revoke all on function public.platform_admin_set_company_ai_limits(uuid, integer, integer, numeric, integer, text) from public, anon;
revoke all on function public.platform_admin_reset_company_ai_limits(uuid, text) from public, anon;

grant execute on function public.platform_admin_me() to authenticated;
grant execute on function public.platform_admin_overview(integer) to authenticated;
grant execute on function public.platform_admin_list_companies(text) to authenticated;
grant execute on function public.platform_admin_company_detail(uuid) to authenticated;
grant execute on function public.platform_admin_whatsapp_ops(integer) to authenticated;
grant execute on function public.platform_admin_ai_ops(integer) to authenticated;
grant execute on function public.platform_admin_settings() to authenticated;
grant execute on function public.platform_admin_set_company_status(uuid, text, text) to authenticated;
grant execute on function public.platform_admin_set_whatsapp_ai(uuid, boolean, text) to authenticated;
grant execute on function public.platform_admin_set_company_ai_limits(uuid, integer, integer, numeric, integer, text) to authenticated;
grant execute on function public.platform_admin_reset_company_ai_limits(uuid, text) to authenticated;

comment on table public.platform_admins is 'Platform authority only; not part of RISIP business user_role.';
comment on table public.company_platform_controls is 'Platform operations state kept separate from tenant business truth.';
comment on table public.platform_admin_audit_logs is 'Append-only audit trail for privileged platform-admin actions; no merchant content or secrets.';
