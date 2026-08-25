begin;

-- Production-safe proof: all fixtures and confirmed movements roll back.
create temporary table phase5_part7_results (
  check_name text primary key,
  result text not null
) on commit drop;

do $$
declare
  v_phone constant text := '+255624107354';
  v_profile uuid;
  v_company uuid;
  v_sale uuid;
  v_debt uuid;
  v_nyama_before numeric;
  v_soseji_before numeric;
  v_dog_before numeric;
  v_debt_before numeric;
  v_debt_after numeric;
begin
  select i.profile_id, p.active_company_id
    into v_profile, v_company
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where i.phone_e164 = v_phone
     and i.revoked_at is null
     and m.role = 'owner'
   limit 1;
  if v_profile is null then
    raise exception 'linked owner fixture was not found';
  end if;

  perform public.wa_configure_product_units(
    v_phone, 'Nyama', 'kilo', 'kilo', 1, 12000,
    '[{"unit":"kilo","base_quantity":1,"retail":12000}]'::jsonb
  );
  perform public.wa_configure_product_units(
    v_phone, 'Soseji', 'piece', 'packet', 24, 12000,
    '[{"unit":"piece","base_quantity":1,"retail":1000}]'::jsonb
  );
  perform public.wa_configure_product_units(
    v_phone, 'Chakula cha mbwa', 'kilo', 'kilo', 1, 2000,
    '[{"unit":"kilo","base_quantity":1,"retail":2000}]'::jsonb
  );
  perform public.wa_save_business_term(
    v_phone, 'product_alias', 'za mbwa', 'Chakula cha mbwa', null
  );

  if not exists (
    select 1 from public.wa_resolve_company_product_read(v_profile, v_company, 'za mbwa')
     where product_name = 'Chakula cha mbwa' and match_kind = 'alias'
  ) then
    raise exception 'za mbwa did not resolve to canonical Chakula cha mbwa';
  end if;

  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Nyama') limit 1), 0)
    into v_nyama_before;
  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Soseji') limit 1), 0)
    into v_soseji_before;
  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Chakula cha mbwa') limit 1), 0)
    into v_dog_before;

  v_sale := public.wa_create_daily_record_draft(
    v_profile, v_company, 'sale', 29000, null, null, now(),
    'wamid.rollback-part7-sale',
    '[
      {"description":"Nyama","quantity":2,"unit":"kilo","unit_amount":12000},
      {"description":"Soseji","quantity":5,"unit":"piece","unit_amount":1000}
    ]'::jsonb,
    'cash', null
  );

  if not exists (
    select 1 from public.daily_records
     where id = v_sale and kind = 'sale' and status = 'pending_confirmation'
       and amount = 29000 and payment_method = 'cash'
  ) then
    raise exception 'multi-product sale draft lost kind, amount, state or cash method';
  end if;
  if (select count(*) from public.daily_record_lines where daily_record_id = v_sale) <> 2 then
    raise exception 'multi-product sale did not create exactly two lines';
  end if;
  if not exists (
    select 1 from public.daily_record_lines
     where daily_record_id = v_sale and description = 'Nyama'
       and quantity = 2 and unit = 'kilo' and unit_amount = 12000
       and stock_base_quantity = 2
  ) or not exists (
    select 1 from public.daily_record_lines
     where daily_record_id = v_sale and description = 'Soseji'
       and quantity = 5 and unit = 'piece' and unit_amount = 1000
       and stock_base_quantity = 5
  ) then
    raise exception 'multi-product sale lines were not canonical deterministic snapshots';
  end if;
  if coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Nyama') limit 1), 0) <> v_nyama_before
     or coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Soseji') limit 1), 0) <> v_soseji_before then
    raise exception 'pending multi-product sale moved stock';
  end if;

  perform public.wa_confirm_daily_record(v_profile, v_company, v_sale);
  if coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Nyama') limit 1), 0) <> v_nyama_before - 2
     or coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Soseji') limit 1), 0) <> v_soseji_before - 5 then
    raise exception 'confirmed sale did not reduce both product stocks correctly';
  end if;
  if (select count(*) from public.daily_record_audit_log where daily_record_id = v_sale) <> 2 then
    raise exception 'sale did not preserve create + confirm audit history';
  end if;

  select coalesce(sum(case when kind = 'debt_issued' then amount else -amount end), 0)
    into v_debt_before
    from public.daily_records
   where company_id = v_company and status = 'confirmed'
     and lower(party_name) = 'juma'
     and kind in ('debt_issued', 'customer_payment');

  v_debt := public.wa_create_daily_record_draft(
    v_profile, v_company, 'debt_issued', 30000, 'Juma', null, now(),
    'wamid.rollback-part7-debt',
    '[
      {"description":"Nyama","quantity":2,"unit":"kilo","unit_amount":12000},
      {"description":"Chakula cha mbwa","quantity":3,"unit":"kilo","unit_amount":2000}
    ]'::jsonb,
    null, null
  );

  if not exists (
    select 1 from public.daily_records
     where id = v_debt and kind = 'debt_issued' and party_name = 'Juma'
       and status = 'pending_confirmation' and amount = 30000
       and payment_method is null
  ) then
    raise exception 'multi-product debt draft lost party, amount or unpaid state';
  end if;
  if (select count(*) from public.daily_record_lines where daily_record_id = v_debt) <> 2 then
    raise exception 'multi-product debt did not create exactly two lines';
  end if;
  if not exists (
    select 1 from public.daily_record_lines
     where daily_record_id = v_debt and description = 'Chakula cha mbwa'
       and quantity = 3 and unit = 'kilo' and unit_amount = 2000
       and stock_base_quantity = 3
  ) then
    raise exception 'credit alias did not become a canonical dog-food line';
  end if;
  if coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Nyama') limit 1), 0) <> v_nyama_before - 2
     or coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Chakula cha mbwa') limit 1), 0) <> v_dog_before then
    raise exception 'pending multi-product debt moved stock';
  end if;

  perform public.wa_confirm_daily_record(v_profile, v_company, v_debt);
  if coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Nyama') limit 1), 0) <> v_nyama_before - 4
     or coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Chakula cha mbwa') limit 1), 0) <> v_dog_before - 3 then
    raise exception 'confirmed debt did not reduce both product stocks correctly';
  end if;
  select coalesce(sum(case when kind = 'debt_issued' then amount else -amount end), 0)
    into v_debt_after
    from public.daily_records
   where company_id = v_company and status = 'confirmed'
     and lower(party_name) = 'juma'
     and kind in ('debt_issued', 'customer_payment');
  if v_debt_after <> v_debt_before + 30000 then
    raise exception 'Juma receivable delta was %, expected 30000', v_debt_after - v_debt_before;
  end if;
  if (select count(*) from public.daily_record_audit_log where daily_record_id = v_debt) <> 2 then
    raise exception 'debt did not preserve create + confirm audit history';
  end if;

  insert into phase5_part7_results values
    ('normal_sale', 'one draft; Nyama 24000 + Soseji 5000 = 29000; cash; both stocks moved only on confirm'),
    ('credit_sale', 'one debt; Nyama 24000 + Chakula cha mbwa 6000 = 30000; Juma; no payment method'),
    ('canonicalization', 'za mbwa resolved by alias and line stored as Chakula cha mbwa'),
    ('audit', 'create + confirm audit rows exist for both records'),
    ('rollback', 'all test products, drafts, stock movements and receivable changes roll back');
end;
$$;

select check_name, result
  from phase5_part7_results
 order by check_name;

rollback;
