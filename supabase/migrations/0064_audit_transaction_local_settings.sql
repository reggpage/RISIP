-- Reversal & correction, step 3 of 4: let the ONE audit writer describe a
-- reversal correctly, instead of a second writer racing it.
--
-- TWO BUGS THIS FIXES, both found by reading production rather than the plan:
--
-- 1. DOUBLE ROWS. receipt_audit_log and its trigger already exist (0055). A
--    reversal that moves the receipt's status would make the trigger write a row
--    by itself; an RPC that also inserted one would produce two rows for one
--    event. So the RPC writes none -- it hands the trigger the right words.
--
-- 2. WRONG ACTOR. The trigger attributes the row to
--    coalesce(new.decided_by, new.submitted_by, auth.uid()). On a reversal
--    decided_by still names WHOEVER APPROVED IT, so the reversal would be
--    recorded against the approver rather than the person reversing.
--
-- 3. A CORRECTION CHANGES NO STATUS. The trigger was AFTER UPDATE **OF status**,
--    so a correction -- which only moves total_amount -- would have written no
--    audit row at all. The trigger now listens to every UPDATE and returns early
--    unless the status actually changed or an event was forced.
--
-- The mechanism is the transaction-local setting already proven in 0058 for
-- risip.self_approved: set_config(..., true) is scoped to the current
-- transaction and cannot leak into another session.
--
-- UNCHANGED BEHAVIOUR: with no setting present, this is 0055/0058 exactly -- one
-- row per status change, same label, same actor. Verified against the 19 rows
-- already in the table.
--
-- ROLLBACK
--   restore receipts_write_audit from 0058 and:
--   create trigger receipts_write_audit_aiu after insert or update of status
--     on receipts for each row execute function public.receipts_write_audit();

create or replace function public.receipts_write_audit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_self  boolean;
  v_event text;
  v_reason text;
  v_actor uuid;
  v_txn   uuid;
  v_acct  uuid;
begin
  -- Forced by an RPC that is doing something the status alone cannot describe.
  v_event := nullif(btrim(coalesce(current_setting('risip.audit_event', true), '')), '');

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and v_event is null then
    return new;
  end if;

  v_self   := coalesce(current_setting('risip.self_approved', true), 'false') = 'true';
  v_reason := nullif(btrim(coalesce(current_setting('risip.audit_reason', true), '')), '');
  v_actor  := nullif(btrim(coalesce(current_setting('risip.audit_actor',  true), '')), '')::uuid;
  v_txn    := nullif(btrim(coalesce(current_setting('risip.audit_txn',    true), '')), '')::uuid;
  v_acct   := nullif(btrim(coalesce(current_setting('risip.audit_account',true), '')), '')::uuid;

  insert into public.receipt_audit_log (
    company_id, receipt_id, actor_id, event, old_status, new_status,
    old_amount, new_amount, payment_method, reason, self_approved,
    petty_cash_transaction_id, petty_cash_account_id
  ) values (
    new.company_id, new.id,
    -- A forced actor wins: on a reversal decided_by is the APPROVER, not the
    -- person reversing.
    coalesce(v_actor, new.decided_by, new.submitted_by, auth.uid()),
    coalesce(v_event,
      case new.status
        when 'confirmed' then 'confirmed'
        when 'submitted' then 'submitted'
        when 'changes_requested' then 'changes_requested'
        when 'rejected' then 'rejected'
        else 'status_changed' end),
    case when tg_op = 'UPDATE' then old.status::text else null end,
    new.status::text,
    case when tg_op = 'UPDATE' then old.total_amount else null end,
    new.total_amount, new.payment_method,
    coalesce(v_reason, new.decision_reason),
    v_self,
    v_txn, v_acct
  );
  return new;
end $$;

revoke execute on function public.receipts_write_audit() from public, anon, authenticated;

-- "OF status" would skip a correction, which only moves total_amount. The early
-- return above keeps the extra invocations free.
drop trigger if exists receipts_write_audit_aiu on receipts;
create trigger receipts_write_audit_aiu
  after insert or update on receipts
  for each row execute function public.receipts_write_audit();
