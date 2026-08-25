begin;

-- Prove the new state against the linked schema without leaving it behind.
alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check check (
    awaiting = any (array[
      'language', 'project', 'payment_source', 'business',
      'product_cost', 'product_analytics', 'logout_confirm',
      'daily_record_quantity'
    ])
  );

create temporary table quantity_followup_results (
  check_name text primary key,
  result text not null
) on commit drop;

do $$
declare
  v_phone constant text := '+255624107354';
  v_identity uuid;
  v_profile uuid;
  v_company uuid;
  v_sale uuid;
  v_debt uuid;
  v_duplicate uuid;
  v_stock_before numeric;
  v_stock_pending numeric;
  v_stock_confirmed numeric;
  v_debt_before numeric;
  v_debt_after numeric;
begin
  select i.id, i.profile_id, p.active_company_id
    into v_identity, v_profile, v_company
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
  if v_identity is null then
    raise exception 'linked owner fixture was not found';
  end if;

  perform public.wa_configure_product_units(
    v_phone, 'Soseji', 'piece', 'packet', 24, 12000,
    '[{"unit":"piece","base_quantity":1,"retail":1000}]'::jsonb
  );
  perform public.wa_configure_product_units(
    v_phone, 'Chakula cha mbwa', 'kilo', 'kilo', 1, 1000,
    '[{"unit":"kilo","base_quantity":1,"retail":2000}]'::jsonb
  );
  perform public.wa_save_business_term(
    v_phone, 'product_alias', 'za mbwa', 'Chakula cha mbwa', null
  );

  insert into public.whatsapp_conversations
    (identity_id, company_id, profile_id, awaiting, receipt_id, options, expires_at)
  values
    (v_identity, v_company, v_profile, 'daily_record_quantity', null,
     '{"kind":"quantity_wanted","ledger":"sale","product":"Soseji","party":null,"paymentMethod":"cash"}'::jsonb,
     now() + interval '30 minutes')
  on conflict (identity_id) do update
    set awaiting = excluded.awaiting,
        options = excluded.options,
        expires_at = excluded.expires_at;

  if exists (
    select 1 from public.daily_records
     where company_id = v_company
       and source_message_id = 'wamid.rollback-0132-sale'
  ) then
    raise exception 'the quantity question created a financial draft too early';
  end if;

  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Soseji') limit 1), 0)
    into v_stock_before;

  v_sale := public.wa_create_daily_record_draft(
    v_profile, v_company, 'sale', 5000, null, null, now(),
    'wamid.rollback-0132-sale',
    '[{"description":"Soseji","quantity":5,"unit":"piece","unit_amount":1000}]'::jsonb,
    'cash', null
  );
  v_duplicate := public.wa_create_daily_record_draft(
    v_profile, v_company, 'sale', 5000, null, null, now(),
    'wamid.rollback-0132-sale',
    '[{"description":"Soseji","quantity":5,"unit":"piece","unit_amount":1000}]'::jsonb,
    'cash', null
  );
  if v_duplicate <> v_sale then
    raise exception 'duplicate message id created a second draft';
  end if;
  if not exists (
    select 1 from public.daily_records
     where id = v_sale
       and kind = 'sale'
       and status = 'pending_confirmation'
       and amount = 5000
       and payment_method = 'cash'
  ) then
    raise exception 'sale draft did not preserve amount, state or cash method';
  end if;
  if not exists (
    select 1 from public.daily_record_lines
     where daily_record_id = v_sale
       and description = 'Soseji'
       and quantity = 5
       and unit = 'piece'
       and stock_base_quantity = 5
  ) then
    raise exception 'sale line did not snapshot five base pieces';
  end if;

  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Soseji') limit 1), 0)
    into v_stock_pending;
  if v_stock_pending <> v_stock_before then
    raise exception 'pending sale moved stock: before %, pending %', v_stock_before, v_stock_pending;
  end if;

  perform public.wa_confirm_daily_record(v_profile, v_company, v_sale);
  select coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Soseji') limit 1), 0)
    into v_stock_confirmed;
  if v_stock_confirmed <> v_stock_before - 5 then
    raise exception 'confirmed sale did not remove five pieces: before %, after %',
      v_stock_before, v_stock_confirmed;
  end if;
  if (select count(*) from public.daily_record_audit_log where daily_record_id = v_sale) <> 2 then
    raise exception 'sale did not write created and confirmed audit rows';
  end if;

  insert into public.whatsapp_conversations
    (identity_id, company_id, profile_id, awaiting, receipt_id, options, expires_at)
  values
    (v_identity, v_company, v_profile, 'daily_record_quantity', null,
     '{"kind":"quantity_wanted","ledger":"debt_issued","product":"Chakula cha mbwa","party":"Juma","paymentMethod":null}'::jsonb,
     now() + interval '30 minutes')
  on conflict (identity_id) do update
    set awaiting = excluded.awaiting,
        options = excluded.options,
        expires_at = excluded.expires_at;

  if not exists (
    select 1 from public.wa_resolve_company_product_read(v_profile, v_company, 'za mbwa')
     where product_name = 'Chakula cha mbwa' and match_kind = 'alias'
  ) then
    raise exception 'company alias did not resolve to the configured product';
  end if;

  select coalesce(sum(case when kind = 'debt_issued' then amount else -amount end), 0)
    into v_debt_before
    from public.daily_records
   where company_id = v_company
     and status = 'confirmed'
     and lower(party_name) = 'juma'
     and kind in ('debt_issued', 'customer_payment');

  v_debt := public.wa_create_daily_record_draft(
    v_profile, v_company, 'debt_issued', 6000, 'Juma', null, now(),
    'wamid.rollback-0132-debt',
    '[{"description":"Chakula cha mbwa","quantity":3,"unit":"kilo","unit_amount":2000}]'::jsonb,
    null, null
  );
  if not exists (
    select 1 from public.daily_records
     where id = v_debt
       and kind = 'debt_issued'
       and party_name = 'Juma'
       and amount = 6000
       and payment_method is null
       and status = 'pending_confirmation'
  ) then
    raise exception 'credit continuation lost ledger, party, amount or unpaid state';
  end if;
  if coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Chakula cha mbwa') limit 1), 0) <> 0 then
    raise exception 'pending credit sale moved stock';
  end if;

  perform public.wa_confirm_daily_record(v_profile, v_company, v_debt);
  if coalesce((select on_hand from public.wa_stock_on_hand(v_company, 'Chakula cha mbwa') limit 1), 0) <> -3 then
    raise exception 'confirmed credit sale did not remove three kilos';
  end if;
  select coalesce(sum(case when kind = 'debt_issued' then amount else -amount end), 0)
    into v_debt_after
    from public.daily_records
   where company_id = v_company
     and status = 'confirmed'
     and lower(party_name) = 'juma'
     and kind in ('debt_issued', 'customer_payment');
  if v_debt_after <> v_debt_before + 6000 then
    raise exception 'Juma receivable did not increase by 6000: before %, after %',
      v_debt_before, v_debt_after;
  end if;
  if (select count(*) from public.daily_record_audit_log where daily_record_id = v_debt) <> 2 then
    raise exception 'debt did not write created and confirmed audit rows';
  end if;

  insert into quantity_followup_results values
    ('sale', format('pending stock=%s; confirmed stock=%s; amount=5000; method=cash',
      v_stock_pending, v_stock_confirmed)),
    ('credit', format('amount=6000; party=Juma; receivable delta=%s; stock=-3',
      v_debt_after - v_debt_before)),
    ('idempotency', format('duplicate returned same id=%s', v_duplicate = v_sale)),
    ('audit', 'created + confirmed rows exist for sale and debt'),
    ('conversation', 'daily_record_quantity accepts safe intent only; no draft before follow-up');
end;
$$;

select check_name, result
  from quantity_followup_results
 order by check_name;

rollback;
