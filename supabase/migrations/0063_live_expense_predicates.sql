-- Reversal & correction, step 2 of 4: teach every "is this receipt booked?" test
-- to mean "is there a LIVE (unreversed) expense?".
--
-- WHY THIS MUST BE ONE MIGRATION: the same test is written out in five places.
-- Change some and not others and the freeze silently stops protecting, or a
-- re-approved receipt never re-books. The five sites, all found by searching
-- production for `type = 'expense'`:
--
--   1. petty_cash_one_expense_per_receipt  (index)  one expense per receipt
--   2. receipts_guard_transitions          status of a booked receipt is frozen
--   3. receipts_protect_booked             amount/payer/source of a booked receipt
--   4. receipts_block_delete_when_booked   a booked receipt cannot be deleted
--   5. petty_cash_auto_book_receipt        idempotency: do not book twice
--
-- The last one was NOT in the reviewed plan, which listed four. Without it a
-- receipt that is voided, re-submitted and re-approved would silently fail to
-- book a second time -- the reversed row would still satisfy the old test -- and
-- the float would never move. Reported rather than left out.
--
-- DOES THE FREEZE WEAKEN? Only through an audited reversal, which is the agreed
-- stop condition. reversed_at can be written by nothing else: petty_cash_
-- transactions has no UPDATE and no DELETE policy for any role, so the only
-- writer is a SECURITY DEFINER function, and 0065 adds exactly one. A receipt
-- with a live expense is frozen exactly as hard as it was before this migration.
--
-- Also added here: petty_cash_protect_money, which makes a posting's money
-- immutable in the database rather than by convention. amount, type, account_id,
-- receipt_id, project_id, description, created_by and created_at can never be
-- edited after insert, and an accepted posting can never leave 'accepted' --
-- because the balance has already moved and only a reversal undoes that. Checked
-- against the two functions that legitimately UPDATE this table
-- (respond_to_petty_cash_request, cancel_petty_cash_request): both touch only
-- status + responded_at, and both act on PENDING allocations only.
--
-- ROLLBACK (deletes no financial data; reversal simply stops working)
--   restore the four function bodies from 0051/0053/0057 and the index from 0050,
--   then: drop trigger petty_cash_protect_money_bu on petty_cash_transactions;

-- ── One definition of "live", used by all four function sites ──────────────
create or replace function private.receipt_has_live_expense(p_receipt uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.petty_cash_transactions
     where receipt_id = p_receipt
       and type = 'expense'
       and reversed_at is null
  );
$$;

revoke execute on function private.receipt_has_live_expense(uuid) from public, anon, authenticated;

-- ── 1. The index ───────────────────────────────────────────────────────────
-- One LIVE expense per receipt. A reversed row no longer occupies the slot, so a
-- correction may re-book; two live expenses remain impossible.
drop index if exists petty_cash_one_expense_per_receipt;
create unique index petty_cash_one_expense_per_receipt
  on petty_cash_transactions (receipt_id)
  where receipt_id is not null and type = 'expense' and reversed_at is null;

-- ── 2. Status freeze ───────────────────────────────────────────────────────
create or replace function public.receipts_guard_transitions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_booked boolean; v_flag boolean;
begin
  select approval_flow_enabled into v_flag from public.companies where id = new.company_id;
  v_flag := coalesce(v_flag, false);

  -- ── INSERT ────────────────────────────────────────────────────────────
  if tg_op = 'INSERT' then
    if v_flag and new.status not in ('processing', 'pending_review') then
      raise exception
        'With the approval flow enabled a receipt must be created as processing or pending_review, not %. It has to be submitted and approved.',
        new.status
        using errcode = 'P0001', hint = 'approval_required_on_insert';
    end if;
    return new;
  end if;

  -- ── UPDATE ────────────────────────────────────────────────────────────
  v_booked := private.receipt_has_live_expense(new.id);

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

