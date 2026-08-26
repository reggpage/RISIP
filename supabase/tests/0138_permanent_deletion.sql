-- Permanent deletion integration proof. Everything is inside one transaction,
-- so the shared fixture database is unchanged after the test.
begin;

do $test$
declare
  v_home uuid;
  v_owner uuid;
  v_company uuid;
  v_unrelated uuid;
  v_project uuid;
  v_receipt uuid;
  v_invoice uuid;
  v_animal uuid;
  v_breakdown uuid;
begin
  select m.company_id, m.profile_id into v_home, v_owner
    from public.company_members m
   where m.role = 'owner' and m.deactivated_at is null
   order by m.joined_at, m.company_id
   limit 1;
  if v_home is null or v_owner is null then
    raise exception 'deletion fixture needs one active owner';
  end if;

  insert into public.companies (name, hq_location, currency)
  values ('Permanent deletion fixture', 'Test', 'TZS') returning id into v_company;
  insert into public.companies (name, hq_location, currency)
  values ('Permanent deletion unrelated fixture', 'Test', 'TZS') returning id into v_unrelated;
  insert into public.company_members (profile_id, company_id, role)
  values (v_owner, v_company, 'owner');

  insert into public.projects (company_id, name, created_by)
  values (v_company, 'Deletion fixture project', v_owner) returning id into v_project;
  insert into public.receipts (project_id, company_id, uploaded_by, image_url, status)
  values (v_project, v_company, v_owner, 'receipts/fixture.jpg', 'processing') returning id into v_receipt;
  insert into public.invoices (
    project_id, company_id, period_start, period_end, total_amount, tax_amount, generated_by
  ) values (v_project, v_company, current_date, current_date, 100, 0, v_owner)
  returning id into v_invoice;
  insert into public.invoice_receipts (invoice_id, receipt_id) values (v_invoice, v_receipt);

  insert into public.daily_records
    (company_id, recorded_by, source, kind, status, amount, currency, description)
  values (v_company, v_owner, 'app', 'whole_animal_procurement', 'pending_confirmation', 1000, 'TZS', 'fixture animal')
  returning id into v_animal;
  insert into public.whole_animal_procurements
    (daily_record_id, company_id, animal_type, animal_count, purchase_total_snapshot,
     per_animal_cost_snapshot, occurred_at, created_by)
  values (v_animal, v_company, 'ng''ombe', 1, 1000, 1000, now(), v_owner);
  insert into public.daily_records
    (company_id, recorded_by, source, kind, status, amount, currency, description)
  values (v_company, v_owner, 'app', 'whole_animal_breakdown', 'pending_confirmation', 1, 'TZS', 'fixture breakdown')
  returning id into v_breakdown;
  insert into public.whole_animal_breakdowns
    (daily_record_id, source_procurement_daily_record_id, company_id,
     purchase_total_snapshot, occurred_at, created_by)
  values (v_breakdown, v_animal, v_company, 1000, now(), v_owner);
  insert into public.whole_animal_breakdown_outputs
    (breakdown_daily_record_id, line_number, product_key, product_name, unit_key,
     unit_name, quantity, base_quantity, base_unit)
  values (v_breakdown, 1, 'fixture_meat', 'Fixture meat', 'kg', 'kg', 1, 1, 'kg');

  insert into public.whatsapp_messages
    (wa_message_id, phone_e164, profile_id, company_id, kind, status)
  values ('permanent-delete-fixture', '+255700000001', v_owner, v_company, 'text', 'skipped');

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.delete_company_data(v_company, false);

  if exists (select 1 from public.companies where id = v_company)
     or exists (select 1 from public.company_members where company_id = v_company)
     or exists (select 1 from public.projects where company_id = v_company)
     or exists (select 1 from public.receipts where company_id = v_company)
     or exists (select 1 from public.daily_records where company_id = v_company)
     or exists (select 1 from public.whatsapp_messages where company_id = v_company)
     or exists (select 1 from public.whole_animal_procurements where company_id = v_company)
     or exists (select 1 from public.whole_animal_breakdowns where company_id = v_company) then
    raise exception 'company deletion left live fixture rows';
  end if;
  if not exists (select 1 from public.companies where id = v_unrelated)
     or not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'company deletion touched unrelated account data';
  end if;
end;
$test$;

rollback;
