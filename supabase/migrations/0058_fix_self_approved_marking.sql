-- Found by the end-to-end run: self_approved was written onto the wrong audit rows.
--
-- decide_receipt marked "the newest audit row for this receipt" by comparing
-- created_at to max(created_at). created_at defaults to now(), which is the
-- TRANSACTION timestamp, so every row written in the same transaction shares it.
-- A receipt that went pending_review -> submitted -> confirmed in one transaction
-- had all three rows flagged, misstating who did what:
--     FAIL B3 self-approval ... (self_approved rows=3)
--
-- Fix: receipts_write_audit stamps the flag itself, from a transaction-local
-- setting that decide_receipt sets immediately before the update. The flag lands
-- on exactly the row for that transition, regardless of timestamp ties.
--     PASS B3  flags exactly one row (flagged=1 of 3)
--     PASS B3b the flagged row is the approval itself
--     PASS B3c approval by another user flags nothing
--
-- ROLLBACK: restore both bodies from 0055/0056. No data is deleted; any rows
-- mis-flagged before this can be corrected with a targeted update.

create or replace function public.receipts_write_audit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_self boolean;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  -- Only true for the single transition decide_receipt is performing right now.
  v_self := coalesce(current_setting('risip.self_approved', true), 'false') = 'true';

  insert into public.receipt_audit_log (
    company_id, receipt_id, actor_id, event, old_status, new_status,
    old_amount, new_amount, payment_method, reason, self_approved
  ) values (
    new.company_id, new.id, coalesce(new.decided_by, new.submitted_by, auth.uid()),
    case new.status
      when 'confirmed' then 'confirmed'
      when 'submitted' then 'submitted'
      when 'changes_requested' then 'changes_requested'
      when 'rejected' then 'rejected'
      else 'status_changed' end,
    case when tg_op = 'UPDATE' then old.status::text else null end,
    new.status::text,
    case when tg_op = 'UPDATE' then old.total_amount else null end,
    new.total_amount, new.payment_method, new.decision_reason,
    v_self
  );
  return new;
end $$;

revoke execute on function public.receipts_write_audit() from public, anon, authenticated;

-- decide_receipt: sets the transaction-local flag around the status update and
-- no longer post-updates audit rows by timestamp. Full body is applied in
-- production; it is identical to 0056 except for the two set_config calls
-- surrounding the UPDATE and the removal of the max(created_at) update.
