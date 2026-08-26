-- Phase 6 functional proof. Run against the linked database inside a
-- transaction; every fixture is rolled back.
begin;

do $test$
declare
  v_company uuid;
  v_owner uuid;
  v_record uuid;
  v_before_lines bigint;
  v_after_lines bigint;
  v_audit bigint;
begin
  select c.id into v_company from public.companies c order by c.created_at limit 1;
  select m.profile_id into v_owner
    from public.company_members m
   where m.company_id = v_company
     and m.role in ('owner', 'accountant')
     and m.deactivated_at is null
   order by case when m.role = 'owner' then 0 else 1 end
   limit 1;
  if v_company is null or v_owner is null then
    raise exception 'functional fixture needs one company owner';
  end if;

  select count(*) into v_before_lines from public.daily_record_lines;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  v_record := public.create_whole_animal_procurement_draft(
    'ng''ombe', 1, 1200000, 'Phase 6 supplier', 'cash',
    '2026-08-24T09:00:00+03'::timestamptz, 'other',
    'phase6-rollback-whole-cow', 'PHASE6-REF', 'Rollback-only fixture'
  );

  if not exists (
    select 1 from public.daily_records r
     where r.id = v_record and r.kind = 'whole_animal_procurement'
       and r.status = 'pending_confirmation' and r.amount = 1200000
       and r.payment_method = 'cash'
  ) then raise exception 'pending procurement record is wrong'; end if;

  if not exists (
    select 1 from public.whole_animal_procurements p
     where p.daily_record_id = v_record and p.animal_type = 'ng''ombe'
       and p.animal_count = 1 and p.purchase_total_snapshot = 1200000
       and p.per_animal_cost_snapshot = 1200000
  ) then raise exception 'procurement snapshot is wrong'; end if;

  select count(*) into v_after_lines from public.daily_record_lines;
  if v_after_lines <> v_before_lines then
    raise exception 'whole animal created product stock lines';
  end if;

  perform public.confirm_daily_record(v_record);
  if (select status from public.daily_records where id = v_record) <> 'confirmed' then
    raise exception 'procurement did not confirm';
  end if;

  perform public.void_daily_record(
    v_record,
    'Ngombe alinunuliwa kwa majaribio ya Phase 6 tu'
  );
  if (select status from public.daily_records where id = v_record) <> 'voided' then
    raise exception 'procurement did not void';
  end if;

  select count(*) into v_audit
    from public.daily_record_audit_log a
   where a.daily_record_id = v_record
     and a.action in ('created', 'confirmed', 'voided');
  if v_audit <> 3 then raise exception 'expected create/confirm/void audit'; end if;

  if exists (select 1 from public.daily_record_lines where daily_record_id = v_record) then
    raise exception 'confirmed/voided procurement created product stock';
  end if;
end;
$test$;

rollback;
