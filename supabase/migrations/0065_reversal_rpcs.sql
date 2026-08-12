-- Reversal & correction, step 4 of 4: the only two doors into a booked posting.
--
-- Gated by companies.reversal_enabled, default false everywhere. With the flag
-- off this migration changes nothing: the RPC refuses on its first check and a
-- booked receipt stays frozen exactly as it is today.
--
-- ORDER OF OPERATIONS INSIDE reverse_petty_cash_receipt, and why:
--   1. authorise, validate the reason, take the receipt row lock
--   2. refuse if the receipt is invoiced beyond draft, retired, or reimbursed
--   3. LOCK THE PETTY CASH ACCOUNT. This must be explicit: a positive adjustment
--      returns early from petty_cash_guard_balance and so acquires no lock at
--      all. Everything after this point is serialised against any concurrent
--      spend on the same float.
--   4. append the compensating adjustment (+amount) -- the existing
--      petty_cash_apply_transaction trigger restores the balance through the
--      same path that reduced it. No balance is ever written directly.
--   5. stamp the void marker on the original. Its money is untouched.
--   6. hand the audit trigger the right words (0064) and move the receipt.
--   7. notify, after the money.
--
-- WHY 'pending_review' AND NOT 'submitted': Mhandisi Consultancy runs with
-- approval_flow_enabled = false, where decide_receipt raises outright. A receipt
-- parked in 'submitted' on such a company could never leave it. pending_review is
-- actionable under both flag states, and under an enabled flow it is STRICTER
-- than 'submitted' -- the receipt must be re-submitted AND re-approved -- so a
-- reversal can never launder an unapproved change.
--
-- IDEMPOTENCY, three layers:
--   * unique index on reverses_transaction_id (0062) -- a posting reverses once
--   * the account row lock -- a double click cannot interleave
--   * p_transaction is an expected-state argument: a stale browser tab naming an
--     already-reversed posting gets the previous result back, not a second
--     reversal. A retry after a dropped connection is therefore safe.
--
-- ROLLBACK
--   drop function public.reverse_petty_cash_receipt(uuid,uuid,text,text,numeric);
--   drop function public.request_receipt_reversal(uuid,text);
--   -- and, to restore the direct-insert route:
--   create policy petty_cash_transactions_insert_finance on petty_cash_transactions
--     for insert to authenticated with check (...)  -- see 0031
--   Adjustment rows already written are financial history and are never deleted.

