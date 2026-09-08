-- Rollback-only fixtures. No real business, user, or draft is changed.
begin;
-- MIGRATION_UNDER_TEST
do $$
declare
  c uuid := gen_random_uuid(); p uuid := gen_random_uuid(); i uuid := gen_random_uuid();
  other_c uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  snapshot jsonb; current_snapshot jsonb; result jsonb; rejected boolean := false;
begin
  insert into public.companies(id,name,hq_location) values(c,'Draft regression fixture','Test'),(other_c,'Other fixture','Test');
  insert into auth.users(id) values(p);
  insert into public.profiles(id,company_id,active_company_id,full_name,role) values(p,c,c,'Draft regression fixture','owner');
  insert into public.company_members(profile_id,company_id,role) values(p,c,'owner') on conflict do nothing;
  insert into public.company_members(profile_id,company_id,role) values(p,other_c,'owner') on conflict do nothing;
  -- The identity's legacy company may differ after a business switch.
  insert into public.whatsapp_identities(id,profile_id,company_id,phone_e164,verified_at) values(i,p,other_c,'web:'||p,null);
  insert into public.product_selling_prices(company_id,product_key,product_name,retail_price,wholesale_price,currency,effective_from)
    values(c,private.product_key('Velvet napkin'),'Velvet napkin',4000,3500,'TZS','2026-09-01'),
          (c,private.product_key('bahasha'),'bahasha',200,170,'TZS','2026-09-01'),
          (c,private.product_key('nguvu ya sala'),'nguvu ya sala',10600,9500,'TZS','2026-09-01'),
          (c,private.product_key('Velvet napkin'),'Velvet napkin',8000,7000,'TZS','2026-09-09');
  insert into public.daily_records(id,company_id,recorded_by,source,source_message_id,kind,amount,currency,occurred_at,payment_method)
    values(r,c,p,'whatsapp','draft-regression-'||r,'sale',46100,'TZS','2026-09-08 09:00+00','cash');
  insert into public.daily_record_lines(daily_record_id,line_number,description,quantity,unit_amount,line_total)
    values(r,1,'Velvet napkin',4,4000,16000),(r,2,'bahasha',8,200,1600),(r,3,'nguvu ya sala',3,9500,28500);
  select jsonb_build_object('kind','sale','amount',46100,'partyName',null,'description',null,
    'paymentMethod','cash','occurredAt','2026-09-08T09:00:00Z',
    'lines',jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unit_amount',unit_amount) order by line_number))
    into snapshot from public.daily_record_lines where daily_record_id=r;
  insert into public.whatsapp_conversations(identity_id,company_id,profile_id,awaiting,options)
    values(i,c,p,'payment_source',jsonb_build_object('kind','daily_record_confirmation','dailyRecordId',r,'record',snapshot));

  result := public.wa_correct_draft_sale_bands(i,p,c,r,snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"wholesale"}]');
  assert result->>'updated' = 'true', result::text;
  assert (result->'record'->>'amount')::numeric = 44100, 'wrong revised total';
  assert (select amount=44100 and status='pending_confirmation' and payment_method='cash' and occurred_at='2026-09-08 09:00+00' from public.daily_records where id=r), 'record metadata changed';
  assert (select count(*)=3 from public.daily_record_lines where daily_record_id=r), 'rows lost';
  assert (select unit_amount=200 and quantity=8 from public.daily_record_lines where daily_record_id=r and line_number=2), 'unaffected row changed';
  assert (select unit_amount=9500 and quantity=3 from public.daily_record_lines where daily_record_id=r and line_number=3), 'other wholesale row changed';
  assert (select count(*)=1 from public.daily_records where company_id=c), 'duplicate sale';
  assert (select count(*)=1 from public.daily_record_audit_log where daily_record_id=r and action='draft_corrected'), 'no correction audit';
  current_snapshot := result->'record';

  result := public.wa_correct_draft_sale_bands(i,p,c,r,snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"}]');
  assert result->>'reason'='stale_draft', 'stale request accepted';
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"},{"field":"price_band","product":"unknown","value":"wholesale"}]');
  assert result->>'updated'='false', 'unknown product accepted';
  assert (select amount=44100 from public.daily_records where id=r), 'partial correction persisted';
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":null,"value":"retail"}]');
  assert result->>'updated'='false', 'unnamed answer changed every row';
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"jumla"}]');
  assert result->>'updated'='false', 'noncanonical band accepted';
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"},{"field":"price_band","product":"velvet napkin","value":"wholesale"}]');
  assert result->>'updated'='false', 'conflicting duplicate accepted';
  begin
    perform public.wa_correct_draft_sale_bands(i,p,other_c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"}]');
  exception when sqlstate 'P0001' then rejected := true; end;
  assert rejected, 'cross-tenant correction accepted';
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"wholesale"},{"field":"payment_method","value":"mobile_money"}]');
  assert result->>'updated'='true' and result->'record'->>'paymentMethod'='mobile_money', 'combined payment detail lost';
  assert (select amount=44100 and payment_method='mobile_money' from public.daily_records where id=r), 'combined correction inconsistent';
  current_snapshot := result->'record';
  update public.product_selling_prices set wholesale_price=null where company_id=c and product_key=private.product_key('bahasha');
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"bahasha","value":"wholesale"}]');
  assert result->>'reason'='missing_catalogue_price', 'missing price was guessed';
  insert into public.daily_record_lines(daily_record_id,line_number,description,quantity,unit_amount,line_total)
    values(r,4,'Velvet napkin',1,4000,4000);
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"}]');
  assert result->>'reason'='ambiguous_draft_product', 'two same-product rows were conflated';
  delete from public.daily_record_lines where daily_record_id=r and line_number=4;
  update public.whatsapp_identities set revoked_at=now() where id=i;
  rejected := false;
  begin
    perform public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"}]');
  exception when sqlstate 'P0001' then rejected := true; end;
  assert rejected, 'revoked identity accepted';
  update public.whatsapp_identities set revoked_at=null where id=i;
  update public.whatsapp_conversations set expires_at=now()-interval '1 minute' where identity_id=i;
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"}]');
  assert result->>'reason'='stale_draft', 'expired draft accepted';
  update public.whatsapp_conversations set expires_at=now()+interval '30 minutes' where identity_id=i;
  update public.daily_records set status='confirmed', confirmed_by=p, confirmed_at=now() where id=r;
  result := public.wa_correct_draft_sale_bands(i,p,c,r,current_snapshot,'[{"field":"price_band","product":"Velvet napkin","value":"retail"}]');
  assert result->>'reason'='not_pending_sale', 'confirmed history modified';
  assert (select amount=44100 from public.daily_records where id=r), 'confirmed amount changed';
  assert not has_function_privilege('authenticated','public.wa_correct_draft_sale_bands(uuid,uuid,uuid,uuid,jsonb,jsonb)','EXECUTE'), 'client may edit directly';
  assert not has_function_privilege('anon','public.wa_correct_draft_sale_bands(uuid,uuid,uuid,uuid,jsonb,jsonb)','EXECUTE'), 'anonymous may edit';
end $$;
rollback;
select 'draft band correction assertions passed; all fixtures rolled back' as result;
