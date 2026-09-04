-- The worker can record business activity. The sender must still confirm their
-- own draft with NDIYO; no owner approval step is required. Boss/accountant
-- access to reports is separate from who may enter a daily record.
--
-- Migration 0167 briefly installed a stricter policy that blocked workers at
-- the database boundary. Remove only those two triggers here. Do not rewrite
-- the general billing gate or any unrelated migration history.

drop trigger if exists daily_records_worker_write_gate on public.daily_records;
drop trigger if exists stock_counts_worker_write_gate on public.stock_counts;

comment on function private.refuse_worker_ledger_insert() is
  'Retained for migration compatibility; worker ledger and stock-count inserts '
  'are allowed. Sender confirmation and existing role controls remain in force.';

-- A worker confirms only a draft that they recorded. Owners and accountants
-- retain the existing company-wide confirmation authority.
create or replace function public.confirm_daily_record(p_daily_record_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_record public.daily_records;
  v_balance numeric;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select * into v_record from public.daily_records dr
   where dr.id = p_daily_record_id for update;
  if not found or v_record.company_id <> v_company then
    raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_record.status = 'confirmed' then return v_record.id; end if;
  if v_record.status = 'voided' then
    raise exception 'a voided daily record cannot be confirmed'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if v_role not in ('owner', 'accountant')
     and not (v_role = 'worker' and v_record.recorded_by = v_actor) then
    raise exception 'you can confirm only your own daily record drafts'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  if v_record.kind = 'supplier_payment' then
    perform pg_advisory_xact_lock(hashtextextended(
      v_company::text || ':' || private.product_key(v_record.party_name), 0));
    select coalesce(sum(case
      when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount
      else -r.amount end), 0)
      into v_balance
      from public.daily_records r
     where r.company_id = v_company
       and r.status = 'confirmed'
       and r.party_name is not null
       and private.product_key(r.party_name) = private.product_key(v_record.party_name)
       and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
       and (r.kind <> 'whole_animal_procurement' or r.payment_method is null);
    if v_record.amount > v_balance then
      raise exception 'supplier payment exceeds outstanding balance'
        using errcode = 'P0001', hint = 'supplier_overpayment';
    end if;
  end if;

  update public.daily_records
     set status = 'confirmed', confirmed_by = v_actor, confirmed_at = now(), updated_at = now()
   where id = v_record.id;
  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_record.id, v_company, v_actor, 'confirmed', v_record.status, 'confirmed',
     jsonb_build_object(
       'amount', v_record.amount,
       'currency', v_record.currency,
       'kind', v_record.kind,
       'liability_effect', case
         when v_record.kind in ('supplier_payable', 'whole_animal_procurement')
              and v_record.payment_method is null then v_record.amount
         when v_record.kind = 'supplier_payment' then -v_record.amount
         else 0 end));
  return v_record.id;
end;
$fn$;

-- The WhatsApp stock-count bridge is operational data entry, not a report or
-- approval action. Keep the product/unit/quantity validation; remove only the
-- old finance-role gate.
create or replace function public.wa_record_stock_count(
  p_phone text,
  p_name text,
  p_quantity numeric,
  p_unit text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid;
  v_company uuid;
  v_key text := private.product_key(p_name);
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_declared public.product_units;
  v_previous_base numeric;
  v_previous_reported numeric;
  v_id uuid;
begin
  select i.profile_id, p.active_company_id
    into v_profile, v_company
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;
  if exists (select 1 from public.product_units where company_id = v_company and product_key = v_key) then
    if v_unit is null then
      raise exception 'this product has declared units; say which unit was counted'
        using errcode = 'P0001', hint = 'unit_required';
    end if;
    select * into v_declared from private.product_declared_unit(v_company, v_key, v_unit);
    if v_declared.id is null or not v_declared.can_count then
      raise exception 'the stated unit cannot be used to count this product'
        using errcode = 'P0001', hint = 'unknown_count_unit';
    end if;
  end if;
  select on_hand into v_previous_base from public.wa_stock_on_hand(v_company, p_name) limit 1;
  v_previous_reported := case
    when v_previous_base is null then null
    when v_declared.id is null then v_previous_base
    else round(v_previous_base / v_declared.base_quantity, 6)
  end;
  insert into public.stock_counts
    (company_id, product_key, product_name, quantity, unit, counted_by)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 6), v_unit, v_profile)
  returning id into v_id;
  return jsonb_build_object(
    'id', v_id, 'product', btrim(p_name), 'quantity', round(p_quantity, 6),
    'unit', v_unit, 'previous', v_previous_reported);
end;
$$;

create or replace function public.wa_record_stock_counts(p_phone text, p_items jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_name text;
  v_item jsonb; v_product text; v_key text; v_qty numeric; v_unit text; v_existing text;
  v_saved int := 0;
begin
  select i.profile_id, p.active_company_id, c.name
    into v_profile, v_company, v_name
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join public.companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no counts were given' using errcode = 'P0001', hint = 'no_product';
  end if;
  if jsonb_array_length(p_items) > 120 then
    raise exception 'too many counts in one message' using errcode = 'P0001', hint = 'too_many';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := btrim(coalesce(v_item->>'product', ''));
    v_key := private.product_key(v_product);
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');
    if v_key is null or length(v_key) < 2 then
      raise exception 'a product name is missing' using errcode='P0001', hint='no_product';
    end if;
    if v_qty is null or v_qty < 0 then
      raise exception 'a count cannot be negative' using errcode='P0001', hint='invalid_quantity';
    end if;
    v_existing := private.product_unit(v_company, v_key);
    if v_unit is not null and v_existing is not null and lower(v_unit) <> lower(v_existing) then
      raise exception 'this product is measured in % — count it in %, not in %',
        v_existing, v_existing, v_unit using errcode='P0001', hint='unit_mismatch';
    end if;
    insert into public.stock_counts
      (company_id, product_key, product_name, quantity, unit, counted_by, note)
    values (v_company, v_key, v_product, round(v_qty, 3), coalesce(v_unit, v_existing),
            v_profile, 'WhatsApp bulk count');
    v_saved := v_saved + 1;
  end loop;
  return jsonb_build_object('saved', v_saved, 'company_name', v_name);
end;
$$;

revoke all on function public.confirm_daily_record(uuid) from public, anon;
grant execute on function public.confirm_daily_record(uuid) to authenticated, service_role;
revoke all on function public.wa_record_stock_count(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.wa_record_stock_count(text, text, numeric, text) to service_role;
revoke execute on function public.wa_record_stock_counts(text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_record_stock_counts(text, jsonb) to service_role;
