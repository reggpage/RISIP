-- Keep duplicate submissions visible while linking them to the original receipt.
-- This lets the UI explain why a receipt is excluded without losing the audit trail.
alter table receipts
  add column if not exists duplicate_of uuid references receipts(id) on delete set null;

create index if not exists receipts_duplicate_of_idx on receipts(duplicate_of);
