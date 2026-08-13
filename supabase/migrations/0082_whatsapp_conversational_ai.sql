-- Risip conversational AI memory and server-derived WhatsApp context.
--
-- Financial records are deliberately untouched.  These tables contain only a
-- short, service-role-only conversation window.  The active company and role
-- are resolved in Postgres from profiles.active_company_id + company_members;
-- the webhook must never trust the legacy company_id on whatsapp_identities.

create table if not exists public.whatsapp_ai_threads (
  identity_id uuid not null references public.whatsapp_identities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  topic text,
  entities jsonb not null default '{}'::jsonb,
  last_tool text,
  expires_at timestamptz not null default clock_timestamp() + interval '24 hours',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (identity_id, company_id),
  check (topic is null or char_length(topic) <= 100),
  check (last_tool is null or char_length(last_tool) <= 100),
  check (jsonb_typeof(entities) = 'object')
);

create table if not exists public.whatsapp_ai_messages (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.whatsapp_identities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  wa_message_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '7 days',
  unique (wa_message_id, role),
  check (char_length(wa_message_id) between 1 and 255),
  check (char_length(content) between 1 and 4000)
);

create index if not exists whatsapp_ai_messages_context_idx
  on public.whatsapp_ai_messages (identity_id, company_id, created_at desc);
create index if not exists whatsapp_ai_messages_expiry_idx
  on public.whatsapp_ai_messages (expires_at);

alter table public.whatsapp_ai_threads enable row level security;
alter table public.whatsapp_ai_messages enable row level security;
revoke all on table public.whatsapp_ai_threads from public, anon, authenticated;
revoke all on table public.whatsapp_ai_messages from public, anon, authenticated;

-- One authoritative context resolver for text, images, reads and writes.
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

-- Store a visible user/assistant exchange atomically.  Tool traces and hidden
-- reasoning are not retained.  Duplicate Meta deliveries collide on
-- (wa_message_id, role), matching the webhook idempotency boundary.
create or replace function public.wa_store_ai_exchange(
  p_identity_id uuid,
  p_company_id uuid,
  p_wa_message_id text,
  p_user_text text,
  p_assistant_text text,
  p_topic text default null,
  p_entities jsonb default '{}'::jsonb,
  p_last_tool text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_context jsonb;
  v_profile_id uuid;
begin
  v_context := public.wa_resolve_context(p_identity_id);
  if v_context is null
     or (v_context ->> 'company_id')::uuid <> p_company_id then
    raise exception 'WhatsApp context is not active in this company'
      using errcode = 'P0001', hint = 'invalid_scope';
  end if;
  if coalesce(char_length(btrim(p_wa_message_id)), 0) = 0
     or coalesce(char_length(btrim(p_user_text)), 0) = 0
     or coalesce(char_length(btrim(p_assistant_text)), 0) = 0 then
    raise exception 'conversation exchange is incomplete'
      using errcode = 'P0001', hint = 'invalid_exchange';
  end if;
  if jsonb_typeof(coalesce(p_entities, '{}'::jsonb)) <> 'object' then
    raise exception 'conversation entities must be an object'
      using errcode = 'P0001', hint = 'invalid_entities';
  end if;

  v_profile_id := (v_context ->> 'profile_id')::uuid;

  insert into public.whatsapp_ai_messages
    (identity_id, company_id, profile_id, wa_message_id, role, content)
  values
    (p_identity_id, p_company_id, v_profile_id, left(btrim(p_wa_message_id), 255),
     'user', left(btrim(p_user_text), 4000))
  on conflict (wa_message_id, role) do nothing;

  insert into public.whatsapp_ai_messages
    (identity_id, company_id, profile_id, wa_message_id, role, content)
  values
    (p_identity_id, p_company_id, v_profile_id, left(btrim(p_wa_message_id), 255),
     'assistant', left(btrim(p_assistant_text), 4000))
  on conflict (wa_message_id, role) do nothing;

  insert into public.whatsapp_ai_threads
    (identity_id, company_id, profile_id, topic, entities, last_tool, expires_at, updated_at)
  values
    (p_identity_id, p_company_id, v_profile_id, nullif(left(btrim(p_topic), 100), ''),
     coalesce(p_entities, '{}'::jsonb), nullif(left(btrim(p_last_tool), 100), ''),
     clock_timestamp() + interval '24 hours', clock_timestamp())
  on conflict (identity_id, company_id) do update
    set profile_id = excluded.profile_id,
        topic = coalesce(excluded.topic, public.whatsapp_ai_threads.topic),
        entities = case when excluded.entities = '{}'::jsonb
          then public.whatsapp_ai_threads.entities else excluded.entities end,
        last_tool = coalesce(excluded.last_tool, public.whatsapp_ai_threads.last_tool),
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;

  delete from public.whatsapp_ai_messages m
   where m.identity_id = p_identity_id
     and m.company_id = p_company_id
     and (m.expires_at < clock_timestamp()
       or m.id not in (
         select k.id
           from public.whatsapp_ai_messages k
          where k.identity_id = p_identity_id
            and k.company_id = p_company_id
            and k.expires_at >= clock_timestamp()
          order by k.created_at desc, k.id desc
          limit 24
       ));

  return true;
end $$;

revoke execute on function public.wa_store_ai_exchange(uuid, uuid, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.wa_store_ai_exchange(uuid, uuid, text, text, text, text, jsonb, text)
  to service_role;

create or replace function public.wa_clear_ai_context(
  p_identity_id uuid,
  p_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_context jsonb;
begin
  v_context := public.wa_resolve_context(p_identity_id);
  if v_context is null
     or (v_context ->> 'company_id')::uuid <> p_company_id then
    raise exception 'WhatsApp context is not active in this company'
      using errcode = 'P0001', hint = 'invalid_scope';
  end if;
  delete from public.whatsapp_ai_messages
   where identity_id = p_identity_id and company_id = p_company_id;
  delete from public.whatsapp_ai_threads
   where identity_id = p_identity_id and company_id = p_company_id;
  return true;
end $$;

revoke execute on function public.wa_clear_ai_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wa_clear_ai_context(uuid, uuid) to service_role;
