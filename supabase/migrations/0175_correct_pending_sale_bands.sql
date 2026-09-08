-- Correct the displayed draft atomically. Never create/confirm another sale.
alter table public.daily_record_audit_log drop constraint daily_record_audit_action_check;
alter table public.daily_record_audit_log add constraint daily_record_audit_action_check
  check (action in ('created', 'confirmed', 'voided', 'draft_corrected'));

create or replace function public.wa_correct_draft_sale_bands(
  p_identity_id uuid, p_profile_id uuid, p_company_id uuid, p_daily_record_id uuid,
  p_expected_record jsonb, p_answers jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_convo public.whatsapp_conversations%rowtype;
  v_record public.daily_records%rowtype;
  v_line public.daily_record_lines%rowtype;
  v_answer jsonb; v_plan jsonb := '[]'; v_change jsonb;
  v_price numeric; v_total numeric; v_count integer;
  v_seen text[] := '{}'; v_key text; v_method text; v_snapshot jsonb; v_lines jsonb;
begin
  if not exists (
    select 1 from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
    join public.company_members m on m.profile_id = p.id and m.company_id = p_company_id and m.deactivated_at is null
    where i.id = p_identity_id and i.profile_id = p_profile_id
      and i.revoked_at is null and p.active_company_id = p_company_id
  ) then raise exception 'inactive_identity' using errcode = 'P0001'; end if;

  select * into v_convo from public.whatsapp_conversations
    where identity_id = p_identity_id and company_id = p_company_id and profile_id = p_profile_id for update;
  if v_convo.identity_id is null or v_convo.expires_at is null or v_convo.expires_at <= now()
    or v_convo.awaiting <> 'payment_source'
    or v_convo.options->>'kind' <> 'daily_record_confirmation'
    or v_convo.options->>'dailyRecordId' is distinct from p_daily_record_id::text
    or v_convo.options->'record' is distinct from p_expected_record then
    return jsonb_build_object('updated', false, 'reason', 'stale_draft');
  end if;
  select * into v_record from public.daily_records
    where id = p_daily_record_id and company_id = p_company_id and recorded_by = p_profile_id for update;
  if v_record.id is null or v_record.status <> 'pending_confirmation'
    or v_record.kind not in ('sale', 'debt_issued') then
    return jsonb_build_object('updated', false, 'reason', 'not_pending_sale');
  end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) not between 1 and 50 then
    return jsonb_build_object('updated', false, 'reason', 'invalid_answers');
  end if;
  -- Validate every change before touching any row. Prices and totals are read
  -- and calculated here; the model supplies only product and canonical band.
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if v_answer->>'field' = 'payment_method' then
      if v_method is not null or v_record.kind = 'debt_issued'
        or coalesce(v_answer->>'value', '') not in ('cash', 'mobile_money', 'bank', 'other') then
        return jsonb_build_object('updated', false, 'reason', 'invalid_payment_method');
      end if;
      v_method := v_answer->>'value';
      continue;
    end if;
    if coalesce(v_answer->>'field', '') <> 'price_band'
      or coalesce(v_answer->>'value', '') not in ('retail', 'wholesale') then
      return jsonb_build_object('updated', false, 'reason', 'unsupported_correction');
    end if;
    v_key := private.product_key(v_answer->>'product');
    if v_key is null or v_key = any(v_seen) then
      return jsonb_build_object('updated', false, 'reason', 'missing_or_duplicate_product');
    end if;
    v_seen := array_append(v_seen, v_key);
    select count(*) into v_count from public.daily_record_lines
      where daily_record_id = v_record.id and private.product_key(description) = v_key;
    if v_count <> 1 then return jsonb_build_object('updated', false, 'reason', 'ambiguous_draft_product'); end if;
    select * into v_line from public.daily_record_lines
      where daily_record_id = v_record.id and private.product_key(description) = v_key for update;
    v_price := null;
    if nullif(btrim(v_line.unit), '') is not null then
      select case when v_answer->>'value' = 'retail' then s.unit_price else s.wholesale_price end
        into v_price from public.wa_price_sale_unit(p_company_id, v_line.description, v_line.unit, v_line.quantity, v_record.occurred_at) s;
    else
      select case when v_answer->>'value' = 'retail' then s.retail_price else s.wholesale_price end
        into v_price from public.wa_product_pricing(p_company_id, array[v_line.description], v_record.occurred_at) s;
    end if;
    if v_price is null or v_price <= 0 then return jsonb_build_object('updated', false, 'reason', 'missing_catalogue_price'); end if;
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('id', v_line.id, 'price', v_price, 'band', v_answer->>'value', 'previous_price', v_line.unit_amount));
  end loop;
  if jsonb_array_length(v_plan) = 0 then return jsonb_build_object('updated', false, 'reason', 'no_band_correction'); end if;
  for v_change in select value from jsonb_array_elements(v_plan) loop
    update public.daily_record_lines set unit_amount = (v_change->>'price')::numeric,
      line_total = round(quantity * (v_change->>'price')::numeric, 2)
      where id = (v_change->>'id')::uuid and daily_record_id = v_record.id;
  end loop;
  select sum(line_total), jsonb_agg(jsonb_build_object('description', description, 'quantity', quantity,
    'unit_amount', unit_amount, 'unit', unit) order by line_number)
    into v_total, v_lines from public.daily_record_lines where daily_record_id = v_record.id;
  update public.daily_records set amount = v_total, payment_method = coalesce(v_method, payment_method), updated_at = now()
    where id = v_record.id;
  v_snapshot := (v_convo.options->'record') || jsonb_build_object('amount', v_total, 'lines', v_lines);
  if v_method is not null then v_snapshot := v_snapshot || jsonb_build_object('paymentMethod', v_method); end if;
  update public.whatsapp_conversations set options = jsonb_set(options, '{record}', v_snapshot),
    updated_at = now(), expires_at = now() + interval '30 minutes' where identity_id = p_identity_id;
  insert into public.daily_record_audit_log(daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
    values(v_record.id, p_company_id, p_profile_id, 'draft_corrected', 'pending_confirmation', 'pending_confirmation',
      jsonb_build_object('changes', v_plan, 'previous_amount', v_record.amount, 'amount', v_total, 'payment_method', v_method));
  return jsonb_build_object('updated', true, 'record', v_snapshot);
end;
$$;
revoke all on function public.wa_correct_draft_sale_bands(uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.wa_correct_draft_sale_bands(uuid, uuid, uuid, uuid, jsonb, jsonb) to service_role;
