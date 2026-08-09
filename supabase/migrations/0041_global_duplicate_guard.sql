-- Widen the duplicate-receipt guard from per-company to GLOBAL (cross-company).
-- A TRA fiscal receipt's verification code identifies one real transaction, so the
-- same code must never be claimed twice, even by different companies (double
-- input-VAT claim). The existing 23505 handlers in extract-receipt /
-- batch-extract already look up the original by verification_code alone (not
-- scoped by company), so swapping the index scope is all that's needed.

drop index if exists receipts_company_verification_unique;
create unique index if not exists receipts_global_verification_unique
  on receipts (verification_code)
  where verification_code is not null and status <> 'duplicate';
