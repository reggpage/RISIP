-- The only two doors into a reimbursement. reimbursement_payouts and
-- reimbursement_payout_items have no INSERT, UPDATE or DELETE policy for any
-- role, and 0069 made receipts.reimbursed_at writable only under the
-- transaction-local risip.payout marker, so these functions are the whole surface.
--
-- WHAT A PAYOUT IS: a record that money moved from the company to an employee to
-- settle receipts they had already paid for. It is NOT an expense. The expense was
-- counted when the receipt was confirmed, and nothing in the dashboard, project
-- totals or exports reads reimbursed_at -- verified across every financial read
-- path, and asserted in the tests below. Paying somebody moves no total.
--
-- ONE PAYOUT PAYS ONE PERSON. That is how the money actually moves -- one M-Pesa
-- transfer, one reference -- and it is why a mixed-employee selection is refused
-- rather than silently split.
--
-- THE SNAPSHOT. amount_paid is copied from the receipt at payout time and never
-- changes. Before this, the "paid" amount was read live from receipts.total_amount,
-- which was editable after payment: measured at 64,674 paid, then edited to
-- 999,999 with nothing objecting. 0069 freezes the receipt; this records what was
-- actually handed over.
--
-- AUDIT. One row per receipt, written by the existing receipts_write_audit trigger
-- through the 0064 forced-event mechanism, so there is still exactly one writer of
-- receipt history and no chance of double rows. NOTIFICATION: one per payout, to
-- the employee, never to the person who paid.
--
-- ROLLBACK
--   drop function public.create_reimbursement_payout(uuid[],text,text,text);
--   drop function public.void_reimbursement_payout(uuid,text);
--   -- and restore mark_receipts_reimbursed from 0069.
--   Payout rows already written are financial history and are never deleted.

create or replace function public.create_reimbursement_payout(
  p_receipt_ids uuid[],
  p_method      text default null,   -- cash | mobile_money | bank | other
  p_reference   text default null,
  p_note        text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid(); v_company uuid; v_employee uuid;
  v_total numeric(14,2); v_n int; v_people int; v_payout uuid; v_name text;
  v_wanted int := coalesce(array_length(p_receipt_ids, 1), 0);
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may record a reimbursement payout'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_method is not null and p_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unknown payment method %', p_method using errcode = 'P0001';
  end if;
  if v_wanted = 0 then
    raise exception 'choose at least one receipt to pay'
      using errcode = 'P0001', hint = 'nothing_selected';
  end if;
  v_company := private.auth_company_id();

  -- Ordered lock: two accountants paying the same person cannot interleave.
  perform 1 from public.receipts where id = any(p_receipt_ids) order by id for update;

  select count(*), count(distinct uploaded_by), (array_agg(uploaded_by))[1], coalesce(sum(total_amount), 0)
    into v_n, v_people, v_employee, v_total
    from public.receipts where id = any(p_receipt_ids);
  if v_n <> v_wanted then
    raise exception 'one or more receipts could not be found' using errcode = 'P0001';
  end if;
  if v_people > 1 then
    raise exception 'a payout pays one person. Pay each employee separately.'
      using errcode = 'P0001', hint = 'mixed_employees';
  end if;

  -- Eligibility, all of it, in one pass: same company, confirmed, paid for out of
  -- the employee's own pocket, and not already settled.
  select count(*) into v_n from public.receipts
   where id = any(p_receipt_ids) and company_id = v_company
     and status = 'confirmed' and payment_method = 'cash_personal'
     and reimbursed_at is null;
  if v_n <> v_wanted then
    raise exception 'only confirmed receipts the employee paid for themselves, and not already paid back, can be settled'
      using errcode = 'P0001', hint = 'not_eligible';
  end if;
  if v_total <= 0 then
    raise exception 'nothing to pay: the selected receipts total zero' using errcode = 'P0001';
  end if;

  insert into public.reimbursement_payouts
    (company_id, paid_to, paid_by, total_amount, method, reference, note)
  values (v_company, v_employee, v_actor, v_total, p_method,
          nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''))
  returning id into v_payout;

  -- The snapshot. one_active_payout_per_receipt refuses a second live item, so a
  -- double-clicked payout loses on the index rather than in a race.
  insert into public.reimbursement_payout_items (payout_id, receipt_id, amount_paid)
  select v_payout, r.id, r.total_amount from public.receipts r where r.id = any(p_receipt_ids);

  perform set_config('risip.payout', 'on', true);
  perform set_config('risip.audit_event', 'reimbursed', true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_reason',
    coalesce(nullif(btrim(p_note), ''), 'Paid back to the employee'), true);

  update public.receipts set reimbursed_at = now(), reimbursed_by = v_actor
   where id = any(p_receipt_ids);

  perform set_config('risip.payout', '', true);
  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_reason', '', true);

  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select v_company, v_employee, v_actor, 'reimbursement_paid', 'You have been paid back',
         'TSh ' || trim(to_char(v_total, 'FM999,999,999,999,990')) || ' for ' || v_wanted
           || ' receipt' || case when v_wanted = 1 then '' else 's' end
           || ' was paid by ' || coalesce(v_name, 'finance') || '.'
           || coalesce(' Reference: ' || nullif(btrim(p_reference), ''), ''),
         jsonb_build_object('payout_id', v_payout, 'amount', v_total)
   where v_employee is distinct from v_actor;

  return jsonb_build_object('payout_id', v_payout, 'total_amount', v_total, 'receipts', v_wanted);
