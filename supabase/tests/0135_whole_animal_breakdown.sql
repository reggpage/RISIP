-- Phase 7 functional proof. Run against the linked database inside a
-- transaction; every fixture is rolled back.
begin;

do $test$
declare
  v_company uuid;
  v_owner uuid;
  v_source uuid;
  v_breakdown uuid;
  v_before numeric;
  v_after numeric;
  v_produced numeric;
  v_audit bigint;
  v_duplicate boolean := false;
  v_key text := 'phase7_test_nyama';
begin
  select c.id into v_company from public.companies c order by c.created_at limit 1;
  select m.profile_id into v_owner
    from public.company_members m
   where m.company_id = v_company and m.role in ('owner', 'accountant')
     and m.deactivated_at is null
   order by case when m.role = 'owner' then 0 else 1 end limit 1;
  if v_company is null or v_owner is null then
    raise exception 'functional fixture needs one company owner';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name,
     base_quantity, is_base, can_purchase, can_sell, can_count, created_by)
  values
    (v_company, v_key, 'Phase 7 Test Nyama', 'kilo', 'kilo', 1, true, true, true, true, v_owner),
    (v_company, 'phase7_test_maini', 'Phase 7 Test Maini', 'kilo', 'kilo', 1, true, true, true, true, v_owner);

  v_source := public.create_whole_animal_procurement_draft(
    'ng''ombe', 1, 1200000, 'Phase 7 supplier', 'cash',
    '2026-08-24T09:00:00+03'::timestamptz, 'other',
    'phase7-rollback-whole-cow', 'PHASE7-REF', 'Rollback-only fixture'
  );
  perform public.confirm_daily_record(v_source);

  select coalesce(on_hand, 0) into v_before
    from public.wa_stock_on_hand(v_company, v_key);
  v_before := coalesce(v_before, 0);

  v_breakdown := public.wa_create_whole_animal_breakdown_draft(
    v_owner, v_company, v_source,
    jsonb_build_array(
      jsonb_build_object('product_key', v_key, 'product_name', 'Phase 7 Test Nyama', 'quantity', 180, 'unit', 'kilo'),
      jsonb_build_object('product_key', 'phase7_test_maini', 'product_name', 'Phase 7 Test Maini', 'quantity', 6, 'unit', 'kilo')
    ),
    '2026-08-25T11:00:00+03'::timestamptz, 'phase7-rollback-breakdown'
  );

  if not exists (
    select 1 from public.daily_records r
     where r.id = v_breakdown and r.kind = 'whole_animal_breakdown'
       and r.status = 'pending_confirmation' and r.amount = 1200000
  ) then raise exception 'pending breakdown record is wrong'; end if;
  if not exists (
    select 1 from public.whole_animal_breakdowns b
     where b.daily_record_id = v_breakdown
       and b.source_procurement_daily_record_id = v_source
       and b.purchase_total_snapshot = 1200000
       and b.cost_allocation_status = 'incomplete'
       and b.allocated_cost_total is null
  ) then raise exception 'breakdown source/cost snapshot is wrong'; end if;
  if (select count(*) from public.whole_animal_breakdown_outputs where breakdown_daily_record_id = v_breakdown) <> 2 then
    raise exception 'expected two output snapshots';
  end if;
  if exists (select 1 from public.daily_record_lines where daily_record_id = v_breakdown) then
    raise exception 'breakdown used daily_record_lines';
  end if;

  select coalesce(on_hand, 0) into v_after from public.wa_stock_on_hand(v_company, v_key);
  if coalesce(v_after, 0) <> v_before then raise exception 'pending breakdown changed stock'; end if;

  perform public.confirm_daily_record(v_breakdown);
  select on_hand, produced_since into v_after, v_produced
    from public.wa_stock_on_hand(v_company, v_key);
  if v_after <> v_before + 180 or v_produced <> 180 then
    raise exception 'confirmed output did not add exact stock';
  end if;
  if (select on_hand from public.wa_stock_on_hand(v_company, 'phase7_test_maini')) <> 6 then
    raise exception 'confirmed second output did not add exact stock';
  end if;

  begin
    perform public.wa_create_whole_animal_breakdown_draft(
      v_owner, v_company, v_source,
      jsonb_build_array(jsonb_build_object('product_key', v_key, 'quantity', 1, 'unit', 'kilo')),
      now(), 'phase7-rollback-duplicate'
    );
  exception when others then
    v_duplicate := true;
  end;
  if not v_duplicate then raise exception 'duplicate active breakdown was accepted'; end if;

  if exists (select 1 from public.product_costs where company_id = v_company and product_key in (v_key, 'phase7_test_maini')) then
    raise exception 'breakdown invented product costs';
  end if;
  perform public.void_daily_record(v_breakdown, 'Phase 7 rollback proof only');
  select coalesce(on_hand, 0) into v_after from public.wa_stock_on_hand(v_company, v_key);
  if v_after <> v_before then raise exception 'voided breakdown did not reverse stock'; end if;
  select count(*) into v_audit from public.daily_record_audit_log
   where daily_record_id = v_breakdown and action in ('created', 'confirmed', 'voided');
  if v_audit <> 3 then raise exception 'expected create/confirm/void audit'; end if;
  if (select status from public.daily_records where id = v_source) <> 'confirmed' then
    raise exception 'source procurement was changed by breakdown lifecycle';
  end if;
end;
$test$;

rollback;