-- ── Finance: reverse or correct ────────────────────────────────────────────
create or replace function public.reverse_petty_cash_receipt(
  p_receipt     uuid,
  p_transaction uuid,
  p_mode        text,            -- 'void' | 'correct'
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
  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt has a posting to reverse'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  -- ── Hard preconditions. Each one means somebody outside this system is
  -- already holding the number, so a ledger entry cannot quietly change it.
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

  -- ── Expected state: the caller names the posting it believes is current.
  select * into v_txn
    from public.petty_cash_transactions
   where id = p_transaction and receipt_id = p_receipt and type = 'expense';
  if not found then
    raise exception 'that petty cash posting does not belong to this receipt'
      using errcode = 'P0001', hint = 'wrong_transaction';
  end if;

  if v_txn.reversed_at is not null then
    -- A retry, a double click, or a stale tab. Return what already happened
    -- rather than booking a second time.
    select current_balance into v_balance
      from public.petty_cash_accounts where id = v_txn.account_id;
    return jsonb_build_object(
      'status', 'already_reversed',
      'adjustment_id', v_txn.reversed_by_transaction_id,
      'balance', v_balance);
  end if;

  -- ── Maker-checker, same rule as Phase 1b approval.
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

  -- ── 3. The lock. Nothing else takes it for a positive adjustment.
  select current_balance into v_balance
    from public.petty_cash_accounts
   where id = v_txn.account_id
     for update;
  if v_balance is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;

  -- ── 4. The compensating entry restores the float through the normal trigger.
  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id,
     status, reverses_transaction_id, reversal_reason)
  values (
    v_txn.account_id, -v_txn.amount, 'adjustment', p_receipt,
    case p_mode when 'void' then 'Reversal of petty cash expense'
                else 'Correction of petty cash expense' end,
    v_actor, v_txn.project_id, 'accepted', v_txn.id, btrim(p_reason))
  returning id into v_adjustment;

  -- ── 5. The void marker. The original's money is never touched.
  update public.petty_cash_transactions
     set reversed_at = now(), reversed_by_transaction_id = v_adjustment
   where id = v_txn.id;

  -- ── 6. One audit row, correct actor, written by the 0064 trigger.
  perform set_config('risip.audit_event',
                     case p_mode when 'void' then 'reversed' else 'corrected' end, true);
  perform set_config('risip.audit_reason', btrim(p_reason), true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_txn', v_adjustment::text, true);
  perform set_config('risip.audit_account', v_txn.account_id::text, true);

  if p_mode = 'void' then
    -- Back to the start of the lifecycle, never straight back to confirmed.
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

    -- Re-book at the corrected figure. This is a negative amount, so
    -- petty_cash_guard_balance re-checks it against the RESTORED balance under
    -- the lock this transaction already holds: a correction that overdraws the
    -- float is refused, and nothing is left half-applied.
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

  -- ── 7. Tell the people affected, after the money.
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

  -- Other finance users see it too, so a reversal is never a private act.
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

-- ── Staff: ask for one. Moves no money, ever. ──────────────────────────────
-- SECURITY DEFINER is required, not decorative: since 0061 a worker cannot read
-- their finance colleagues' profiles, so they cannot address the notification
-- themselves.
create or replace function public.request_receipt_reversal(
  p_receipt uuid,
  p_reason  text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r record; v_actor uuid := auth.uid(); v_name text;
begin
  if coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'say what is wrong with the receipt, in at least 10 characters'
      using errcode = 'P0001', hint = 'reason_required';
  end if;

  select * into r from public.receipts where id = p_receipt;
  if not found then raise exception 'receipt not found' using errcode = 'P0001'; end if;
  if r.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if r.uploaded_by <> v_actor and private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only the person who filed this receipt can ask for it to be reversed'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt can be sent back for reversal'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  select full_name into v_name from public.profiles where id = v_actor;

  -- The only place anything writes receipt_audit_log directly: a request changes
  -- nothing on the receipt, so the 0064 trigger has nothing to fire on. There is
  -- no double-row risk because no trigger covers this event.
  insert into public.receipt_audit_log
    (company_id, receipt_id, actor_id, event, old_status, new_status,
     old_amount, new_amount, payment_method, reason)
  values (r.company_id, p_receipt, v_actor, 'reversal_requested',
          r.status::text, r.status::text, r.total_amount, r.total_amount,
          r.payment_method, btrim(p_reason));

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, p.id, v_actor, 'receipt_reversal_requested',
         'Reversal requested',
         coalesce(v_name, 'A colleague') || ' asked for '
           || coalesce(nullif(r.vendor_name, ''), 'a receipt')
           || ' to be reversed. Reason: ' || btrim(p_reason),
         jsonb_build_object('receipt_id', p_receipt)
    from public.profiles p
   where p.company_id = r.company_id
     and p.role in ('owner', 'accountant')
     and p.deactivated_at is null
     and p.id <> v_actor;

  return 'requested';
end $$;

revoke execute on function public.request_receipt_reversal(uuid, text) from public, anon;
grant execute on function public.request_receipt_reversal(uuid, text) to authenticated;

-- ── Close the direct-insert route ──────────────────────────────────────────
-- This policy let any accountant POST an arbitrary adjustment through PostgREST:
-- no reason, no audit row, no link to a receipt, and no maker-checker. It would
-- have made the RPC above bypassable on the day it shipped.
--
-- Verified safe before dropping: nothing in src/ or supabase/functions/ inserts
-- into this table, and all four petty-cash writers
-- (request_petty_cash_top_up, allocate_project_petty_cash,
--  respond_to_petty_cash_request, cancel_petty_cash_request) are SECURITY
-- DEFINER owned by postgres, which has BYPASSRLS -- proven by the fact that they
-- already UPDATE this table, which has no UPDATE policy at all.
drop policy if exists petty_cash_transactions_insert_finance on petty_cash_transactions;
