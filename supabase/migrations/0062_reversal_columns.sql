-- Reversal & correction, step 1 of 4: the shape only. Nothing behaves differently
-- after this migration -- no predicate moves, no trigger changes, no RPC exists.
--
-- THE RULE THIS ENCODES: a posting's money is never rewritten. amount, type,
-- account_id and receipt_id of an expense row are immutable forever. What a
-- reversal may do is stamp a void marker on it (reversed_at, reversed_by_
-- transaction_id) and append a compensating adjustment that carries the money
-- back. That is how a ledger voids an entry, and it is what lets the "one live
-- expense per receipt" rule be a real unique index in 0063 rather than a
-- trigger counting rows.
--
-- Immutability of the money fields is enforced in 0063 by a trigger, and by the
-- fact that petty_cash_transactions has no UPDATE and no DELETE policy at all --
-- verified in production -- so only a SECURITY DEFINER function can write here.
--
-- SAFE TO APPLY: production holds 0 expense rows and 0 adjustment rows today, so
-- every new column is NULL everywhere and every CHECK is trivially satisfied.
--
-- ROLLBACK (loses nothing -- all columns are unused until 0065)
--   alter table petty_cash_transactions
--     drop column reverses_transaction_id, drop column reversal_reason,
--     drop column reversed_at, drop column reversed_by_transaction_id;
--   drop index petty_cash_one_reversal_per_transaction;
--   alter table companies drop column reversal_enabled;

alter table petty_cash_transactions
  -- set on the compensating adjustment: which posting it undoes
  add column if not exists reverses_transaction_id uuid references petty_cash_transactions(id),
  add column if not exists reversal_reason text,
  -- set on the original expense: the void marker
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by_transaction_id uuid references petty_cash_transactions(id);

-- A reversal always carries a reason a person can read months later. Enforced by
-- CHECK as well as by the RPC, so it cannot be bypassed by a direct write.
alter table petty_cash_transactions
  drop constraint if exists petty_cash_reversal_needs_reason;
alter table petty_cash_transactions
  add constraint petty_cash_reversal_needs_reason check (
    reverses_transaction_id is null
    or coalesce(length(btrim(reversal_reason)), 0) >= 10
  );

-- The void marker is written as a pair or not at all, so a row can never look
-- reversed without naming the entry that reversed it.
alter table petty_cash_transactions
  drop constraint if exists petty_cash_reversed_marker_complete;
alter table petty_cash_transactions
  add constraint petty_cash_reversed_marker_complete check (
    (reversed_at is null) = (reversed_by_transaction_id is null)
  );

-- Nothing reverses itself.
alter table petty_cash_transactions
  drop constraint if exists petty_cash_no_self_reversal;
alter table petty_cash_transactions
  add constraint petty_cash_no_self_reversal check (
    reverses_transaction_id is distinct from id
    and reversed_by_transaction_id is distinct from id
  );

-- A posting can be reversed exactly once. A double-clicked reversal loses here,
-- on an index, rather than in a race.
create unique index if not exists petty_cash_one_reversal_per_transaction
  on petty_cash_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;

-- Per-company kill switch, off for everyone. Mhandisi Consultancy stays off until
-- the flow has been exercised on the test company.
alter table companies
  add column if not exists reversal_enabled boolean not null default false;
