-- Found by the 0065 test battery, before any UI existed: the retry path was
-- unreachable.
--
-- 0065 checked "the receipt must be confirmed" BEFORE it checked "this posting
-- has already been reversed". After a successful void the receipt sits at
-- pending_review, so a retried call -- a dropped connection, a double click, a
-- stale tab -- got:
--     only a confirmed receipt has a posting to reverse
-- instead of the previous result. No money was ever at risk: the unique index on
-- reverses_transaction_id and the account lock already made a second posting
-- impossible. But the design promises that an identical retry returns the
-- earlier result rather than an error, and it did not.
--
-- FIX: the expected-state argument is evaluated first. Ordering is now
--   authorise -> lock the receipt -> flag -> resolve the named posting ->
--   already reversed? return it -> status -> blockers -> maker-checker -> money.
--
-- Nothing else changes; the body below is 0065 with those blocks reordered.
--
-- ROLLBACK: re-apply the function from 0065.

create or replace function public.reverse_petty_cash_receipt(
  p_receipt     uuid,
  p_transaction uuid,
  p_mode        text,
  p_reason      text,
  p_new_amount  numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r            record;
  v_txn        record;
  v_actor      uuid := auth.uid();
  v_confirmer  uuid;
  v_adjustment uuid;
  v_expense    uuid;
  v_balance    numeric;
  v_blocker    text;
begin
  if p_mode not in ('void', 'correct') then
    raise exception 'unknown reversal mode %', p_mode using errcode = 'P0001';
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'a reason of at least 10 characters is required to reverse a petty cash entry'
      using errcode = 'P0001', hint = 'reason_required';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may reverse a petty cash entry'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select rc.*, c.reversal_enabled, c.allow_self_approval into r
    from public.receipts rc
    join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt
     for update of rc;
  if not found then raise exception 'receipt not found' using errcode = 'P0001'; end if;
  if r.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if not r.reversal_enabled then
    raise exception 'reversal is not enabled for this company'
      using errcode = 'P0001', hint = 'reversal_disabled';
  end if;

  -- Expected state first: the caller names the posting it believes is current.
  select * into v_txn
    from public.petty_cash_transactions
   where id = p_transaction and receipt_id = p_receipt and type = 'expense';
  if not found then
    raise exception 'that petty cash posting does not belong to this receipt'
      using errcode = 'P0001', hint = 'wrong_transaction';
  end if;

  -- A retry, a double click, or a stale tab. Return what already happened.
  if v_txn.reversed_at is not null then
    select current_balance into v_balance
      from public.petty_cash_accounts where id = v_txn.account_id;
    return jsonb_build_object(
      'status', 'already_reversed',
      'adjustment_id', v_txn.reversed_by_transaction_id,
      'balance', v_balance);
  end if;

  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt has a posting to reverse'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  if r.reimbursed_at is not null then
    v_blocker := 'This receipt has already been reimbursed to the employee. Recover the money first; a reversal does not get it back.';
  elsif exists (
      select 1 from public.invoice_receipts ir
        join public.invoices i on i.id = ir.invoice_id
       where ir.receipt_id = p_receipt and i.status <> 'draft') then
    v_blocker := 'This receipt is on an invoice that has already left draft. Reversing it would change a document the client holds.';
  elsif exists (
      select 1 from public.staff_retirement_receipts srr
        join public.staff_retirements sr on sr.id = srr.retirement_id
       where srr.receipt_id = p_receipt and sr.status <> 'cancelled') then
    v_blocker := 'This receipt is part of a retirement claim. Cancel or reopen the retirement first.';
  end if;
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001', hint = 'reversal_blocked';
  end if;

  v_confirmer := coalesce(r.decided_by, (
    select actor_id from public.receipt_audit_log
     where receipt_id = p_receipt and event = 'confirmed'
     order by created_at desc limit 1));
  if v_confirmer = v_actor and not r.allow_self_approval then
    raise exception 'you confirmed this receipt, so another finance user must reverse it'
      using errcode = 'P0001', hint = 'self_reversal_blocked';
  end if;

  if p_mode = 'correct' then
    if p_new_amount is null or p_new_amount <= 0 then
      raise exception 'a correction needs a positive corrected amount'
        using errcode = 'P0001', hint = 'invalid_amount';
    end if;
    if p_new_amount = r.total_amount then
      raise exception 'the corrected amount is the same as the current one'
        using errcode = 'P0001', hint = 'no_change';
    end if;
  end if;

  -- The lock. Nothing else takes it for a positive adjustment.
  select current_balance into v_balance
    from public.petty_cash_accounts
   where id = v_txn.account_id
     for update;
  if v_balance is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;

  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id,
     status, reverses_transaction_id, reversal_reason)
  values (
    v_txn.account_id, -v_txn.amount, 'adjustment', p_receipt,
    case p_mode when 'void' then 'Reversal of petty cash expense'
                else 'Correction of petty cash expense' end,
    v_actor, v_txn.project_id, 'accepted', v_txn.id, btrim(p_reason))
  returning id into v_adjustment;

  update public.petty_cash_transactions
     set reversed_at = now(), reversed_by_transaction_id = v_adjustment
   where id = v_txn.id;

  perform set_config('risip.audit_event',
                     case p_mode when 'void' then 'reversed' else 'corrected' end, true);
  perform set_config('risip.audit_reason', btrim(p_reason), true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_txn', v_adjustment::text, true);
  perform set_config('risip.audit_account', v_txn.account_id::text, true);

  if p_mode = 'void' then
    update public.receipts
       set status = 'pending_review',
           decision_reason = btrim(p_reason),
           details_confirmed = false,
           submitted_at = null, submitted_by = null,
           decided_at = null, decided_by = null
     where id = p_receipt;
  else
    update public.receipts
       set total_amount = p_new_amount,
           decision_reason = btrim(p_reason)
     where id = p_receipt;

    insert into public.petty_cash_transactions
      (account_id, amount, type, receipt_id, description, created_by, project_id, status)
    values (
      v_txn.account_id, -p_new_amount, 'expense', p_receipt,
      coalesce('Receipt: ' || nullif(r.vendor_name, ''), 'Petty cash expense'),
      r.uploaded_by, r.project_id, 'accepted')
    returning id into v_expense;
  end if;

  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_reason', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_txn', '', true);
  perform set_config('risip.audit_account', '', true);

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, r.uploaded_by, v_actor,
         'receipt_' || p_mode,
         case p_mode when 'void' then 'A receipt was reversed'
                     else 'A receipt amount was corrected' end,
         case p_mode
           when 'void' then 'Your receipt was reversed and the petty cash was returned to your float. Reason: ' || btrim(p_reason)
           else 'Your receipt was corrected from TSh '
                || trim(to_char(r.total_amount, 'FM999,999,999,999,990')) || ' to TSh '
                || trim(to_char(p_new_amount, 'FM999,999,999,999,990')) || '. Reason: ' || btrim(p_reason)
         end,
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode,
                            'adjustment_id', v_adjustment)
   where r.uploaded_by is not null and r.uploaded_by <> v_actor;

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, p.id, v_actor, 'receipt_' || p_mode,
         case p_mode when 'void' then 'Petty cash entry reversed'
                     else 'Petty cash entry corrected' end,
         coalesce((select full_name from public.profiles where id = v_actor), 'A colleague')
           || ' ' || case p_mode when 'void' then 'reversed' else 'corrected' end
           || ' ' || coalesce(nullif(r.vendor_name, ''), 'a receipt')
           || '. Reason: ' || btrim(p_reason),
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode,
                            'adjustment_id', v_adjustment)
    from public.profiles p
   where p.company_id = r.company_id
     and p.role in ('owner', 'accountant')
     and p.deactivated_at is null
     and p.id <> v_actor
     and p.id is distinct from r.uploaded_by;

  select current_balance into v_balance
    from public.petty_cash_accounts where id = v_txn.account_id;

  return jsonb_build_object(
    'status', p_mode,
    'adjustment_id', v_adjustment,
    'expense_id', v_expense,
    'balance', v_balance);
end $$;

revoke execute on function public.reverse_petty_cash_receipt(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.reverse_petty_cash_receipt(uuid, uuid, text, text, numeric) to authenticated;
