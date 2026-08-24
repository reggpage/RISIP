-- MEASURED FAILURE, caught by writing a real record rather than reading the
-- schema and assuming:
--
--   wa_create_daily_record_draft(kind := 'stock_loss', amount := 0, …)
--   -> ERROR 23514: violates check constraint "daily_records_amount_check"
--
-- 0121 taught create_daily_record_draft that a spoilage may be valueless, but
-- the TABLE still insisted every record be worth more than nothing. The RPC
-- said yes and the row said no, so the first butcher to report spoiled meat on
-- a product with no recorded buying cost would have been told the record could
-- not be created, with no way to find out why.
--
-- Why zero has to be allowed at all: stock leaving the shelf is the primary
-- fact, and its value is secondary. A shop that has never entered a buying cost
-- for liver can still lose two kilos of it, and refusing that event would leave
-- its stock overstated for ever — the exact number a butcher would use to
-- decide whether anyone is stealing.
--
-- Zero stays impossible for every other kind. A sale of nothing, an expense of
-- nothing or a payment of nothing are all mistakes, and they must keep failing.
--
-- ROLLBACK:
--   alter table public.daily_records drop constraint daily_records_amount_check;
--   alter table public.daily_records add constraint daily_records_amount_check
--     check (amount > (0)::numeric);

alter table public.daily_records drop constraint if exists daily_records_amount_check;
alter table public.daily_records add constraint daily_records_amount_check check (
  case
    when kind in ('stock_loss', 'owner_use') then amount >= 0
    else amount > 0
  end
);

comment on constraint daily_records_amount_check on public.daily_records is
  'Money must be positive, except for goods leaving the shelf with no recorded cost: a spoilage or an owner withdrawal may be worth zero, because the inventory movement is the fact and the value is not always known.';
