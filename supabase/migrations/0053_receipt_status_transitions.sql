-- HOTFIX for a production bug, plus a transition guard.
--
-- BUG (verified): receipts_protect_booked only guarded amount, payment_method,
-- uploaded_by and company_id. It did NOT guard status. So a receipt already
-- booked against petty cash could be moved back to pending_review, and the
-- posting stayed:
--     status=pending_review · txns=1 · balance=400,000 (still reduced)
-- The receipt and the ledger then disagree, and re-confirming later would be
-- refused by the unique index, leaving the float permanently short with nothing
-- on screen to explain it. An earlier report described this as "does not silently
-- reverse", which was measured only by transaction count and was misleading: the
-- status change was accepted.
--
-- FIX 1: a booked receipt's status is immutable. There is no ordinary "unconfirm".
-- Correction must be an audited reversal, which is designed separately; until it
-- exists this fails closed.
--
-- FIX 2: transition matrix into 'confirmed'. Verified against every code path
-- that writes 'confirmed' today:
--     processing     -> confirmed  ALLOWED  extract-receipt/index.ts:289 (trusted
--                                           extraction; duplicate + confidence
--                                           checks have just run)
--     pending_review -> confirmed  ALLOWED  ReceiptDetailModal.tsx:148,
--                                           BatchScanPanel.tsx:118
--     confirmed      -> confirmed  ALLOWED  idempotent, books nothing new
--     INSERT as confirmed          ALLOWED  batchScan.ts:267, manualEntry.ts:37
--     duplicate      -> confirmed  BLOCKED  a duplicate must never be flipped by
--                                           hand into a second petty-cash posting
--     error          -> confirmed  BLOCKED  recovery must return it to
--                                           pending_review so extraction and the
--                                           duplicate guard run again
-- No current code performs either blocked transition, so nothing in the app
-- changes behaviour.
--
-- ROLLBACK (deletes no financial data)
--   drop trigger if exists receipts_guard_transitions_bu on receipts;
--   -- and restore receipts_protect_booked from 0051 if the status rule is unwanted

create or replace function public.receipts_guard_transitions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_booked boolean;
begin
  select exists (
    select 1 from public.petty_cash_transactions
     where receipt_id = new.id and type = 'expense'
  ) into v_booked;

  -- 1. A booked receipt is frozen: its status cannot move at all.
  if v_booked and new.status is distinct from old.status then
    raise exception
      'This receipt is booked against petty cash, so its status cannot change from % to %. Reverse the petty cash entry first.',
      old.status, new.status
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;

  -- 2. Only trusted transitions may reach 'confirmed'.
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    if old.status = 'duplicate' then
      raise exception 'A duplicate receipt cannot be confirmed. Resolve the duplicate instead.'
        using errcode = 'P0001', hint = 'invalid_transition_duplicate';
    end if;
    if old.status = 'error' then
      raise exception 'A failed receipt cannot be confirmed directly. Send it back for review so extraction and duplicate checks run again.'
        using errcode = 'P0001', hint = 'invalid_transition_error';
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.receipts_guard_transitions() from public, anon, authenticated;

-- BEFORE UPDATE so the write is refused rather than corrected after the fact.
-- Ordering note: this fires before receipts_protect_booked (alphabetical among
-- BEFORE triggers), so a blocked transition never reaches the field guard.
drop trigger if exists receipts_guard_transitions_bu on receipts;
create trigger receipts_guard_transitions_bu
  before update on receipts
  for each row execute function public.receipts_guard_transitions();
