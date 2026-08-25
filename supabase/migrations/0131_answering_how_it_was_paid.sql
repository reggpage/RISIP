-- A shopkeeper writes the sale, sees the total, and then remembers to say how
-- it was paid:
--
--   nimeuza nyama kilo 3
--   -> Nimeelewa ... Jumla TSh 36,000. Nirekodi?
--   cash
--
-- That single word is an answer to the question on the screen, not a new
-- message about nothing. Before this it was neither NDIYO nor HAPANA, so the
-- pending draft simply sat there and the fact was lost.
--
-- Deliberately narrow. It touches ONE field on ONE record, only while that
-- record is still pending_confirmation, and only for the identity's own
-- company. It cannot confirm anything, cannot change an amount, and cannot
-- reach a record that has already been confirmed or voided — a sale whose
-- payment method turns out to have been wrong is corrected the way every other
-- confirmed mistake is, by voiding it.
--
-- "Deni" is refused here for the same reason it is refused everywhere else:
-- credit is not a way of paying, it is debt_issued.
--
-- ROLLBACK: drop function if exists public.wa_set_draft_payment_method(uuid, uuid, uuid, text);

create or replace function public.wa_set_draft_payment_method(
  p_profile_id uuid,
  p_company_id uuid,
  p_daily_record_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_record public.daily_records%rowtype;
begin
  -- Tenancy, exactly as wa_confirm_daily_record derives it.
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  if v_method = 'deni' then
    raise exception 'credit is recorded as debt_issued, not as a payment method'
      using errcode = 'P0001', hint = 'deni_is_not_a_payment_method';
  end if;
  if v_method is null or v_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unsupported payment method' using errcode = 'P0001', hint = 'invalid_payment_method';
  end if;

  select * into v_record
    from public.daily_records
   where id = p_daily_record_id and company_id = p_company_id
   for update;

  if v_record.id is null then
    return jsonb_build_object('updated', false, 'reason', 'not_found');
  end if;
  -- Only a draft. A confirmed record is history.
  if v_record.status <> 'pending_confirmation' then
    return jsonb_build_object('updated', false, 'reason', 'not_pending', 'status', v_record.status);
  end if;
  -- A payment method on a debt would contradict the kind itself.
  if v_record.kind = 'debt_issued' then
    return jsonb_build_object('updated', false, 'reason', 'kind_is_credit');
  end if;

  update public.daily_records
     set payment_method = v_method, updated_at = now()
   where id = v_record.id;

  return jsonb_build_object('updated', true, 'payment_method', v_method, 'kind', v_record.kind);
end;
$fn$;

revoke all on function public.wa_set_draft_payment_method(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_set_draft_payment_method(uuid, uuid, uuid, text) to service_role;
