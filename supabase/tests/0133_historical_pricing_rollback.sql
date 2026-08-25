begin;

-- Prove historical sale pricing, historical COGS, and current-price compatibility
-- against the linked schema without leaving fixture products or records behind.
create temporary table historical_pricing_results (
  check_name text primary key,
  result text not null
) on commit drop;

do $$
declare
  v_phone text;
  v_profile uuid;
  v_company uuid;
  v_meat_key constant text := 'part9 nyama';
  v_sausage_key constant text := 'part9 soseji';
  v_old_at constant timestamptz := '2026-01-15 09:00:00+03';
  v_new_at constant timestamptz := '2026-02-15 09:00:00+03';
  v_before_all constant timestamptz := '2025-12-15 09:00:00+03';
  v_price numeric;
  v_sale uuid;
  v_debt uuid;
  v_profit jsonb;
  v_receivable_before numeric;
  v_receivable_after numeric;
begin
  select i.phone_e164, i.profile_id, p.active_company_id
    into v_phone, v_profile, v_company
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where i.revoked_at is null and m.role = 'owner'
   order by i.created_at
   limit 1;
  if v_phone is null then
    raise exception 'linked owner fixture was not found';
  end if;

  perform public.wa_configure_product_units(
    v_phone, v_meat_key, 'kilo', 'kilo', 1, 7000,
    '[{"unit":"kilo","base_quantity":1,"retail":12000}]'::jsonb
  );
  perform public.wa_configure_product_units(
    v_phone, v_sausage_key, 'piece', 'piece', 1, 500,
    '[{"unit":"piece","base_quantity":1,"retail":1000}]'::jsonb
  );

  -- Move the setup rows to the newer effective date and append older history.
  update public.product_selling_prices
     set effective_from = v_new_at
   where company_id = v_company
     and product_key in (v_meat_key, v_sausage_key);
  update public.product_costs
     set effective_from = v_new_at
   where company_id = v_company
     and product_key in (v_meat_key, v_sausage_key);

  insert into public.product_selling_prices
    (company_id, product_key, product_name, retail_price, currency,
     effective_from, recorded_by, sale_unit)
  values
    (v_company, v_meat_key, v_meat_key, 10000, 'TZS',
     '2026-01-01 00:00:00+03', v_profile, 'kilo'),
    (v_company, v_sausage_key, v_sausage_key, 800, 'TZS',
     '2026-01-01 00:00:00+03', v_profile, 'piece');

  insert into public.product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency,
     effective_from, recorded_by, note)
  values
    (v_company, v_meat_key, v_meat_key, 'kilo', 6000, 'TZS',
     '2026-01-01 00:00:00+03', v_profile, 'Part 9 rollback fixture'),
    (v_company, v_sausage_key, v_sausage_key, 'piece', 400, 'TZS',
     '2026-01-01 00:00:00+03', v_profile, 'Part 9 rollback fixture');

  select unit_price into v_price
    from public.wa_price_sale_unit(v_company, v_meat_key, 'kilo', 2, v_old_at);
  if v_price <> 10000 then
    raise exception 'old meat price should be 10000, got %', v_price;
  end if;
  select unit_price into v_price
    from public.wa_price_sale_unit(v_company, v_meat_key, 'kilo', 2, v_new_at);
  if v_price <> 12000 then
    raise exception 'new meat price should be 12000, got %', v_price;
  end if;
  select unit_price into v_price
    from public.wa_price_sale_unit(v_company, v_meat_key, 'kilo', 2, null);
  if v_price <> 12000 then
    raise exception 'current meat price should remain 12000, got %', v_price;
  end if;
  select unit_price into v_price
    from public.wa_price_sale_unit(v_company, v_meat_key, 'kilo', 2, v_before_all);
  if v_price is not null then
    raise exception 'a date before all price rows must not fall forward to %', v_price;
  end if;

  -- One historical multi-product sale uses the two prices independently.
  v_sale := public.wa_create_daily_record_draft(
    v_profile, v_company, 'sale', 24000, null, null, v_old_at,
    'wamid.rollback-0133-sale',
    '[{"description":"part9 nyama","quantity":2,"unit":"kilo","unit_amount":10000},
      {"description":"part9 soseji","quantity":5,"unit":"piece","unit_amount":800}]'::jsonb,
    'cash', null
  );
  if not exists (
    select 1 from public.daily_records
     where id = v_sale and amount = 24000 and occurred_at = v_old_at
       and payment_method = 'cash' and status = 'pending_confirmation'
  ) then
    raise exception 'historical multi-product sale draft is wrong';
  end if;
  perform public.wa_confirm_daily_record(v_profile, v_company, v_sale);

  perform set_config('request.jwt.claim.sub', v_profile::text, true);
  v_profit := public.daily_profit_estimate(
    '2026-01-15 00:00:00+03', '2026-01-16 00:00:00+03'
  );
  if (v_profit->>'cogs')::numeric <> 14000
     or (v_profit->>'estimated_profit')::numeric <> 10000 then
    raise exception 'historical COGS/profit is wrong: %', v_profit;
  end if;

  select coalesce(sum(case when kind = 'debt_issued' then amount else -amount end), 0)
    into v_receivable_before
    from public.daily_records
   where company_id = v_company and status = 'confirmed'
     and lower(party_name) = 'part9 juma'
     and kind in ('debt_issued', 'customer_payment');

  v_debt := public.wa_create_daily_record_draft(
    v_profile, v_company, 'debt_issued', 24000, 'Part9 Juma', null, v_old_at,
    'wamid.rollback-0133-debt',
    '[{"description":"part9 nyama","quantity":2,"unit":"kilo","unit_amount":10000},
      {"description":"part9 soseji","quantity":5,"unit":"piece","unit_amount":800}]'::jsonb,
    null, null
  );
  perform public.wa_confirm_daily_record(v_profile, v_company, v_debt);
  select coalesce(sum(case when kind = 'debt_issued' then amount else -amount end), 0)
    into v_receivable_after
    from public.daily_records
   where company_id = v_company and status = 'confirmed'
     and lower(party_name) = 'part9 juma'
     and kind in ('debt_issued', 'customer_payment');
  if v_receivable_after - v_receivable_before <> 24000 then
    raise exception 'historical credit sale did not add 24000 receivable';
  end if;

  insert into historical_pricing_results values
    ('boundary', 'old=10000; exact/new=12000; current=12000'),
    ('no_future_fallback', 'date before first price returned no price'),
    ('multi_sale', 'two historical lines; total=24000; method=cash'),
    ('credit', 'two historical lines; receivable delta=24000'),
    ('cogs', 'historical COGS=14000; estimated profit=10000'),
    ('audit', format('sale=%s rows; debt=%s rows',
      (select count(*) from public.daily_record_audit_log where daily_record_id = v_sale),
      (select count(*) from public.daily_record_audit_log where daily_record_id = v_debt)));
end;
$$;

select check_name, result
  from historical_pricing_results
 order by check_name;

rollback;
