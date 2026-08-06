-- The receipt UI records how the receipt was paid. Keep this as text with a
-- constraint so the frontend and existing receipt rows remain backwards compatible.
alter table public.receipts
  add column if not exists payment_method text not null default 'cash_personal';

alter table public.receipts
  drop constraint if exists receipts_payment_method_check;

alter table public.receipts
  add constraint receipts_payment_method_check
  check (payment_method in ('cash_personal', 'petty_cash'));
