-- Phase 8 functional rollback proof. All fixtures are inside one transaction.
begin;

do $test$
declare
  v_company uuid;
  v_owner uuid;
  v_purchase uuid;
  v_payment uuid;
  v_animal uuid;
  v_animal_payment uuid;
  v_outstanding numeric;
  v_stock numeric;
  v_audit bigint;
  v_overpaid boolean := false;
  v_key text := 'phase 8 test nyama';
  v_when timestamptz := '2026-08-24T09:00:00+03'::timestamptz;
begin
  select c.id into v_company from public.companies c order by c.created_at limit 1;
  select m.profile_id into v_owner from public.company_members m
   where m.company_id = v_company and m.role in ('owner', 'accountant') and m.deactivated_at is null
   order by case when m.role = 'owner' then 0 else 1 end limit 1;
  if v_company is null or v_owner is null then raise exception 'functional fixture needs one company owner'; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
     is_base, can_purchase, can_sell, can_count, created_by)
  values (v_company, v_key, 'Phase 8 Test Nyama', 'kilo', 'kilo', 1, true, true, true, true, v_owner);
  insert into public.product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, effective_from, recorded_by)
  select v_company, v_key, 'Phase 8 Test Nyama', 'kilo', 1000, c.currency, v_when, v_owner
    from public.companies c where c.id = v_company;

  v_purchase := public.wa_create_supplier_credit_purchase_draft(
    v_owner, v_company, 'Musa',
    jsonb_build_array(jsonb_build_object('description', 'Phase 8 Test Nyama', 'quantity', 20, 'unit', 'kilo')),
    null, v_when, 'phase8-normal-purchase'
  );
  if (select status from public.daily_records where id = v_purchase) <> 'pending_confirmation'
     or (select payment_method from public.daily_records where id = v_purchase) is not null then
    raise exception 'credit purchase draft fields are wrong';
  end if;
  select coalesce((select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')), 0) into v_outstanding;
  if v_outstanding <> 0 then raise exception 'pending purchase changed payable'; end if;
  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, v_key)), 0) into v_stock;
  if v_stock <> 0 then raise exception 'pending purchase changed stock'; end if;

  perform public.confirm_daily_record(v_purchase);
  select outstanding into v_outstanding from public.wa_supplier_balances(v_owner, v_company, 'musa');
  if v_outstanding <> 20000 then raise exception 'confirmed purchase payable is not 20000'; end if;
  select on_hand into v_stock from public.wa_stock_on_hand(v_company, v_key);
  if v_stock <> 20 then raise exception 'confirmed credit purchase stock is not 20'; end if;

  begin
    perform public.wa_create_supplier_payment_draft(v_owner, v_company, 'Musa', 30000, 'cash', now(), 'phase8-overpay');
  exception when others then
    v_overpaid := SQLERRM like '%outstanding%';
  end;
  if not v_overpaid then raise exception 'supplier overpayment was accepted'; end if;

  v_payment := public.wa_create_supplier_payment_draft(v_owner, v_company, 'Musa', 6000, 'cash', v_when, 'phase8-payment');
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')) <> 20000 then
    raise exception 'pending supplier payment changed payable';
  end if;
  perform public.confirm_daily_record(v_payment);
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')) <> 14000 then
    raise exception 'confirmed partial payment did not reduce payable';
  end if;
  perform public.void_daily_record(v_payment, 'Phase 8 rollback payment proof');
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')) <> 20000 then
    raise exception 'voided payment did not restore payable';
  end if;
  perform public.void_daily_record(v_purchase, 'Phase 8 rollback purchase proof');
  if coalesce((select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')), 0) <> 0
     or coalesce((select on_hand from public.wa_stock_on_hand(v_company, v_key)), 0) <> 0 then
    raise exception 'voided credit purchase did not reverse stock and payable';
  end if;
  select count(*) into v_audit from public.daily_record_audit_log
   where daily_record_id in (v_purchase, v_payment) and action in ('created', 'confirmed', 'voided');
  if v_audit <> 6 then raise exception 'purchase/payment audit history is incomplete'; end if;

  v_animal := public.wa_create_whole_animal_procurement_draft(
    v_owner, v_company, 'ng''ombe', 1, 1200000, 'Musa', null, v_when,
    'phase8-whole-animal', null, 'Phase 8 rollback whole animal'
  );
  if (select payment_method from public.daily_records where id = v_animal) is not null
     or exists (select 1 from public.daily_record_lines where daily_record_id = v_animal) then
    raise exception 'whole-animal credit created stock lines or a payment method';
  end if;
  if coalesce((select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')), 0) <> 0 then
    raise exception 'pending whole-animal credit changed payable';
  end if;
  perform public.confirm_daily_record(v_animal);
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')) <> 1200000 then
    raise exception 'whole-animal payable is not 1200000';
  end if;
  if exists (select 1 from public.daily_record_lines where daily_record_id = v_animal) then
    raise exception 'confirmed whole-animal procurement created meat stock';
  end if;
  v_animal_payment := public.wa_create_supplier_payment_draft(v_owner, v_company, 'musa', 300000, 'cash', v_when, 'phase8-animal-payment');
  perform public.confirm_daily_record(v_animal_payment);
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')) <> 900000 then
    raise exception 'whole-animal partial payment is wrong';
  end if;
  perform public.void_daily_record(v_animal_payment, 'Phase 8 rollback animal payment proof');
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')) <> 1200000 then
    raise exception 'voided animal payment did not restore payable';
  end if;
  perform public.void_daily_record(v_animal, 'Phase 8 rollback animal procurement proof');
  if coalesce((select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Musa')), 0) <> 0 then
    raise exception 'voided animal procurement did not reverse payable';
  end if;
  select count(*) into v_audit from public.daily_record_audit_log
   where daily_record_id in (v_animal, v_animal_payment) and action in ('created', 'confirmed', 'voided');
  if v_audit <> 6 then raise exception 'whole-animal audit history is incomplete'; end if;
end;
$test$;

rollback;