end $$;

revoke execute on function public.create_reimbursement_payout(uuid[], text, text, text) from public, anon;
grant execute on function public.create_reimbursement_payout(uuid[], text, text, text) to authenticated;

-- Undoing a payment that did not happen, or happened wrongly. The payout is never
-- deleted: it is stamped voided and stays visible, and the receipts go back into
-- the owed queue.
create or replace function public.void_reimbursement_payout(p_payout uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid := auth.uid(); p record; v_ids uuid[]; v_name text;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may void a reimbursement payout'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words. This says why the employee is owed the money again.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;

  select * into p from public.reimbursement_payouts where id = p_payout for update;
  if not found then raise exception 'payout not found' using errcode = 'P0001'; end if;
  if p.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  -- A retry or a double click gets the previous result, not a second void.
  if p.voided_at is not null then
    return jsonb_build_object('status', 'already_voided', 'payout_id', p_payout);
  end if;

  select array_agg(receipt_id) into v_ids from public.reimbursement_payout_items
   where payout_id = p_payout and voided_at is null;

  update public.reimbursement_payouts
     set voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason)
   where id = p_payout;
  update public.reimbursement_payout_items set voided_at = now()
   where payout_id = p_payout and voided_at is null;

  perform set_config('risip.payout', 'on', true);
  perform set_config('risip.audit_event', 'reimbursement_voided', true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_reason', btrim(p_reason), true);

  update public.receipts set reimbursed_at = null, reimbursed_by = null where id = any(v_ids);

  perform set_config('risip.payout', '', true);
  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_reason', '', true);

  select full_name into v_name from public.profiles where id = v_actor;
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p.company_id, p.paid_to, v_actor, 'reimbursement_voided', 'A payment record was cancelled',
         'TSh ' || trim(to_char(p.total_amount, 'FM999,999,999,999,990'))
           || ' recorded as paid to you was cancelled by ' || coalesce(v_name, 'finance')
           || '. Reason: ' || btrim(p_reason),
         jsonb_build_object('payout_id', p_payout, 'amount', p.total_amount)
   where p.paid_to is distinct from v_actor;

  return jsonb_build_object('status', 'voided', 'payout_id', p_payout,
    'receipts', coalesce(array_length(v_ids, 1), 0));
end $$;

revoke execute on function public.void_reimbursement_payout(uuid, text) from public, anon;
grant execute on function public.void_reimbursement_payout(uuid, text) to authenticated;

-- Compatibility shim. One caller today (src/features/reimbursements), kept so
-- nothing 404s mid-deploy. It filters to eligible receipts exactly as the old
-- version did -- the old RPC skipped what did not apply rather than refusing --
-- and splits a mixed-employee selection into one payout per person instead of
-- rejecting it. Removed once the frontend calls the payout RPC directly.
create or replace function public.mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean default true)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_settled int := 0; r record; v_ids uuid[];
begin
  if not p_paid then
    raise exception 'Un-paying is now an audited void. Use void_reimbursement_payout with a reason instead.'
      using errcode = 'P0001', hint = 'use_void_payout';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then raise exception 'not authorized'; end if;
  if p_receipt_ids is null or array_length(p_receipt_ids, 1) is null then return 0; end if;
  v_company := private.auth_company_id();

  for r in
    select uploaded_by, array_agg(id) as ids
      from public.receipts
     where id = any(p_receipt_ids) and company_id = v_company
       and status = 'confirmed' and payment_method = 'cash_personal'
       and reimbursed_at is null
     group by uploaded_by
  loop
    v_ids := r.ids;
    perform public.create_reimbursement_payout(v_ids, null, null, null);
    v_settled := v_settled + coalesce(array_length(v_ids, 1), 0);
  end loop;

  return v_settled;
end $$;

revoke execute on function public.mark_receipts_reimbursed(uuid[], boolean) from public, anon;
grant execute on function public.mark_receipts_reimbursed(uuid[], boolean) to authenticated;
