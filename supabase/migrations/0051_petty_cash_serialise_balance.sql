-- PRODUCTION BUG: two different receipts could both overdraw the same float.
--
-- 0050's guard read the balance without a row lock:
--     select current_balance into bal from petty_cash_accounts where id = ...;
-- Under READ COMMITTED two concurrent confirmations on the SAME account but
-- DIFFERENT receipts both read the pre-commit balance, both pass the check, and
-- both insert. The unique index on receipt_id does not help — the receipt ids
-- differ. Worse, petty_cash_apply_transaction then re-reads current_balance at
-- update time, so the second write lands on the already-reduced balance and the
-- float goes negative.
--
--   balance 500,000 · receipt A 400,000 · receipt B 400,000
--   before: both succeed, balance -300,000
--   after:  one succeeds, the other fails closed, balance 100,000
--
-- FIX: take the account row lock in the guard, before reading. The second
-- transaction blocks there until the first commits, then re-reads the fresh
-- balance and is correctly refused. The lock is held to commit, so the AFTER
-- trigger's read-modify-write is serialised by the same lock.
--
-- Serialising on the account row is deliberate and sufficient: every spend
-- against one float must be ordered, and spends against different floats are
-- independent so they still run in parallel.
--
-- ROLLBACK (restores 0050's function; deletes no financial data)
--   create or replace function public.petty_cash_guard_balance() ... without
--   FOR UPDATE — see 0050_petty_cash_booking.sql. Note this reintroduces the race.

create or replace function public.petty_cash_guard_balance()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare bal numeric;
begin
  if new.amount >= 0 or new.status is distinct from 'accepted' then
    return new;
  end if;

  -- FOR UPDATE serialises every spend against this float.
  select a.current_balance into bal
    from public.petty_cash_accounts a
   where a.id = new.account_id
   for update;

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

-- Schema-qualify every object and drop row_security=off where it is not needed.
-- This function only reads/writes rows it has already scoped by company, and it
-- runs from a trigger on a table the caller has already been authorised to write,
-- so it does not need to bypass RLS.
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

  if exists (select 1 from public.petty_cash_transactions
              where receipt_id = new.id and type = 'expense') then
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

create or replace function public.receipts_protect_booked()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.petty_cash_transactions
                  where receipt_id = new.id and type = 'expense') then
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

-- A booked receipt must not be hard-deleted: petty_cash_transactions.receipt_id is
-- ON DELETE SET NULL, so the row would survive as an orphaned posting with no
-- evidence behind it. Until a reversal flow exists, refuse the delete.
create or replace function public.receipts_block_delete_when_booked()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.petty_cash_transactions
              where receipt_id = old.id and type = 'expense') then
    raise exception 'This receipt is booked against petty cash and cannot be deleted. Reverse the petty cash entry first.'
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;
  return old;
end $$;

drop trigger if exists receipts_block_delete_when_booked_bd on receipts;
create trigger receipts_block_delete_when_booked_bd
  before delete on receipts
  for each row execute function public.receipts_block_delete_when_booked();

-- These run only as trigger bodies. Nothing should be able to call them directly
-- and bypass the receipt-confirmation workflow.
revoke execute on function public.petty_cash_auto_book_receipt() from public, anon, authenticated;
revoke execute on function public.petty_cash_guard_balance() from public, anon, authenticated;
revoke execute on function public.receipts_protect_booked() from public, anon, authenticated;
revoke execute on function public.receipts_block_delete_when_booked() from public, anon, authenticated;
