-- Synthetic-only proof against the currently installed functions. No real
-- company/user/phone is selected, no WhatsApp identity is created, no external
-- calls are made. Inspect installed triggers before running on a linked DB.
begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';
create function pg_temp.ai_assert(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'AI foundation proof failed: %', message; end if;
end $$;

do $proof$
declare
  company uuid := gen_random_uuid(); other_company uuid := gen_random_uuid();
  boss uuid := gen_random_uuid(); worker uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  purchase uuid; payment uuid; animal uuid; sale uuid; other_draft uuid; race_payment uuid;
  denied boolean; hint text; before_audit bigint;
begin
  insert into public.companies(id,name,hq_location) values
    (company,'AI FOUNDATION ROLLBACK ONLY','Synthetic'),
    (other_company,'AI FOUNDATION ROLLBACK OTHER','Synthetic');
  insert into auth.users(id,aud,role,email) values
    (boss,'authenticated','authenticated',boss::text || '@example.invalid'),
    (worker,'authenticated','authenticated',worker::text || '@example.invalid'),
    (outsider,'authenticated','authenticated',outsider::text || '@example.invalid');
  insert into public.profiles(id,company_id,active_company_id,full_name,role) values
    (boss,company,company,'Synthetic Boss','owner'),
    (worker,company,company,'Synthetic Worker','worker'),
    (outsider,other_company,other_company,'Synthetic Other','owner');
  insert into public.company_members(profile_id,company_id,role) values
    (boss,company,'owner'),(worker,company,'worker'),(outsider,other_company,'owner');
  perform set_config('request.jwt.claim.sub',worker::text,true);

  insert into public.product_units(company_id,product_key,product_name,unit_key,unit_name,base_quantity,is_base,can_purchase,can_sell,can_count,created_by)
  values(company,'synthetic nyama','Synthetic Nyama','kilo','kilo',1,true,true,true,true,boss);
  insert into public.product_costs(company_id,product_key,product_name,unit,unit_cost,currency,effective_from,recorded_by)
  values(company,'synthetic nyama','Synthetic Nyama','kilo',1000,'TZS',now()-interval '1 day',boss);

  purchase := public.wa_create_supplier_credit_purchase_draft(worker,company,'Synthetic Musa',
    '[{"description":"Synthetic Nyama","quantity":20,"unit":"kilo"}]'::jsonb,null,now(),'ai-proof-purchase');
  perform pg_temp.ai_assert((select payment_method is null and status='pending_confirmation' from public.daily_records where id=purchase),'credit has NULL payment, pending');
  perform pg_temp.ai_assert(not exists(select 1 from public.wa_supplier_balances(boss,company,'Synthetic Musa')),'pending liability zero');
  perform pg_temp.ai_assert(coalesce((select on_hand from public.wa_stock_on_hand(company,'synthetic nyama')),0)=0,'pending stock zero');
  perform public.wa_confirm_daily_record(worker,company,purchase);
  perform pg_temp.ai_assert((select status='confirmed' and confirmed_by=worker from public.daily_records where id=purchase),'worker confirms own purchase without boss');
  perform pg_temp.ai_assert((select outstanding from public.wa_supplier_balances(boss,company,'Synthetic Musa'))=20000,'confirmed supplier liability');
  perform pg_temp.ai_assert((select on_hand from public.wa_stock_on_hand(company,'synthetic nyama'))=20,'confirmed purchase adds stock');
  select count(*) into before_audit from public.daily_record_audit_log where daily_record_id=purchase;
  perform public.wa_confirm_daily_record(worker,company,purchase);
  perform pg_temp.ai_assert((select count(*) from public.daily_record_audit_log where daily_record_id=purchase)=before_audit,'confirmation retry creates no duplicate audit');
  perform pg_temp.ai_assert((select on_hand from public.wa_stock_on_hand(company,'synthetic nyama'))=20,'confirmation retry creates no duplicate stock');

  payment := public.wa_create_supplier_payment_draft(worker,company,'Synthetic Musa',6000,'cash',now(),'ai-proof-payment');
  race_payment := public.wa_create_supplier_payment_draft(worker,company,'Synthetic Musa',18000,'cash',now(),'ai-proof-race-payment');
  perform pg_temp.ai_assert((select outstanding from public.wa_supplier_balances(boss,company,'Synthetic Musa'))=20000,'pending payments do not change balance');
  perform public.wa_confirm_daily_record(worker,company,payment);
  perform pg_temp.ai_assert((select outstanding from public.wa_supplier_balances(boss,company,'Synthetic Musa'))=14000,'partial supplier payment');
  denied := false;
  begin perform public.wa_confirm_daily_record(worker,company,race_payment);
  exception when others then get stacked diagnostics hint=PG_EXCEPTION_HINT; denied := hint='supplier_overpayment'; end;
  perform pg_temp.ai_assert(denied,'outstanding rechecked at confirmation');
  perform pg_temp.ai_assert((select status='pending_confirmation' from public.daily_records where id=race_payment),'failed confirm is rolled back');

  sale := public.wa_create_daily_record_draft(worker,company,'sale',1500,null,'Synthetic sale',now(),'ai-proof-sale',
    '[{"description":"Synthetic Nyama","quantity":1,"unit":"kilo","unit_amount":1500}]'::jsonb,'cash');
  perform public.wa_confirm_daily_record(worker,company,sale);
  perform pg_temp.ai_assert((select status='confirmed' from public.daily_records where id=sale),'worker own sale confirmed');
  perform pg_temp.ai_assert((select on_hand from public.wa_stock_on_hand(company,'synthetic nyama'))=19,'sale reduces stock');
  perform pg_temp.ai_assert((select outstanding from public.wa_supplier_balances(boss,company,'Synthetic Musa'))=14000,'sale does not change supplier balance');

  other_draft := public.wa_create_daily_record_draft(boss,company,'sale',1000,null,'Boss draft',now(),'ai-proof-boss');
  denied := false;
  begin perform public.wa_confirm_daily_record(worker,company,other_draft);
  exception when others then get stacked diagnostics hint=PG_EXCEPTION_HINT; denied := hint='not_authorized'; end;
  perform pg_temp.ai_assert(denied,'worker cannot confirm another actor draft');
  denied := false;
  begin perform public.wa_confirm_daily_record(outsider,other_company,other_draft);
  exception when others then get stacked diagnostics hint=PG_EXCEPTION_HINT; denied := hint='not_found'; end;
  perform pg_temp.ai_assert(denied,'cross-company confirmation denied');

  perform set_config('request.jwt.claim.sub',boss::text,true);
  perform public.void_daily_record(sale,'Synthetic rollback proof');
  perform public.void_daily_record(payment,'Synthetic rollback proof');
  perform pg_temp.ai_assert((select outstanding from public.wa_supplier_balances(boss,company,'Synthetic Musa'))=20000,'payment void restores liability');
  perform public.void_daily_record(purchase,'Synthetic rollback proof');
  perform pg_temp.ai_assert(not exists(select 1 from public.wa_supplier_balances(boss,company,'Synthetic Musa')),'purchase void clears liability');
  perform pg_temp.ai_assert(coalesce((select on_hand from public.wa_stock_on_hand(company,'synthetic nyama')),0)=0,'void restores stock');

  animal := public.wa_create_whole_animal_procurement_draft(worker,company,'ng''ombe',1,1200000,'Synthetic Musa',null,now(),'ai-proof-animal',null,'Synthetic only');
  perform public.wa_confirm_daily_record(worker,company,animal);
  perform pg_temp.ai_assert(not exists(select 1 from public.daily_record_lines where daily_record_id=animal),'whole animal creates no meat stock');
  payment := public.wa_create_supplier_payment_draft(worker,company,'Synthetic Musa',300000,'cash',now(),'ai-proof-animal-payment');
  perform public.wa_confirm_daily_record(worker,company,payment);
  perform pg_temp.ai_assert((select outstanding from public.wa_supplier_balances(boss,company,'Synthetic Musa'))=900000,'whole animal partial payment leaves 900000');
  perform set_config('request.jwt.claim.sub',boss::text,true);
  perform public.void_daily_record(payment,'Synthetic rollback proof');
  perform public.void_daily_record(animal,'Synthetic rollback proof');
  perform pg_temp.ai_assert(not exists(select 1 from public.wa_supplier_balances(boss,company,'Synthetic Musa')),'whole animal void restores zero');
end;
$proof$;
rollback;
select not exists(select 1 from public.companies where name in ('AI FOUNDATION ROLLBACK ONLY','AI FOUNDATION ROLLBACK OTHER')) as synthetic_companies_absent_after_rollback;
