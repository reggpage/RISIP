-- Separate a *suggested* payment source from a *confirmed* one.
--
-- THE PROBLEM
-- receipts.payment_method defaulted to 'cash_personal'. A receipt captured over
-- WhatsApp, where nobody ever said how it was paid, therefore looked exactly like
-- one where the employee deliberately chose "my own money" — the difference that
-- decides whether the company owes them a reimbursement.
--
-- THE SHAPE
--   payment_method            authoritative, and now NULLABLE. Null = nobody has
--                             confirmed it. Everything that already reads this
--                             column keeps working; null simply never matches.
--   payment_method_suggested  a proposal from the caption. Never authoritative,
--                             never counted, only shown as a suggestion.
--   payment_method_reason     why the suggestion was made (audit/debug).
-- Confirmation state is therefore "payment_method IS NOT NULL" — no third flag to
-- drift out of sync.
--
-- IMPACT
--   Existing rows            unchanged: they were chosen in a form, so they stay
--                            confirmed. Only new WhatsApp receipts insert null.
--   Reimbursements queue     filters payment_method = 'cash_personal' AND
--                            status = 'confirmed'; a null never matches, so an
--                            unconfirmed receipt cannot silently become a debt.
--   petty_cash_auto_book_receipt  fixed below. Its guard used `<> 'petty_cash'`,
--                            which is NULL for a null payment_method, so the early
--                            return would NOT fire and a confirmed receipt with no
--                            payment source would have been booked as petty cash
--                            spend. `IS DISTINCT FROM` restores the intent.
--   Web / batch / email      unchanged: those paths still set a real value.
--
-- ROLLBACK
--   update receipts set payment_method = 'cash_personal' where payment_method is null;
--   alter table receipts alter column payment_method set not null;
--   alter table receipts drop column payment_method_suggested, drop column payment_method_reason;
--   -- then restore petty_cash_auto_book_receipt from 0027_add_receipt_payment_method.sql

alter table receipts
  alter column payment_method drop not null,
  alter column payment_method drop default,
  add column if not exists payment_method_suggested text
    check (payment_method_suggested in ('cash_personal', 'petty_cash')),
  add column if not exists payment_method_reason text;

comment on column receipts.payment_method is
  'Confirmed payment source. NULL means nobody has confirmed it yet; such a receipt '
  'must not be treated as a reimbursement or as petty cash spend.';
comment on column receipts.payment_method_suggested is
  'Proposal only, e.g. parsed from a WhatsApp caption. Never authoritative.';

-- NULL-safe guard. Without IS DISTINCT FROM, a null payment_method made the
-- condition NULL and the early return was skipped.
create or replace function public.petty_cash_auto_book_receipt()
returns trigger
language plpgsql security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare acct_id uuid;
begin
  if new.status <> 'confirmed' or new.payment_method is distinct from 'petty_cash' then
    return new;
  end if;
  if exists (select 1 from petty_cash_transactions where receipt_id = new.id) then
    return new;
  end if;
  select id into acct_id from petty_cash_accounts where user_id = new.uploaded_by;
  if acct_id is null then
    return new;
  end if;
  begin
    insert into petty_cash_transactions (account_id, amount, type, receipt_id, description, created_by)
    values (
      acct_id,
      -coalesce(new.total_amount, 0),
      'expense',
      new.id,
      coalesce('Receipt: ' || nullif(new.vendor_name, ''), 'Petty cash expense'),
      new.uploaded_by
    );
  exception when others then
    update receipts
       set status = 'error',
           raw_ai_response = coalesce(raw_ai_response, '{}'::jsonb)
             || jsonb_build_object('error', 'petty_cash_exceeded', 'detail', SQLERRM)
     where id = new.id;
  end;
  return new;
end;
$function$;
