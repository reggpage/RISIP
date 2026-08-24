-- RISIP BUCHA, PHASE 1 — the ledger foundation.
--
-- daily_records.kind admitted five values: sale, expense, debt_issued,
-- customer_payment, stock_purchase. A butcher needs at least three more, and
-- the audit found that until this constraint widens, spoilage cannot be
-- recorded AT ALL — not badly, not approximately: there is nowhere to put it.
--
-- Four kinds are added, and each is a genuinely distinct accounting fact that
-- must never be folded into an existing one:
--
--   stock_loss        goods destroyed. NOT an operating expense — it is an
--                     inventory event with an economic loss attached.
--   owner_use         goods taken home. NOT a sale (no revenue) and NOT
--                     spoilage (nothing was destroyed). Stock still leaves.
--   supplier_payable  the business owes a supplier for stock taken on credit.
--                     The mirror image of debt_issued, and the thing
--                     whatsappDailyRecordBatch has been refusing out loud.
--   supplier_payment  money paid to a supplier. Deliberately NOT
--                     customer_payment, which would net a payable against a
--                     receivable and report both wrongly.
--
-- Two columns join them:
--
--   payment_method    manually recorded metadata, nothing more. No gateway,
--                     no verification, no API. NULL means the trader did not
--                     say, and NULL is never guessed.
--   loss_reason       "imeharibika", "imeoza", "imeibiwa" are different facts
--                     about the same lost kilo.
--
-- "deni" is deliberately NOT a payment method. Credit already has an
-- accounting meaning here (debt_issued), and admitting it as a payment method
-- would let the same fact be recorded two incompatible ways.
--
-- ROLLBACK:
--   alter table public.daily_records drop constraint daily_records_payment_method_check;
--   alter table public.daily_records drop column payment_method;
--   alter table public.daily_records drop column loss_reason;
--   alter table public.daily_records drop constraint daily_records_kind_check;
--   alter table public.daily_records add constraint daily_records_kind_check check (
--     kind = any (array['sale','expense','debt_issued','customer_payment','stock_purchase']));

alter table public.daily_records drop constraint if exists daily_records_kind_check;
alter table public.daily_records add constraint daily_records_kind_check check (
  kind = any (array[
    'sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase',
    'stock_loss', 'owner_use', 'supplier_payable', 'supplier_payment'
  ])
);

alter table public.daily_records
  add column if not exists payment_method text,
  add column if not exists loss_reason text;

-- Historical rows keep payment_method NULL. Nothing is back-filled and nothing
-- is inferred: a sale recorded before this column existed did not state how it
-- was paid, and pretending otherwise would invent history.
alter table public.daily_records drop constraint if exists daily_records_payment_method_check;
alter table public.daily_records add constraint daily_records_payment_method_check check (
  payment_method is null or payment_method = any (array['cash', 'mobile_money', 'bank', 'other'])
);

alter table public.daily_records drop constraint if exists daily_records_loss_reason_len;
alter table public.daily_records add constraint daily_records_loss_reason_len check (
  loss_reason is null or length(btrim(loss_reason)) between 1 and 500
);

-- Reporting reads losses and payables by kind over a date range, and the
-- existing index leads on status.
create index if not exists daily_records_company_kind_occurred_idx
  on public.daily_records (company_id, kind, occurred_at desc)
  where status = 'confirmed';

comment on column public.daily_records.payment_method is
  'Manually recorded by the trader: cash, mobile_money, bank, other. NULL means unstated. Never verified against any provider; Risip integrates with no payment gateway.';
comment on column public.daily_records.loss_reason is
  'Why stock was lost, in the trader''s own words. Only meaningful for kind = stock_loss.';
