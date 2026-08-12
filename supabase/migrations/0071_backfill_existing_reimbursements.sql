-- The two reimbursements that already happened, given a payment record.
--
-- Mhandisi paid two receipts back on 2026-08-09, TZS 360,018 in total, before
-- reimbursement_payouts existed. Without this they would be the only settled
-- receipts in the system with no payment behind them, and voiding one would be
-- impossible.
--
-- WHAT IS PRESERVED, not recomputed: paid_at, paid_by and paid_to all come from
-- the receipt's own reimbursed_at / reimbursed_by / uploaded_by. The backfill
-- date is not used anywhere.
--
-- WHAT IS HONEST GUESSWORK, and labelled as such on every row: amount_paid is the
-- receipt total AT BACKFILL TIME. No payment amount was ever recorded, so this is
-- the best available number and the note says so. method and reference stay NULL
-- -- we do not know how the money moved and will not invent it.
--
-- If a receipt is marked paid with no payer recorded, the backfill RAISES rather
-- than guessing an actor. (Neither of the two rows has that problem; the check is
-- there so a future run cannot quietly attribute money to the wrong person.)
--
-- receipts.reimbursed_at and reimbursed_by are NOT touched. This migration is
-- purely additive: deleting the two payouts restores exactly today's state.
--
-- Verified before applying, in a rolled-back transaction: 2 payouts, 2 items,
-- snapshots totalling 360,018, original payer/date/recipient preserved on both,
-- receipts still marked paid, one audit row each dated when it actually happened,
-- Mhandisi's confirmed total unchanged at 1,726,767, the owed queue unchanged at
-- 11 receipts, nothing arriving voided, and no method or reference invented.
--
-- ROLLBACK
--   delete from receipt_audit_log where event = 'reimbursed' and reason like 'Backfilled from the pre-payout record%';
--   delete from reimbursement_payouts where note like 'Backfilled from the pre-payout record%';  -- items cascade

do $backfill$
declare
  r record;
  v_payout uuid;
  v_note text := 'Backfilled from the pre-payout record (migration 0071). The amount is the receipt total at backfill time; no payment amount was recorded when this receipt was marked paid.';
begin
  for r in
    select rc.id, rc.company_id, rc.uploaded_by, rc.reimbursed_by, rc.reimbursed_at,
           rc.total_amount, rc.payment_method
      from public.receipts rc
     where rc.reimbursed_at is not null
       and not exists (select 1 from public.reimbursement_payout_items i
                        where i.receipt_id = rc.id and i.voided_at is null)
     order by rc.reimbursed_at
  loop
    if r.reimbursed_by is null then
      raise exception 'receipt % is marked paid with no payer recorded; backfill stopped rather than guess', r.id;
    end if;

    insert into public.reimbursement_payouts
      (company_id, paid_to, paid_by, paid_at, total_amount, note)
    values (r.company_id, r.uploaded_by, r.reimbursed_by, r.reimbursed_at, r.total_amount, v_note)
    returning id into v_payout;

    insert into public.reimbursement_payout_items (payout_id, receipt_id, amount_paid, created_at)
    values (v_payout, r.id, r.total_amount, r.reimbursed_at);

    -- Written directly rather than by the trigger, with the ORIGINAL timestamp, so
    -- the history panel reads in the right order. The trigger cannot produce this
    -- row: nothing on the receipt changes.
    insert into public.receipt_audit_log
      (company_id, receipt_id, actor_id, event, old_status, new_status,
       old_amount, new_amount, payment_method, reason, created_at)
    values (r.company_id, r.id, r.reimbursed_by, 'reimbursed', 'confirmed', 'confirmed',
            r.total_amount, r.total_amount, r.payment_method, v_note, r.reimbursed_at);
  end loop;
end $backfill$;
