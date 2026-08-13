-- Transactional WhatsApp batches for one message containing separate daily
-- record kinds. A batch never combines sales, expenses and debts into one
-- amount. Derived source keys keep every child idempotent while preserving the
-- original Meta message id as the stable prefix.

create or replace function public.wa_create_daily_record_batch_drafts(
  p_profile_id uuid,
  p_company_id uuid,
  p_source_message_id text,
  p_records jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
  v_item record;
  v_source text := nullif(btrim(p_source_message_id), '');
  v_id uuid;
  v_ids uuid[] := '{}'::uuid[];
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
  if v_source is null or length(v_source) > 240 then
    raise exception 'a valid source message id is required'
      using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_records) < 2
     or jsonb_array_length(p_records) > 10 then
    raise exception 'a batch must contain between 2 and 10 records'
      using errcode = 'P0001', hint = 'invalid_batch';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  for v_item in
    select value, ordinality
      from jsonb_array_elements(p_records) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_item.value) <> 'object' then
      raise exception 'each batch record must be an object'
        using errcode = 'P0001', hint = 'invalid_batch';
    end if;
    v_id := public.create_daily_record_draft(
      v_item.value->>'kind',
      (v_item.value->>'amount')::numeric,
      nullif(btrim(v_item.value->>'party_name'), ''),
      nullif(btrim(v_item.value->>'description'), ''),
      clock_timestamp(),
      null,
      'whatsapp',
      v_source || '#' || v_item.ordinality::text,
      coalesce(v_item.value->'lines', '[]'::jsonb)
    );
    v_ids := array_append(v_ids, v_id);
  end loop;
  return v_ids;
end;
$$;

create or replace function public.wa_confirm_daily_record_batch(
  p_profile_id uuid,
  p_company_id uuid,
  p_daily_record_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
  v_id uuid;
  v_ids uuid[] := '{}'::uuid[];
  v_distinct_count integer;
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
  select count(distinct ids.id) into v_distinct_count
    from unnest(p_daily_record_ids) as ids(id);
  if coalesce(cardinality(p_daily_record_ids), 0) < 2
     or cardinality(p_daily_record_ids) > 10
     or v_distinct_count <> cardinality(p_daily_record_ids) then
    raise exception 'a valid batch of unique record ids is required'
      using errcode = 'P0001', hint = 'invalid_batch';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  foreach v_id in array p_daily_record_ids loop
    v_ids := array_append(v_ids, public.confirm_daily_record(v_id));
  end loop;
  return v_ids;
end;
$$;

create or replace function public.wa_cancel_daily_record_batch(
  p_profile_id uuid,
  p_company_id uuid,
  p_daily_record_ids uuid[],
  p_reason text
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
  v_id uuid;
  v_ids uuid[] := '{}'::uuid[];
  v_distinct_count integer;
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
  select count(distinct ids.id) into v_distinct_count
    from unnest(p_daily_record_ids) as ids(id);
  if coalesce(cardinality(p_daily_record_ids), 0) < 2
     or cardinality(p_daily_record_ids) > 10
     or v_distinct_count <> cardinality(p_daily_record_ids) then
    raise exception 'a valid batch of unique record ids is required'
      using errcode = 'P0001', hint = 'invalid_batch';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  foreach v_id in array p_daily_record_ids loop
    v_ids := array_append(v_ids, public.void_daily_record(v_id, p_reason));
  end loop;
  return v_ids;
end;
$$;

revoke all on function public.wa_create_daily_record_batch_drafts(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.wa_confirm_daily_record_batch(uuid, uuid, uuid[])
  from public, anon, authenticated;
revoke all on function public.wa_cancel_daily_record_batch(uuid, uuid, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.wa_create_daily_record_batch_drafts(uuid, uuid, text, jsonb)
  to service_role;
grant execute on function public.wa_confirm_daily_record_batch(uuid, uuid, uuid[])
  to service_role;
grant execute on function public.wa_cancel_daily_record_batch(uuid, uuid, uuid[], text)
  to service_role;
