-- MEASURED, and the cause is exact.
--
-- A functional test voided a confirmed sale with the reason "functional test"
-- and got:
--
--   23514: new row for relation "daily_records" violates check constraint
--          "daily_records_voided_fields_check"
--
-- The constraint requires private.is_meaningful_reason(void_reason), and that
-- function's first rule is `length(t) < 20 then return false`. "functional
-- test" is fifteen characters. The test was wrong.
--
-- But the failure exposed something that was not the test's fault.
-- void_daily_record — the app path — checks the reason itself and raises a
-- clean `reason_not_meaningful`. wa_void_daily_record — the WhatsApp path —
-- never checked at all: it went straight to the UPDATE, so any short reason a
-- trader typed came back as a raw constraint violation the webhook could only
-- report as "I could not". The default sentence it falls back to is long
-- enough, which is why nobody had hit it yet.
--
-- Two corrections, both small.
--
--   1. A reason that is not meaningful no longer explodes. The trader's words
--      are kept in the audit log, where nothing is lost, and the record gets
--      the standard sentence so the row is valid. Refusing outright was the
--      other option and it is worse: the shopkeeper is trying to correct a
--      mistake, and the correction must not be the thing that fails.
--
--   2. A WhatsApp void now writes an audit row. void_daily_record has always
--      written one; this path never did, so a void done by phone left the
--      record changed and the history silent about who changed it.
--
-- ROLLBACK: restore wa_void_daily_record from its previous definition.

create or replace function public.wa_void_daily_record(
  p_phone text,
  p_daily_record_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_profile uuid;
  v_company uuid;
  v_role text;
  v_record public.daily_records%rowtype;
  v_said text := nullif(btrim(coalesce(p_reason, '')), '');
  v_stored text;
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

  -- The trader's own words when they satisfy the constraint; the standard
  -- sentence when they do not. Either way the row is valid and the correction
  -- goes through.
  v_stored := case
    when v_said is not null and private.is_meaningful_reason(v_said) then v_said
    else 'Imefutwa na mwenye biashara kupitia WhatsApp'
  end;

  update public.daily_records
     set status = 'voided',
         voided_by = v_profile,
         voided_at = clock_timestamp(),
         void_reason = v_stored,
         updated_at = clock_timestamp()
   where id = v_record.id;

  -- What the app path has always written, and this one never did.
  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (v_record.id, v_company, v_profile, 'voided', v_record.status, 'voided', v_stored,
     jsonb_build_object(
       'amount', v_record.amount,
       'currency', v_record.currency,
       'kind', v_record.kind,
       'source', 'whatsapp',
       -- Kept even when it was too short to store on the record itself, so the
       -- shop's actual words are never simply discarded.
       'said', v_said));

  return jsonb_build_object(
    'voided', true,
    'id', v_record.id,
    'kind', v_record.kind,
    'amount', v_record.amount,
    'party_name', v_record.party_name,
    'description', v_record.description,
    'occurred_at', v_record.occurred_at,
    'reason_stored', v_stored
  );
end;
$fn$;

revoke all on function public.wa_void_daily_record(text, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_void_daily_record(text, uuid, text) to service_role;
