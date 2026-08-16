-- Run after 0107..0111 inside an outer BEGIN/ROLLBACK.
do $$
declare
  v_company uuid;
  v_actor uuid;
  v_currency text;
  v_name text := 'portion e2e ' || txid_current()::text;
  v_new_name text := 'portion renamed ' || txid_current()::text;
  v_key text;
  v_new_key text;
  v_record uuid := gen_random_uuid();
  v_stock record;
  v_preview jsonb;
  v_renamed jsonb;
begin
  select c.id, c.currency into v_company, v_currency
    from public.companies c where c.name = 'RISIP_UI_TEST_CO' limit 1;
  select m.profile_id into v_actor from public.company_members m
   where m.company_id = v_company and m.role = 'owner' and m.deactivated_at is null limit 1;
  if v_company is null or v_actor is null then raise exception 'test company owner fixture missing'; end if;

  perform private.configure_product_units(
    v_company, v_actor, v_name, 'lita', 'ndoo', 20, 20000,
    jsonb_build_array(
      jsonb_build_object('unit','robo','base_quantity',0.25,'retail',700),
      jsonb_build_object('unit','nusu','base_quantity',0.5,'retail',1200),
      jsonb_build_object('unit','lita','base_quantity',1,'retail',2500)
    )
  );
  v_key := private.product_key(v_name);
  v_new_key := private.product_key(v_new_name);

  insert into public.stock_counts
    (company_id, product_key, product_name, quantity, unit, counted_by, note)
  values (v_company, v_key, v_name, 2, 'ndoo', v_actor, 'rolled-back portion E2E');

  insert into public.daily_records
    (id, company_id, recorded_by, source, source_message_id, kind, status, amount,
     currency, occurred_at, confirmed_by, confirmed_at)
  values
    (v_record, v_company, v_actor, 'other', 'rollback-' || txid_current()::text,
     'sale', 'confirmed', 2100, v_currency, clock_timestamp(), v_actor, clock_timestamp());
  insert into public.daily_record_lines
    (daily_record_id, line_number, description, quantity, unit_amount, line_total, unit)
  values (v_record, 1, v_name, 3, 700, 2100, 'robo');

  select * into v_stock from public.wa_stock_on_hand(v_company, v_key);
  if v_stock.on_hand <> 39.25 or v_stock.unit <> 'lita' then
    raise exception 'portion stock math failed: % %', v_stock.on_hand, v_stock.unit;
  end if;
  if (select stock_base_quantity from public.daily_record_lines where daily_record_id = v_record) <> 0.75 then
    raise exception 'sale portion snapshot failed';
  end if;

  v_preview := private.product_rename_preview(v_company, v_name, v_new_name);
  if (v_preview ->> 'sale_lines')::integer <> 1
     or (v_preview ->> 'stock_counts')::integer <> 1
     or (v_preview ->> 'unit_rows')::integer <> 4 then
    raise exception 'rename preview counts are wrong: %', v_preview;
  end if;
  v_renamed := private.rename_product_for_actor(v_company, v_actor, v_name, v_new_name, 'rolled-back E2E');
  if (v_renamed ->> 'revenue')::numeric <> 2100 then raise exception 'rename moved revenue'; end if;
  if exists (select 1 from public.product_units where company_id = v_company and product_key = v_key) then
    raise exception 'old unit key remained after rename';
  end if;
  if (select count(*) from public.product_units where company_id = v_company and product_key = v_new_key) <> 4 then
    raise exception 'renamed unit rows missing';
  end if;
  if not exists (
    select 1 from public.product_events
     where company_id = v_company and action = 'rename' and product_key = v_key and target_key = v_new_key
  ) then raise exception 'rename audit event missing'; end if;
  select * into v_stock from public.wa_stock_on_hand(v_company, v_new_key);
  if v_stock.on_hand <> 39.25 then raise exception 'rename changed stock'; end if;
end $$;