-- ── 3. Field freeze ────────────────────────────────────────────────────────
create or replace function public.receipts_protect_booked()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.receipt_has_live_expense(new.id) then
    return new;
  end if;
  if new.total_amount is distinct from old.total_amount
     or new.payment_method is distinct from old.payment_method
     or new.uploaded_by is distinct from old.uploaded_by
     or new.company_id is distinct from old.company_id then
    raise exception 'This receipt has already been booked against petty cash. Reverse the petty cash entry before changing its amount, payer, company or payment source.'
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;
  return new;
end $$;

-- ── 4. Delete block ────────────────────────────────────────────────────────
create or replace function public.receipts_block_delete_when_booked()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if private.receipt_has_live_expense(old.id) then
    raise exception 'This receipt is booked against petty cash and cannot be deleted. Reverse the petty cash entry first.'
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;
  return old;
end $$;

-- ── 5. Auto-book idempotency ───────────────────────────────────────────────
-- Only the "already booked?" test changes. Everything else is 0051 verbatim.
create or replace function public.petty_cash_auto_book_receipt()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_acct uuid;
begin
  if new.status is distinct from 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;
  if new.payment_method is distinct from 'petty_cash' then return new; end if;

  if new.total_amount is null or new.total_amount <= 0 then
    raise exception 'Cannot book petty cash for a receipt with no positive amount.'
      using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  -- petty_cash_accounts is UNIQUE (company_id, user_id), so this resolves to at
  -- most one row. It is a deterministic key, never a "first account" pick.
  select a.id into v_acct
    from public.petty_cash_accounts a
   where a.user_id = new.uploaded_by
     and a.company_id = new.company_id;
  if v_acct is null then
    raise exception 'No petty cash account for this employee in this company. Open one, or change the payment source.'
      using errcode = 'P0001', hint = 'no_petty_cash_account';
  end if;

  -- A reversed expense no longer counts, so a re-approved receipt books again.
  if private.receipt_has_live_expense(new.id) then
    return new;
  end if;

  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id, status)
  values (
    v_acct, -new.total_amount, 'expense', new.id,
    coalesce('Receipt: ' || nullif(new.vendor_name, ''), 'Petty cash expense'),
    new.uploaded_by, new.project_id, 'accepted'
  );
  return new;
end $$;

-- ── A posting's money is immutable ─────────────────────────────────────────
create or replace function public.petty_cash_protect_money()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if new.amount is distinct from old.amount
     or new.type is distinct from old.type
     or new.account_id is distinct from old.account_id
     or new.receipt_id is distinct from old.receipt_id
     or new.project_id is distinct from old.project_id
     or new.description is distinct from old.description
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.reverses_transaction_id is distinct from old.reverses_transaction_id
     or new.reversal_reason is distinct from old.reversal_reason then
    raise exception 'A petty cash posting cannot be edited. Reverse it and post a correcting entry.'
      using errcode = 'P0001', hint = 'posting_immutable';
  end if;

  -- The void marker is written once and never taken back.
  if old.reversed_at is not null
     and (new.reversed_at is distinct from old.reversed_at
          or new.reversed_by_transaction_id is distinct from old.reversed_by_transaction_id) then
    raise exception 'This posting has already been reversed. A reversal cannot be undone or repeated.'
      using errcode = 'P0001', hint = 'already_reversed';
  end if;

  -- The balance has already moved for an accepted posting, so its status is final.
  if old.status = 'accepted' and new.status is distinct from old.status then
    raise exception 'An accepted petty cash posting cannot change status. Reverse it instead.'
      using errcode = 'P0001', hint = 'posting_accepted';
  end if;

  return new;
end $$;

revoke execute on function public.petty_cash_protect_money() from public, anon, authenticated;
revoke execute on function public.receipts_guard_transitions() from public, anon, authenticated;
revoke execute on function public.receipts_protect_booked() from public, anon, authenticated;
revoke execute on function public.receipts_block_delete_when_booked() from public, anon, authenticated;
revoke execute on function public.petty_cash_auto_book_receipt() from public, anon, authenticated;

drop trigger if exists petty_cash_protect_money_bu on petty_cash_transactions;
create trigger petty_cash_protect_money_bu
  before update on petty_cash_transactions
  for each row execute function public.petty_cash_protect_money();
