-- Correct the payment taxonomy, then safely wake the dormant petty-cash booking.
--
-- AUDIT FINDINGS THIS MIGRATION ACTS ON
--   1. payment_method is text + CHECK ('cash_personal','petty_cash'). There is no
--      value for company-funded card/bank payments, so "company card" was being
--      suggested as petty_cash — financially wrong. petty_cash means money issued
--      from a petty-cash float; a company card is company funds and touches no float.
--   2. petty_cash_auto_book_receipt() exists but is attached to NO trigger, so
--      petty-cash receipts never reduce a balance.
--   3. petty_cash_guard_balance() does not exist at all, so nothing prevents a
--      negative balance.
--   4. petty_cash_transactions has NO uniqueness on receipt_id, so idempotency
--      relied on an in-function EXISTS check, which two concurrent transactions
--      can both pass.
--   5. The function swallowed every exception and flipped the receipt to 'error',
--      hiding the reason from whoever was confirming it.
--
-- STATE AT WRITING: 0 petty_cash receipts, 0 expense transactions, 0 negative
-- balances. Rechecked immediately before apply.
--
-- CURRENCY: one currency per company (companies.currency, TZS here) and
-- petty_cash_transactions has no currency column, so a receipt and its account are
-- always in the same currency by construction. No conversion is performed; a
-- multi-currency company would need an explicit design first.
--
-- ROLLBACK (financial data is never deleted by this)
--   drop trigger if exists receipts_book_petty_cash_aiu on receipts;
--   drop trigger if exists petty_cash_guard_balance_bi on petty_cash_transactions;
--   drop trigger if exists receipts_protect_booked_bu on receipts;
--   drop index  if exists petty_cash_one_expense_per_receipt;
--   alter table receipts drop constraint receipts_payment_method_check;
--   alter table receipts add constraint receipts_payment_method_check
--     check (payment_method = any (array['cash_personal','petty_cash']));
--   -- (same for receipts_payment_method_suggested_check)

-- ── 1. Taxonomy: company-funded card is its own thing ──────────────────────
-- Additive to a CHECK constraint: no existing row uses the new value, nothing is
-- rewritten, and every reader that filters on a specific value is unaffected.
--   reimbursements  filter payment_method = 'cash_personal' → company_card excluded
--                   (correct: the company already paid, nobody is owed)
--   petty cash      books only payment_method = 'petty_cash' → company_card books
--                   nothing (correct: a card does not draw on the float)
alter table receipts drop constraint if exists receipts_payment_method_check;
alter table receipts add constraint receipts_payment_method_check
  check (payment_method = any (array['cash_personal', 'petty_cash', 'company_card']));

alter table receipts drop constraint if exists receipts_payment_method_suggested_check;
alter table receipts add constraint receipts_payment_method_suggested_check
  check (payment_method_suggested = any (array['cash_personal', 'petty_cash', 'company_card']));

-- ── 2. Database-level idempotency ──────────────────────────────────────────
-- One booked expense per receipt, enforced by the database rather than by an
-- EXISTS check that two concurrent confirmations could both pass.
create unique index if not exists petty_cash_one_expense_per_receipt
  on petty_cash_transactions (receipt_id)
  where receipt_id is not null and type = 'expense';

-- ── 3. Fail-closed balance guard ───────────────────────────────────────────
-- Runs BEFORE the balance is applied. Blocks the spend rather than allowing a
-- negative float; finance must fund the account or pick the right payment source.
create or replace function public.petty_cash_guard_balance()
returns trigger
language plpgsql security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare bal numeric;
begin
  if new.amount >= 0 or new.status is distinct from 'accepted' then
    return new;
  end if;
  select current_balance into bal from petty_cash_accounts where id = new.account_id;
  if bal is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;
  if bal + new.amount < 0 then
    raise exception
      'Insufficient petty cash: balance is %, this receipt needs %. Top up the account or change the payment source.',
      bal, abs(new.amount)
      using errcode = 'P0001', hint = 'insufficient_petty_cash';
  end if;
  return new;
end $$;

drop trigger if exists petty_cash_guard_balance_bi on petty_cash_transactions;
create trigger petty_cash_guard_balance_bi
  before insert on petty_cash_transactions
  for each row execute function petty_cash_guard_balance();

-- ── 4. Booking, with every precondition explicit ───────────────────────────
create or replace function public.petty_cash_auto_book_receipt()
returns trigger
language plpgsql security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare v_acct uuid;
begin
  -- Only the exact transition INTO confirmed books money. An UPDATE that leaves
  -- an already-confirmed receipt confirmed must not book again.
  if new.status is distinct from 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;

  -- Authoritative payment source only. A *suggested* source never books money:
  -- payment_method is null until a human confirms it.
  if new.payment_method is distinct from 'petty_cash' then return new; end if;

  -- Amount must be real money.
  if new.total_amount is null or new.total_amount <= 0 then
    raise exception 'Cannot book petty cash for a receipt with no positive amount.'
      using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  -- The account must belong to the same company as the receipt. Company isolation
  -- is enforced here because this function runs with row_security off.
  select a.id into v_acct
    from petty_cash_accounts a
   where a.user_id = new.uploaded_by
     and a.company_id = new.company_id;
  if v_acct is null then
    raise exception 'No petty cash account for this employee in this company. Open one, or change the payment source.'
      using errcode = 'P0001', hint = 'no_petty_cash_account';
  end if;

  -- Idempotency is the unique index; this is only a fast path.
  if exists (select 1 from petty_cash_transactions
              where receipt_id = new.id and type = 'expense') then
    return new;
  end if;

  -- Deliberately NOT wrapped in an exception handler. If the balance guard or the
  -- unique index rejects this, the whole UPDATE must fail so confirmation and
  -- booking stay atomic and the user sees the real reason — the old version
  -- swallowed everything and silently flipped the receipt to 'error'.
  insert into petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id, status)
  values (
    v_acct,
    -new.total_amount,
    'expense',
    new.id,
    coalesce('Receipt: ' || nullif(new.vendor_name, ''), 'Petty cash expense'),
    new.uploaded_by,
    new.project_id,
    'accepted'
  );
  return new;
end $$;

drop trigger if exists receipts_book_petty_cash_aiu on receipts;
create trigger receipts_book_petty_cash_aiu
  after insert or update of status, payment_method, total_amount on receipts
  for each row execute function petty_cash_auto_book_receipt();

-- ── 5. Do not let a booked receipt be rewritten underneath its transaction ──
-- Full reversal/correction flow is a separate design. Until then, refuse the edit
-- rather than let the ledger and the receipt disagree.
create or replace function public.receipts_protect_booked()
returns trigger
language plpgsql security definer
set search_path to 'public'
set row_security to 'off'
as $$
begin
  if not exists (select 1 from petty_cash_transactions
                  where receipt_id = new.id and type = 'expense') then
    return new;
  end if;
  if new.total_amount is distinct from old.total_amount
     or new.payment_method is distinct from old.payment_method
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'This receipt has already been booked against petty cash. Reverse the petty cash entry before changing its amount, payer or payment source.'
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;
  return new;
end $$;

drop trigger if exists receipts_protect_booked_bu on receipts;
create trigger receipts_protect_booked_bu
  before update on receipts
  for each row execute function receipts_protect_booked();
