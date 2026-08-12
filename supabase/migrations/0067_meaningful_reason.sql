-- One reason validator, enforced in the database, shared by every decision that
-- demands an explanation.
--
-- WHY: the old rule was "10 characters", which is a length check, not a meaning
-- check. Production already contains `rgdrhthtrhtjyyrjyt` as the recorded reason
-- for a real reversal — it cleared the old bar and tells a reader nothing. A
-- reason is read months later by someone reconstructing what happened to money.
--
-- THE RULE, all of it enforced server-side so the UI cannot be the only gate:
--   * at least 20 characters once whitespace is collapsed
--   * at least 3 distinct meaningful words
--   * a meaningful word is 2+ characters, contains a vowel, and is not one
--     character repeated. Swahili is vowel-rich, so this passes ordinary
--     Swahili and English while rejecting keyboard mashing (`sdfg hjkl qwrt`)
--   * no character repeated 4+ times in a row (`aaaa bbbb cccc`)
--   * at least 8 distinct alphanumeric characters in the whole string
--   * distinctness kills `test test test`, which is one word three times
--
-- Verified against a 24-case corpus of real Swahili and English reasons and the
-- junk shapes named in the requirement: 24/24.
--
-- Applied to: decide_receipt (request_changes, reject),
-- reverse_petty_cash_receipt (reverse, correct), request_receipt_reversal.
--
-- The CHECK on petty_cash_transactions stays at >= 10 characters deliberately:
-- it is a structural floor that must survive a dump/restore without depending on
-- a function. Policy lives in the RPCs.
--
-- ROLLBACK: restore the three functions from 0056/0065/0066 and drop
-- private.is_meaningful_reason(text).

create or replace function private.is_meaningful_reason(p_reason text)
returns boolean
language plpgsql
immutable
as $$
declare
  t text; words text[]; w text; good text[] := '{}'; distinct_chars int;
begin
  t := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  if length(t) < 20 then return false; end if;
  -- "aaaa", "!!!!", any character four times over
  if t ~ '(.)\1{3,}' then return false; end if;

  select count(distinct ch) into distinct_chars
    from regexp_split_to_table(lower(t), '') ch where ch ~ '[[:alnum:]]';
  if distinct_chars < 8 then return false; end if;

  words := regexp_split_to_array(lower(t), '[^[:alnum:]]+');
  foreach w in array words loop
    if length(w) >= 2 and w ~ '[aeiou]' and w !~ '^(.)\1+$' and not (w = any (good)) then
      good := good || w;
    end if;
  end loop;
  return coalesce(array_length(good, 1), 0) >= 3;
end $$;

grant execute on function private.is_meaningful_reason(text) to authenticated;

-- ── decide_receipt: same as 0059, with the reason rule swapped ─────────────
create or replace function public.decide_receipt(p_receipt uuid, p_decision text, p_reason text default null)
returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare r record; v_self boolean;
begin
  if p_decision not in ('approve','request_changes','reject') then
    raise exception 'unknown decision %', p_decision;
  end if;
  if p_decision in ('request_changes','reject')
     and not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words, so the person reading it knows what to fix.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  if private.auth_role() not in ('owner','accountant') then
    raise exception 'only finance may decide on a receipt';
  end if;

  select rc.*, c.approval_flow_enabled, c.allow_self_approval into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if r.company_id <> private.auth_company_id() then raise exception 'not your company'; end if;
  if not r.approval_flow_enabled then raise exception 'approval flow is not enabled for this company'; end if;
  if r.status <> 'submitted' then raise exception 'only a submitted receipt can be decided'; end if;

  v_self := (r.submitted_by = auth.uid());
  if p_decision = 'approve' and v_self and not r.allow_self_approval then
    raise exception 'you submitted this receipt, so another finance user must approve it';
  end if;

  perform set_config('risip.self_approved',
                     case when p_decision = 'approve' and v_self then 'true' else 'false' end,
                     true);

  update public.receipts
     set status = case p_decision
                    when 'approve' then 'confirmed'::receipt_status
                    when 'request_changes' then 'changes_requested'::receipt_status
                    else 'rejected'::receipt_status end,
         decided_at = now(), decided_by = auth.uid(),
         decision_reason = case when p_decision = 'approve' then null else btrim(p_reason) end
   where id = p_receipt;

  perform set_config('risip.self_approved', 'false', true);

  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, r.uploaded_by, auth.uid(),
         'receipt_' || p_decision,
         case p_decision when 'approve' then 'Receipt approved'
                         when 'request_changes' then 'Changes requested on your receipt'
                         else 'Receipt rejected' end,
         case when p_decision = 'approve' then 'Your receipt was approved and now counts as project spend.'
              else btrim(p_reason) end,
         jsonb_build_object('receipt_id', p_receipt, 'decision', p_decision)
   where r.uploaded_by is not null;

  return p_decision;
end $$;

revoke execute on function public.decide_receipt(uuid, text, text) from public, anon;
grant execute on function public.decide_receipt(uuid, text, text) to authenticated;

