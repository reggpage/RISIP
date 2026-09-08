-- Web is another transport. Identities may exist before a phone is linked.
-- Existing protected RPCs resolve p_phone against this legacy address column.
-- A reserved web:<profile UUID> address keeps every one of those same tools usable.
-- It is not an E.164 number and verified_at stays NULL until actual phone linking.
alter table public.whatsapp_identities alter column phone_e164 drop not null;
alter table public.whatsapp_identities alter column verified_at drop not null;
alter table public.whatsapp_messages add column chat_identity_id uuid references public.whatsapp_identities(id);
alter table public.whatsapp_messages add column transport text not null default 'whatsapp' check (transport in ('whatsapp', 'web'));
alter table public.whatsapp_messages add column input_text text;
alter table public.whatsapp_conversations add column chat_day date not null default (now() at time zone 'Africa/Dar_es_Salaam')::date;
update public.whatsapp_conversations set chat_day = (updated_at at time zone 'Africa/Dar_es_Salaam')::date;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.whatsapp_identities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  wa_message_id text not null references public.whatsapp_messages(wa_message_id) on delete cascade,
  ordinal integer not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  chat_day date not null,
  tools text[] not null default '{}',
  awaiting text,
  created_at timestamptz not null default clock_timestamp(),
  unique (wa_message_id, ordinal)
);
create index chat_messages_day_idx on public.chat_messages(identity_id, company_id, chat_day, created_at);
create index whatsapp_messages_identity_queue_idx on public.whatsapp_messages(chat_identity_id, created_at) where status in ('pending', 'processing');
alter table public.chat_messages enable row level security;
create policy chat_messages_self_read on public.chat_messages for select to authenticated using (
  exists (select 1 from public.whatsapp_identities i join public.company_members m on m.profile_id = i.profile_id
    join public.profiles p on p.id = i.profile_id
    where i.id = identity_id and i.profile_id = auth.uid() and i.revoked_at is null
    and p.deactivated_at is null and m.company_id = chat_messages.company_id and m.deactivated_at is null)
);
revoke all on public.chat_messages from public, anon, authenticated;
grant select on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;

-- Import the history that actually exists. Do not invent older conversations.
insert into public.chat_messages(identity_id,company_id,wa_message_id,ordinal,role,content,chat_day,created_at)
select a.identity_id,a.company_id,a.wa_message_id,
  (row_number() over(partition by a.wa_message_id order by a.created_at,a.role desc)-1)::integer,
  a.role,replace(a.content,chr(8212),','),(a.created_at at time zone 'Africa/Dar_es_Salaam')::date,a.created_at
from public.whatsapp_ai_messages a join public.whatsapp_messages w on w.wa_message_id=a.wa_message_id
where a.role in ('user','assistant');

create function public.ensure_chat_identity() returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_company uuid;
begin
  select active_company_id into v_company from public.profiles where id = auth.uid() and deactivated_at is null for update;
  if v_company is null or not exists (select 1 from public.company_members where profile_id = auth.uid() and company_id = v_company and deactivated_at is null) then
    raise exception 'inactive_membership';
  end if;
  select id into v_id from public.whatsapp_identities where profile_id = auth.uid() and revoked_at is null;
  if v_id is null then
    insert into public.whatsapp_identities(profile_id, company_id, phone_e164, verified_at)
      values (auth.uid(), v_company, 'web:' || auth.uid()::text, null) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.ensure_chat_identity() from public, anon;
grant execute on function public.ensure_chat_identity() to authenticated;

create function public.guard_web_identity_notifications() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.verified_at is null then
    new.daily_summary_opted_in_at := null;
    new.debt_reminders_opted_in_at := null;
    new.proactive_notifications_opted_out_at := now();
  end if;
  return new;
end $$;
create trigger guard_web_identity_notifications before insert or update on public.whatsapp_identities for each row execute function public.guard_web_identity_notifications();

-- Keep a pending question's original date through upserts and midnight.
create function public.keep_chat_question_day() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.company_id = new.company_id and old.expires_at > now() then new.chat_day := old.chat_day;
  else new.chat_day := (now() at time zone 'Africa/Dar_es_Salaam')::date; end if;
  return new;
end $$;
create trigger keep_chat_question_day before update on public.whatsapp_conversations for each row execute function public.keep_chat_question_day();

-- The same source and monthly window as billing_refresh_usage, counted live.
-- Allowance is deliberately soft, exactly as on WhatsApp.
create function public.chat_usage_now() returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('messages_used', (select count(*) from public.whatsapp_messages m
    where m.company_id = s.company_id and m.created_at >= w.window_start::timestamptz and m.created_at < (w.window_end + 1)::timestamptz),
    'allowance', p.message_allowance, 'period_end', w.window_end)
  from public.subscriptions s join public.billing_plans p on p.code = s.plan
  cross join lateral public.billing_usage_window(s.current_period_start, s.current_period_end) w
  where s.company_id = private.auth_company_id() and s.status in ('trialing','active','past_due','suspended') limit 1;
$$;
revoke all on function public.chat_usage_now() from public, anon;
grant execute on function public.chat_usage_now() to authenticated;

create function public.chat_days(p_company uuid) returns table(chat_day date)
language sql stable security invoker set search_path = pg_catalog, public as $$
  select distinct m.chat_day from public.chat_messages m where company_id = p_company order by m.chat_day desc;
$$;
revoke all on function public.chat_days(uuid) from public, anon;
grant execute on function public.chat_days(uuid) to authenticated;

