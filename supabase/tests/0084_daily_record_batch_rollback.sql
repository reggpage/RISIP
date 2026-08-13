begin;

do $$
declare
  v_profile uuid;
  v_company uuid;
  v_ids uuid[];
  v_duplicate_ids uuid[];
  v_cancel_ids uuid[];
  v_receipt_total_before numeric;
  v_receipt_total_after numeric;
  v_records jsonb := '[
    {"kind":"sale","amount":25000,"party_name":null,"description":null,"lines":[{"description":"daftari","quantity":10,"unit_amount":1500},{"description":"kalamu","quantity":20,"unit_amount":500}]},
    {"kind":"expense","amount":19500,"party_name":null,"description":null,"lines":[{"description":"Chakula asubuhi na jioni","quantity":1,"unit_amount":12000},{"description":"Nauli","quantity":1,"unit_amount":7500}]},
    {"kind":"debt_issued","amount":90000,"party_name":"Bakita","description":null,"lines":[{"description":"nguvu ya sala","quantity":10,"unit_amount":9000}]}
  ]'::jsonb;
  v_cancel_records jsonb := '[
    {"kind":"sale","amount":1000,"party_name":null,"description":null,"lines":[{"description":"test item","quantity":1,"unit_amount":1000}]},
    {"kind":"expense","amount":500,"party_name":null,"description":null,"lines":[{"description":"test expense","quantity":1,"unit_amount":500}]}
  ]'::jsonb;
begin
  select p.id, p.active_company_id into v_profile, v_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where lower(p.full_name) like 'angela%'
     and p.deactivated_at is null
   limit 1;
  if v_profile is null or v_company is null then
    raise exception 'Angela linked test profile was not found';
  end if;

  select coalesce(sum(r.total_amount), 0) into v_receipt_total_before
    from public.receipts r
   where r.company_id = v_company
     and r.status = 'confirmed';

  v_ids := public.wa_create_daily_record_batch_drafts(
    v_profile, v_company, 'wamid.rollback-0084-create', v_records
  );
  if cardinality(v_ids) <> 3 then
    raise exception 'expected 3 draft ids, got %', cardinality(v_ids);
  end if;
  if (select count(*) from public.daily_records where id = any(v_ids) and status = 'pending_confirmation') <> 3 then
    raise exception 'all batch children must start pending';
  end if;
  if (select count(*) from public.daily_records where id = any(v_ids) and source_message_id like 'wamid.rollback-0084-create#%') <> 3 then
    raise exception 'derived source ids are missing';
  end if;

  v_duplicate_ids := public.wa_create_daily_record_batch_drafts(
    v_profile, v_company, 'wamid.rollback-0084-create', v_records
  );
  if v_duplicate_ids <> v_ids then
    raise exception 'duplicate source message did not return the same record ids';
  end if;

  perform public.wa_confirm_daily_record_batch(v_profile, v_company, v_ids);
  if (select count(*) from public.daily_records where id = any(v_ids) and status = 'confirmed') <> 3 then
    raise exception 'batch confirm did not confirm every child';
  end if;

  v_cancel_ids := public.wa_create_daily_record_batch_drafts(
    v_profile, v_company, 'wamid.rollback-0084-cancel', v_cancel_records
  );
  perform public.wa_cancel_daily_record_batch(
    v_profile, v_company, v_cancel_ids, 'Rollback verification cancelled test batch'
  );
  if (select count(*) from public.daily_records where id = any(v_cancel_ids) and status = 'voided') <> 2 then
    raise exception 'batch cancel did not void every child';
  end if;

  select coalesce(sum(r.total_amount), 0) into v_receipt_total_after
    from public.receipts r
   where r.company_id = v_company
     and r.status = 'confirmed';
  if v_receipt_total_after <> v_receipt_total_before then
    raise exception 'receipt totals moved during daily-record batch E2E';
  end if;
end;
$$;

rollback;
