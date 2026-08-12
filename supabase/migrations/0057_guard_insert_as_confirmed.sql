-- Close the INSERT bypass.
--
-- 0053/0056 guarded UPDATE only, so with approval_flow_enabled = true a direct
-- INSERT with status='confirmed' (batchScan.ts, manualEntry.ts) skipped approval
-- entirely and counted in official totals. Verified before this change:
--     GAP  INSERT-as-confirmed SUCCEEDED with flag on
--
-- With the flag ON a receipt may only be created as 'processing' or
-- 'pending_review'; every later state is reached through submit_receipt and
-- decide_receipt. With the flag OFF nothing changes at all.
--
-- ROLLBACK: recreate the trigger as BEFORE UPDATE only (name
-- receipts_guard_transitions_bu) and restore the 0056 function body.

create or replace function public.receipts_guard_transitions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_booked boolean; v_flag boolean;
begin
  select approval_flow_enabled into v_flag from public.companies where id = new.company_id;
  v_flag := coalesce(v_flag, false);

  if tg_op = 'INSERT' then
    if v_flag and new.status not in ('processing', 'pending_review') then
      raise exception
        'With the approval flow enabled a receipt must be created as processing or pending_review, not %. It has to be submitted and approved.',
        new.status
        using errcode = 'P0001', hint = 'approval_required_on_insert';
    end if;
    return new;
  end if;

  select exists (select 1 from public.petty_cash_transactions
                  where receipt_id = new.id and type = 'expense') into v_booked;

  if v_booked and new.status is distinct from old.status then
    raise exception
      'This receipt is booked against petty cash, so its status cannot change from % to %. Reverse the petty cash entry first.',
      old.status, new.status
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;

  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    if old.status = 'duplicate' then
      raise exception 'A duplicate receipt cannot be confirmed. Resolve the duplicate instead.'
        using errcode = 'P0001', hint = 'invalid_transition_duplicate';
    end if;
    if old.status = 'error' then
      raise exception 'A failed receipt cannot be confirmed directly. Send it back for review so extraction and duplicate checks run again.'
        using errcode = 'P0001', hint = 'invalid_transition_error';
    end if;
    if old.status = 'rejected' then
      raise exception 'A rejected receipt is final and cannot be confirmed.'
        using errcode = 'P0001', hint = 'invalid_transition_rejected';
    end if;

    if v_flag then
      -- decide_receipt is the only thing that sets decided_by.
      if old.status <> 'submitted' or new.decided_by is null then
        raise exception 'With the approval flow enabled a receipt must be submitted and then approved by finance.'
          using errcode = 'P0001', hint = 'approval_required';
      end if;
    end if;
  end if;

  if old.status = 'rejected' and new.status is distinct from 'rejected' then
    raise exception 'A rejected receipt is final.'
      using errcode = 'P0001', hint = 'rejected_is_terminal';
  end if;

  return new;
end $$;

revoke execute on function public.receipts_guard_transitions() from public, anon, authenticated;

drop trigger if exists receipts_guard_transitions_bu on receipts;
create trigger receipts_guard_transitions_biu
  before insert or update on receipts
  for each row execute function public.receipts_guard_transitions();