create function public.chat_pending(p_company uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('day', c.chat_day, 'awaiting', coalesce(c.options->>'kind', c.awaiting),
    'message_id', (select id from public.chat_messages m where m.identity_id = i.id and m.company_id = p_company and m.role = 'assistant' order by created_at desc limit 1))
  from public.whatsapp_conversations c join public.whatsapp_identities i on i.id = c.identity_id
  where i.profile_id = auth.uid() and i.revoked_at is null and c.company_id = p_company and c.expires_at > now()
    and exists (select 1 from public.company_members where profile_id = auth.uid() and company_id = p_company and deactivated_at is null);
$$;
revoke all on function public.chat_pending(uuid) from public, anon;
grant execute on function public.chat_pending(uuid) to authenticated;

-- Changing business cannot invalidate the scope of a turn already executing.
-- A pending draft also stays in its business until explicitly completed/cancelled.
create function public.guard_chat_business_switch() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  if old.active_company_id is not distinct from new.active_company_id then return new; end if;
  select id into v_id from public.whatsapp_identities where profile_id = old.id and revoked_at is null;
  if exists (select 1 from public.whatsapp_turn_locks where phone_e164 = 'identity:' || v_id::text and lease_until > clock_timestamp())
    and current_setting('risip.allow_turn_switch', true) is distinct from 'yes' then raise exception 'chat_busy'; end if;
  if exists (select 1 from public.whatsapp_conversations where identity_id = v_id and awaiting <> 'business' and expires_at > now()) then raise exception 'chat_pending'; end if;
  return new;
end $$;
create trigger guard_chat_business_switch before update of active_company_id on public.profiles for each row execute function public.guard_chat_business_switch();

-- The existing WhatsApp switch executes inside its own lease.
create or replace function public.wa_switch_active_company(p_phone text, p_company uuid) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_profile uuid; v_name text;
begin
  select profile_id into v_profile from public.whatsapp_identities where phone_e164 = p_phone and revoked_at is null;
  select c.name into v_name from public.company_members m join public.companies c on c.id = m.company_id
    where m.profile_id = v_profile and m.company_id = p_company and m.deactivated_at is null;
  if v_name is null then raise exception 'not_a_member'; end if;
  perform set_config('risip.allow_turn_switch', 'yes', true);
  update public.profiles set active_company_id = p_company where id = v_profile;
  return v_name;
end $$;
revoke all on function public.wa_switch_active_company(text, uuid) from public, anon, authenticated;
grant execute on function public.wa_switch_active_company(text, uuid) to service_role;

-- Link a verified number onto the same identity. Never discard a laptop draft.
create function public.chat_link_phone(p_token_hash text, p_phone text, p_wa_id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.whatsapp_link_tokens%rowtype; i public.whatsapp_identities%rowtype; v_company uuid;
begin
  select * into t from public.whatsapp_link_tokens where token_hash = p_token_hash for update;
  if t.id is null or t.used_at is not null or t.revoked_at is not null or t.expires_at <= now() or t.attempts >= 5 then raise exception 'invalid_token'; end if;
  select active_company_id into v_company from public.profiles where id = t.profile_id and deactivated_at is null for update;
  if v_company is null then raise exception 'inactive_profile'; end if;
  select * into i from public.whatsapp_identities where profile_id = t.profile_id and revoked_at is null for update;
  if i.id is not null and i.phone_e164 is distinct from p_phone and exists (
    select 1 from public.whatsapp_turn_locks where phone_e164 = 'identity:' || i.id::text and lease_until > clock_timestamp()
  ) then raise exception 'chat_busy'; end if;
  if i.id is null then
    insert into public.whatsapp_identities(profile_id,company_id,phone_e164,wa_id) values(t.profile_id,v_company,p_phone,p_wa_id) returning * into i;
  else
    update public.whatsapp_identities set phone_e164=p_phone,wa_id=p_wa_id,verified_at=now(),updated_at=now() where id=i.id;
  end if;
  update public.whatsapp_link_tokens set used_at=now() where id=t.id;
  return jsonb_build_object('id',i.id,'has_conversation',exists(select 1 from public.whatsapp_conversations where identity_id=i.id and expires_at > now()));
end $$;
revoke all on function public.chat_link_phone(text,text,text) from public, anon, authenticated;
grant execute on function public.chat_link_phone(text,text,text) to service_role;

-- Take the profile row lock while acquiring a lease as well as while switching.
-- That closes the read-check-update race between the two RPCs.
create or replace function public.wa_try_acquire_whatsapp_turn(p_phone text, p_owner_token uuid, p_lease_seconds integer default 300) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_acquired boolean;
begin
  if p_phone like 'identity:%' then
    perform 1 from public.profiles p join public.whatsapp_identities i on i.profile_id=p.id where i.id::text=substring(p_phone from 10) for update of p;
  end if;
  insert into public.whatsapp_turn_locks(phone_e164,owner_token,lease_until)
    values(p_phone,p_owner_token,clock_timestamp()+(greatest(30,least(600,p_lease_seconds)) || ' seconds')::interval)
  on conflict(phone_e164) do update set owner_token=excluded.owner_token,lease_until=excluded.lease_until,updated_at=clock_timestamp()
    where public.whatsapp_turn_locks.lease_until <= clock_timestamp() or public.whatsapp_turn_locks.owner_token=p_owner_token
  returning true into v_acquired;
  return coalesce(v_acquired,false);
end $$;
