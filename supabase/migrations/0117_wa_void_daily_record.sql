-- Undoing a confirmed record from WhatsApp.
--
-- Until now, once a record was confirmed the only way to remove it was for
-- somebody with database access to do it by hand. That is exactly what happened
-- this week: a price change was misread as a stock count, the owner confirmed it
-- because the confirmation looked ordinary, and the rows had to be deleted with
-- SQL. A shopkeeper cannot be expected to phone for that.
--
-- NOTHING IS DELETED. daily_records already carries voided_by, voided_at and
-- void_reason, and a check constraint that refuses a void without a meaningful
-- reason. Voiding sets the status and keeps the row, so the history stays
-- readable and every total — which reads status='confirmed' — simply stops
-- counting it. That is the whole mechanism: no compensating entry, no deletion,
-- no way to make a record vanish.
--
-- Owner and accountant only, like every other money-moving operation.

create or replace function public.wa_void_daily_record(
  p_phone text,
  p_daily_record_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_profile uuid;
  v_company uuid;
  v_role text;
  v_record public.daily_records%rowtype;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only finance may void a record'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  -- The named record, or the most recent confirmed one for this company. The
  -- second is what "futa ile ya mwisho" means, and it is the common case: the
  -- mistake was noticed immediately.
  if p_daily_record_id is null then
    select * into v_record
      from public.daily_records
     where company_id = v_company and status = 'confirmed'
     order by confirmed_at desc nulls last, created_at desc
     limit 1;
  else
    select * into v_record
      from public.daily_records
     where id = p_daily_record_id and company_id = v_company;
  end if;

  if v_record.id is null then
    return jsonb_build_object('voided', false, 'reason', 'not_found');
  end if;
  if v_record.status <> 'confirmed' then
    return jsonb_build_object('voided', false, 'reason', 'not_confirmed', 'status', v_record.status);
  end if;

  update public.daily_records
     set status = 'voided',
         voided_by = v_profile,
         voided_at = clock_timestamp(),
         void_reason = coalesce(nullif(btrim(p_reason), ''), 'Imefutwa na mwenye biashara kupitia WhatsApp'),
         updated_at = clock_timestamp()
   where id = v_record.id;

  return jsonb_build_object(
    'voided', true,
    'id', v_record.id,
    'kind', v_record.kind,
    'amount', v_record.amount,
    'party_name', v_record.party_name,
    'description', v_record.description,
    'occurred_at', v_record.occurred_at
  );
end $function$;

revoke all on function public.wa_void_daily_record(text, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_void_daily_record(text, uuid, text) to service_role;

-- What the shop is about to remove, so the confirmation can name it before it
-- happens. Read-only, and deliberately separate: showing is not voiding.
create or replace function public.wa_last_daily_record(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select case when r.id is null then null else jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'amount', r.amount, 'party_name', r.party_name,
    'description', r.description, 'occurred_at', r.occurred_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity))
        from public.daily_record_lines l where l.daily_record_id = r.id
    ), '[]'::jsonb)
  ) end
  from (
    select * from public.daily_records
     where company_id = p_company_id and status = 'confirmed'
     order by confirmed_at desc nulls last, created_at desc
     limit 1
  ) r;
$function$;

revoke all on function public.wa_last_daily_record(uuid) from public, anon, authenticated;
grant execute on function public.wa_last_daily_record(uuid) to service_role;
