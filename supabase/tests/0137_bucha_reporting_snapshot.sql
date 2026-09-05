-- Phase 9 reporting proof. Every fixture is inside one transaction.
begin;

do $test$
declare
  v_company uuid;
  v_owner uuid;
  v_cash_sale uuid;
  v_mobile_sale uuid;
  v_credit_sale uuid;
  v_customer_payment uuid;
  v_loss uuid;
  v_owner_use uuid;
  v_purchase uuid;
  v_supplier_payment uuid;
  v_animal uuid;
  v_breakdown uuid;
  v_pending_snapshot jsonb;
  v_snapshot jsonb;
  v_report numeric;
  v_stock numeric;
  v_audit bigint;
  v_when timestamptz := '2026-08-24T09:00:00+03'::timestamptz;
  v_product text := 'phase9_test_nyama';
  v_output text := 'phase9_test_maini';
begin
  select c.id into v_company from public.companies c order by c.created_at limit 1;
  select m.profile_id into v_owner from public.company_members m
   where m.company_id = v_company and m.role in ('owner', 'accountant') and m.deactivated_at is null
   order by case when m.role = 'owner' then 0 else 1 end limit 1;
  if v_company is null or v_owner is null then raise exception 'Phase 9 fixture needs one company owner'; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
     is_base, can_purchase, can_sell, can_count, created_by)
  values
    (v_company, v_product, 'Phase 9 Test Nyama', 'kilo', 'kilo', 1, true, true, true, true, v_owner),
    (v_company, v_output, 'Phase 9 Test Maini', 'kilo', 'kilo', 1, true, true, true, true, v_owner);
  insert into public.product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, effective_from, recorded_by)
  select v_company, v_product, 'Phase 9 Test Nyama', 'kilo', 1000, c.currency, v_when, v_owner
    from public.companies c where c.id = v_company;

  v_cash_sale := public.create_daily_record_draft(
    'sale', 40000, null, 'Phase 9 cash sale', v_when, null, 'other', 'phase9-cash-sale',
    jsonb_build_array(jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 4, 'unit_amount', 10000, 'unit', 'kilo')), 'cash', null);
  v_mobile_sale := public.create_daily_record_draft(
    'sale', 30000, null, 'Phase 9 mobile sale', v_when, null, 'other', 'phase9-mobile-sale',
    jsonb_build_array(jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 3, 'unit_amount', 10000, 'unit', 'kilo')), 'mobile_money', null);
  v_credit_sale := public.create_daily_record_draft(
    'debt_issued', 50000, 'Phase9 Customer', 'Phase 9 credit sale', v_when, null, 'other', 'phase9-credit-sale',
    jsonb_build_array(jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 5, 'unit_amount', 10000, 'unit', 'kilo')), null, null);
  v_customer_payment := public.create_daily_record_draft(
    'customer_payment', 10000, 'phase9 customer', 'Phase 9 customer payment', v_when, null, 'other', 'phase9-customer-payment', '[]'::jsonb, 'cash', null);
  v_loss := public.create_daily_record_draft(
    'stock_loss', 2000, null, 'Phase 9 spoiled stock', v_when, null, 'other', 'phase9-loss',
    jsonb_build_array(
      jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 1, 'unit_amount', 1000, 'unit', 'kilo'),
      jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 1, 'unit_amount', 1000, 'unit', 'kilo')
    ), null, 'spoiled');
  v_owner_use := public.create_daily_record_draft(
    'owner_use', 0, null, 'Phase 9 owner use', v_when, null, 'other', 'phase9-owner-use',
    jsonb_build_array(jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 1, 'unit_amount', 0, 'unit', 'kilo')), null, null);

  perform public.confirm_daily_record(v_cash_sale);
  perform public.confirm_daily_record(v_mobile_sale);
  perform public.confirm_daily_record(v_credit_sale);
  perform public.confirm_daily_record(v_customer_payment);
  perform public.confirm_daily_record(v_loss);
  perform public.confirm_daily_record(v_owner_use);

  v_purchase := public.wa_create_supplier_credit_purchase_draft(
    v_owner, v_company, 'Phase9 Supplier',
    jsonb_build_array(jsonb_build_object('description', 'Phase 9 Test Nyama', 'quantity', 20, 'unit', 'kilo')),
    20000, v_when, 'phase9-supplier-purchase');
  if (select status from public.daily_records where id = v_purchase) <> 'pending_confirmation' then
    raise exception 'supplier purchase was not pending';
  end if;
  perform public.confirm_daily_record(v_purchase);

  v_animal := public.wa_create_whole_animal_procurement_draft(
    v_owner, v_company, 'ng''ombe', 2, 1200000, 'Phase9 Supplier', null, v_when,
    'phase9-whole-animal', null, 'Phase 9 reporting proof');
  if (select status from public.daily_records where id = v_animal) <> 'pending_confirmation' then
    raise exception 'whole animal was not pending';
  end if;
  perform public.confirm_daily_record(v_animal);

  v_supplier_payment := public.wa_create_supplier_payment_draft(
    v_owner, v_company, 'phase9 supplier', 300000, 'cash', v_when, 'phase9-supplier-payment');
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Phase9 Supplier')) <> 1220000 then
    raise exception 'pending supplier payment changed liability';
  end if;
  perform public.confirm_daily_record(v_supplier_payment);

  v_breakdown := public.wa_create_whole_animal_breakdown_draft(
    v_owner, v_company, v_animal,
    jsonb_build_array(jsonb_build_object('product_key', v_output, 'product_name', 'Phase 9 Test Maini', 'quantity', 6, 'unit', 'kilo')),
    v_when, 'phase9-breakdown');
  if exists (select 1 from public.daily_record_lines where daily_record_id in (v_animal, v_breakdown)) then
    raise exception 'whole animal or breakdown used normal stock lines';
  end if;
  v_pending_snapshot := public.bucha_reporting_snapshot(v_when - interval '1 hour', v_when + interval '1 day');
  if (v_pending_snapshot->'whole_animals'->>'pending_breakdown')::numeric <> 2 then
    raise exception 'a pending breakdown was incorrectly reported as confirmed';
  end if;
  perform public.confirm_daily_record(v_breakdown);

  v_snapshot := public.bucha_reporting_snapshot(v_when - interval '1 hour', v_when + interval '1 day');
  if (v_snapshot->'sales'->>'total')::numeric <> 120000 then raise exception 'sales total double-counted or missed credit sale'; end if;
  if (v_snapshot->'sales'->>'settled_sales')::numeric <> 70000
     or (v_snapshot->'sales'->>'cash_sales')::numeric <> 40000 then
    raise exception 'settled sales and actual cash sales were conflated';
  end if;
  if (v_snapshot->'sales'->'by_payment_method'->>'cash')::numeric <> 40000
     or (v_snapshot->'sales'->'by_payment_method'->>'mobile_money')::numeric <> 30000
     or (v_snapshot->'sales'->'by_payment_method'->>'credit')::numeric <> 50000 then
    raise exception 'sales payment-method split is wrong';
  end if;
  select (value->>'outstanding')::numeric into v_report
    from jsonb_array_elements(v_snapshot->'customer_receivables') value
   where lower(value->>'party_name') = 'phase9 customer';
  if v_report <> 40000 then
    raise exception 'customer receivable direction or amount is wrong';
  end if;
  if (select (value->>'outstanding')::numeric from jsonb_array_elements(v_snapshot->'supplier_payables') value where lower(value->>'supplier_name') = 'phase9 supplier') <> 920000 then
    raise exception 'supplier payable total is wrong';
  end if;
  if (v_snapshot->'stock_loss'->>'quantity')::numeric <> 2 or (v_snapshot->'stock_loss'->>'amount')::numeric <> 2000 then
    raise exception 'stock loss report is wrong';
  end if;
  if (v_snapshot->'owner_use'->>'quantity')::numeric <> 1 then raise exception 'owner-use report is wrong'; end if;
  if (v_snapshot->'whole_animals'->>'count')::numeric <> 2
     or (v_snapshot->'whole_animals'->>'pending_breakdown')::numeric <> 0
     or (v_snapshot->'whole_animals'->>'breakdown_outputs')::numeric <> 6
     or (v_snapshot->'whole_animals'->>'allocation_incomplete')::numeric <> 1 then
    raise exception 'whole-animal/breakdown report is wrong';
  end if;
  if v_snapshot->'whole_animals'->'procurements'->0->'breakdowns'->0->'outputs'->0->>'product_name'
     <> 'Phase 9 Test Maini' then
    raise exception 'actual breakdown output detail is missing';
  end if;
  select on_hand into v_stock from public.wa_stock_on_hand(v_company, v_product);
  if v_stock <> 9 then raise exception 'stock did not include purchase and exclude loss/owner-use/sales correctly'; end if;
  if exists (select 1 from public.daily_record_lines where daily_record_id = v_animal) then
    raise exception 'whole-animal procurement created meat stock';
  end if;

  perform public.void_daily_record(v_supplier_payment, 'Phase 9 rollback supplier payment');
  if (select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Phase9 Supplier')) <> 1220000 then
    raise exception 'voided supplier payment did not restore payable';
  end if;
  perform public.void_daily_record(v_breakdown, 'Phase 9 rollback breakdown');
  perform public.void_daily_record(v_animal, 'Phase 9 rollback animal');
  perform public.void_daily_record(v_purchase, 'Phase 9 rollback purchase');
  perform public.void_daily_record(v_cash_sale, 'Phase 9 rollback cash sale');
  perform public.void_daily_record(v_mobile_sale, 'Phase 9 rollback mobile sale');
  perform public.void_daily_record(v_credit_sale, 'Phase 9 rollback credit sale');
  perform public.void_daily_record(v_customer_payment, 'Phase 9 rollback customer payment');
  perform public.void_daily_record(v_loss, 'Phase 9 rollback stock loss');
  perform public.void_daily_record(v_owner_use, 'Phase 9 rollback owner use');
  if coalesce((select outstanding from public.wa_supplier_balances(v_owner, v_company, 'Phase9 Supplier')), 0) <> 0
     or coalesce((select on_hand from public.wa_stock_on_hand(v_company, v_product)), 0) <> 0 then
    raise exception 'voids did not reverse Phase 9 balances and stock';
  end if;
  select count(*) into v_audit from public.daily_record_audit_log
   where daily_record_id in (v_cash_sale, v_mobile_sale, v_credit_sale, v_customer_payment,
     v_loss, v_owner_use, v_purchase, v_supplier_payment, v_animal, v_breakdown)
     and action in ('created', 'confirmed', 'voided');
  if v_audit <> 30 then raise exception 'Phase 9 audit history is incomplete'; end if;
end;
$test$;

rollback;
