-- P2.2 WhatsApp bridge for the P2.1 daily-record RPCs.
--
-- The webhook uses service_role, so auth.uid() would otherwise be null. These
-- narrow SECURITY DEFINER bridges validate the profile's active membership and
-- temporarily provide the same JWT subject to the already-hardened RPCs. They
-- do not change any receipt or finance-control table.

create or replace function public.wa_create_daily_record_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_kind text,
  p_amount numeric,
  p_party_name text default null,
  p_description text default null,
  p_occurred_at timestamptz default now(),
  p_source_message_id text default null,
  p_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    p_kind, p_amount, p_party_name, p_description, p_occurred_at, null,
    'whatsapp', p_source_message_id, p_lines
  );
end;
$$;

create or replace function public.wa_confirm_daily_record(
  p_profile_id uuid,
  p_company_id uuid,
  p_daily_record_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.confirm_daily_record(p_daily_record_id);
end;
$$;

create or replace function public.wa_cancel_daily_record_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_daily_record_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.void_daily_record(p_daily_record_id, p_reason);
end;
$$;

-- A worker may cancel only their own still-pending draft. Finance roles retain
-- company-wide void authority through the original RPC.
create or replace function public.void_daily_record(
  p_daily_record_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_record public.daily_records;
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select * into v_record
    from public.daily_records dr
   where dr.id = p_daily_record_id
   for update;
  if not found or v_record.company_id <> v_company then
    raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_record.status = 'voided' then
    return v_record.id;
  end if;
  if v_role not in ('owner', 'accountant')
     and not (v_role = 'worker' and v_record.recorded_by = v_actor and v_record.status = 'pending_confirmation') then
    raise exception 'only an owner or accountant can void daily records'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if not private.is_meaningful_reason(v_reason) then
    raise exception 'a meaningful reason is required to void a daily record'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;

  update public.daily_records
     set status = 'voided', voided_by = v_actor, voided_at = now(), void_reason = v_reason, updated_at = now()
   where id = v_record.id;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (v_record.id, v_company, v_actor, 'voided', v_record.status, 'voided', v_reason,
     jsonb_build_object('amount', v_record.amount, 'currency', v_record.currency, 'kind', v_record.kind));

  return v_record.id;
end;
$$;

revoke all on function public.wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.wa_confirm_daily_record(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.wa_cancel_daily_record_draft(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamptz, text, jsonb) to service_role;
grant execute on function public.wa_confirm_daily_record(uuid, uuid, uuid) to service_role;
grant execute on function public.wa_cancel_daily_record_draft(uuid, uuid, uuid, text) to service_role;
