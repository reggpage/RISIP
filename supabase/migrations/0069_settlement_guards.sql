-- Three integrity fixes that ship unflagged, because they close holes that are
-- open in production right now on a company with TZS 1,366,749 outstanding.
--
-- FIX 1 -- A WORKER COULD MARK THEMSELVES PAID. Measured, not theorised: as a
-- real worker, through RLS,
--     update receipts set reimbursed_at = now() where id = <their own>;
--     -> 1 row. WORKER MARKED THEMSELVES PAID
-- mark_receipts_reimbursed correctly refuses a worker, but receipts_update_own_any
-- lets somebody update their OWN receipt, any column, any status, and nothing
-- guarded these two.
--
-- Why a trigger and not column privileges: `authenticated` holds a TABLE-level
-- UPDATE grant, and a column-level REVOKE against that is a no-op. Tested:
--     revoke update (reimbursed_at, reimbursed_by) on receipts from authenticated;
--     -> the worker still wrote it.
-- Revoking the table grant and re-granting an explicit column list would work but
-- silently breaks every column added later. The transaction-local marker is the
-- pattern already proven for audit events in 0064.
--
-- FIX 2 -- THE PAID AMOUNT WAS NOT FROZEN. Measured: mark a receipt paid at
-- 64,674, then edit total_amount to 999,999 -- accepted. The receipt then claims a
-- settled figure nobody ever paid. A settled receipt now freezes the five fields
-- that define what was owed and to whom. Vendor, category, date, notes and the
-- rest stay editable: this is not a read-only lock, it is a money-identity lock.
--
-- FIX 3 -- UN-PAYING WAS SILENT. mark_receipts_reimbursed(ids, false) cleared the
-- flag with no reason and no audit row, and because the reversal blocker only
-- reads `reimbursed_at is not null`, un-pay then reverse walked straight through
-- a block that was meant to be hard. It now raises and points at the audited void.
--
-- NOTE ON REVERSAL: a reimbursed receipt is cash_personal and petty-cash reversal
-- requires a petty-cash expense row, so the two paths cannot meet directly. The
-- only bridge was mutating payment_method on a settled receipt, which fix 2 now
-- blocks.
--
-- ROLLBACK (reopens the holes)
--   drop trigger receipts_guard_settlement_bu on receipts;
--   drop trigger receipts_block_delete_when_paid_bd on receipts;
--   -- and restore mark_receipts_reimbursed from 0042

create or replace function public.receipts_guard_settlement()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_payout boolean := coalesce(current_setting('risip.payout', true), '') = 'on';
begin
  -- Fix 1: these two columns belong to the payout RPCs. Not to workers, and not
  -- to finance either -- one door, so there is one place that records the money.
  if (new.reimbursed_at is distinct from old.reimbursed_at
      or new.reimbursed_by is distinct from old.reimbursed_by)
     and not v_payout then
    raise exception 'Reimbursement is recorded by finance through a payout, not by editing the receipt.'
      using errcode = 'P0001', hint = 'payout_only';
  end if;

  -- Fix 2: what was owed, and to whom, is settled history once it is paid.
  if old.reimbursed_at is not null and not v_payout then
    if new.total_amount is distinct from old.total_amount
       or new.payment_method is distinct from old.payment_method
       or new.uploaded_by is distinct from old.uploaded_by
       or new.company_id is distinct from old.company_id
       or new.status is distinct from old.status then
      raise exception 'This receipt has already been paid back to the employee. Void the payout before changing its amount, payer, company, payment source or status.'
        using errcode = 'P0001', hint = 'receipt_settled';
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.receipts_guard_settlement() from public, anon, authenticated;

drop trigger if exists receipts_guard_settlement_bu on receipts;
create trigger receipts_guard_settlement_bu
  before update on receipts
  for each row execute function public.receipts_guard_settlement();

-- reimbursement_payout_items.receipt_id is ON DELETE RESTRICT, so a paid receipt
-- already cannot be deleted. This only turns 23503 into a sentence.
create or replace function public.receipts_block_delete_when_paid()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.reimbursement_payout_items i
              where i.receipt_id = old.id and i.voided_at is null) then
    raise exception 'This receipt has been paid back to the employee and cannot be deleted. Void the payout first.'
      using errcode = 'P0001', hint = 'receipt_settled';
  end if;
  return old;
end $$;

revoke execute on function public.receipts_block_delete_when_paid() from public, anon, authenticated;

drop trigger if exists receipts_block_delete_when_paid_bd on receipts;
create trigger receipts_block_delete_when_paid_bd
  before delete on receipts
  for each row execute function public.receipts_block_delete_when_paid();

-- Keeps working exactly as before for p_paid = true (0070 replaces the body with
-- a delegation to create_reimbursement_payout). It has to set the marker now, or
-- fix 1 would block the very path it is meant to allow.
create or replace function public.mark_receipts_reimbursed(p_receipt_ids uuid[], p_paid boolean default true)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_actor uuid := auth.uid(); v_actor_name text; v_changed integer := 0; r record;
begin
  if not p_paid then
    raise exception 'Un-paying is now an audited void. Use void_reimbursement_payout with a reason instead.'
      using errcode = 'P0001', hint = 'use_void_payout';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then raise exception 'not authorized'; end if;
  v_company := private.auth_company_id();
  if p_receipt_ids is null or array_length(p_receipt_ids, 1) is null then return 0; end if;

  perform set_config('risip.payout', 'on', true);
  update public.receipts
     set reimbursed_at = now(), reimbursed_by = v_actor
   where id = any(p_receipt_ids) and company_id = v_company
     and payment_method = 'cash_personal' and status = 'confirmed'
     and reimbursed_at is null;
  get diagnostics v_changed = row_count;
  perform set_config('risip.payout', '', true);
  if v_changed = 0 then return 0; end if;

  select full_name into v_actor_name from public.profiles where id = v_actor;
  for r in select uploaded_by, count(*) as n, coalesce(sum(total_amount), 0) as amount
             from public.receipts
            where id = any(p_receipt_ids) and company_id = v_company
              and payment_method = 'cash_personal' and status = 'confirmed'
              and reimbursed_at is not null
            group by uploaded_by
  loop
    insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (v_company, r.uploaded_by, v_actor, 'reimbursement_paid', 'You have been paid back',
      'TSh ' || trim(to_char(r.amount, 'FM999,999,999,999,990')) || ' for ' || r.n || ' receipt'
        || case when r.n = 1 then '' else 's' end || ' was marked paid by ' || coalesce(v_actor_name, 'finance') || '.',
      jsonb_build_object('receipt_ids', to_jsonb(p_receipt_ids), 'amount', r.amount, 'paid', true));
  end loop;
  return v_changed;
end $$;

revoke execute on function public.mark_receipts_reimbursed(uuid[], boolean) from public, anon;
grant execute on function public.mark_receipts_reimbursed(uuid[], boolean) to authenticated;