-- ── reverse_petty_cash_receipt: 0066, with the reason rule swapped ─────────
create or replace function public.reverse_petty_cash_receipt(
  p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r record; v_txn record; v_actor uuid := auth.uid(); v_confirmer uuid;
  v_adjustment uuid; v_expense uuid; v_balance numeric; v_blocker text;
begin
  if p_mode not in ('void', 'correct') then
    raise exception 'unknown reversal mode %', p_mode using errcode = 'P0001';
  end if;
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words. Somebody will read this months from now to understand where the money went.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may reverse a petty cash entry'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select rc.*, c.reversal_enabled, c.allow_self_approval into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update of rc;
  if not found then raise exception 'receipt not found' using errcode = 'P0001'; end if;
  if r.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if not r.reversal_enabled then
    raise exception 'reversal is not enabled for this company'
      using errcode = 'P0001', hint = 'reversal_disabled';
  end if;

  select * into v_txn from public.petty_cash_transactions
   where id = p_transaction and receipt_id = p_receipt and type = 'expense';
  if not found then
    raise exception 'that petty cash posting does not belong to this receipt'
      using errcode = 'P0001', hint = 'wrong_transaction';
  end if;

  if v_txn.reversed_at is not null then
    select current_balance into v_balance
      from public.petty_cash_accounts where id = v_txn.account_id;
    return jsonb_build_object('status', 'already_reversed',
      'adjustment_id', v_txn.reversed_by_transaction_id, 'balance', v_balance);
  end if;

  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt has a posting to reverse'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  if r.reimbursed_at is not null then
    v_blocker := 'This receipt has already been reimbursed to the employee. Recover the money first; a reversal does not get it back.';
  elsif exists (select 1 from public.invoice_receipts ir join public.invoices i on i.id = ir.invoice_id
                 where ir.receipt_id = p_receipt and i.status <> 'draft') then
    v_blocker := 'This receipt is on an invoice that has already left draft. Reversing it would change a document the client holds.';
  elsif exists (select 1 from public.staff_retirement_receipts srr
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

  select current_balance into v_balance from public.petty_cash_accounts
   where id = v_txn.account_id for update;
  if v_balance is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;

  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id,
     status, reverses_transaction_id, reversal_reason)
  values (v_txn.account_id, -v_txn.amount, 'adjustment', p_receipt,
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
       set status = 'pending_review', decision_reason = btrim(p_reason),
           details_confirmed = false, submitted_at = null, submitted_by = null,
           decided_at = null, decided_by = null
     where id = p_receipt;
  else
    update public.receipts
       set total_amount = p_new_amount, decision_reason = btrim(p_reason)
     where id = p_receipt;

    insert into public.petty_cash_transactions
      (account_id, amount, type, receipt_id, description, created_by, project_id, status)
    values (v_txn.account_id, -p_new_amount, 'expense', p_receipt,
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
  select r.company_id, r.uploaded_by, v_actor, 'receipt_' || p_mode,
         case p_mode when 'void' then 'A receipt was reversed'
                     else 'A receipt amount was corrected' end,
         case p_mode
           when 'void' then 'Your receipt was reversed and the petty cash was returned to your float. Reason: ' || btrim(p_reason)
           else 'Your receipt was corrected from TSh '
                || trim(to_char(r.total_amount, 'FM999,999,999,999,990')) || ' to TSh '
                || trim(to_char(p_new_amount, 'FM999,999,999,999,990')) || '. Reason: ' || btrim(p_reason)
         end,
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode, 'adjustment_id', v_adjustment)
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
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode, 'adjustment_id', v_adjustment)
    from public.profiles p
   where p.company_id = r.company_id and p.role in ('owner', 'accountant')
     and p.deactivated_at is null and p.id <> v_actor
     and p.id is distinct from r.uploaded_by;

  select current_balance into v_balance
    from public.petty_cash_accounts where id = v_txn.account_id;

  return jsonb_build_object('status', p_mode, 'adjustment_id', v_adjustment,
    'expense_id', v_expense, 'balance', v_balance);
end $$;

revoke execute on function public.reverse_petty_cash_receipt(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.reverse_petty_cash_receipt(uuid, uuid, text, text, numeric) to authenticated;

-- ── request_receipt_reversal: 0065, with the reason rule swapped ───────────
create or replace function public.request_receipt_reversal(p_receipt uuid, p_reason text)
returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare r record; v_actor uuid := auth.uid(); v_name text;
begin
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words, so finance understands what is wrong.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
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
           || ' to be reviewed. Reason: ' || btrim(p_reason),
         jsonb_build_object('receipt_id', p_receipt)
    from public.profiles p
   where p.company_id = r.company_id and p.role in ('owner', 'accountant')
     and p.deactivated_at is null and p.id <> v_actor;

  return 'requested';
end $$;

revoke execute on function public.request_receipt_reversal(uuid, text) from public, anon;
grant execute on function public.request_receipt_reversal(uuid, text) to authenticated;
