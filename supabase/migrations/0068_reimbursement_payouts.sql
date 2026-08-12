-- Paying staff back, recorded as a payment rather than a checkbox.
--
-- WHAT WAS THERE BEFORE: receipts.reimbursed_at + reimbursed_by, set by
-- mark_receipts_reimbursed. That works, and Mhandisi has been using it -- 2 paid,
-- TZS 360,018 -- but it cannot record what was actually paid. Three things forced
-- a record of its own:
--
--   1. The paid amount was read from receipts.total_amount, which stays editable.
--      Measured: after marking a receipt paid, finance changed the amount to
--      999,999 and nothing objected. What you paid was written down nowhere.
--   2. One payment settles several receipts for one person -- the queue already
--      groups that way. A reference held per receipt would be the same M-Pesa code
--      copied six times.
--   3. No payment reference, no note, and no audit row at all: both existing
--      reimbursements have audit_rows = 0.
--
-- WHAT THIS IS NOT: a ledger. There are no balances here and no double entry,
-- because the expense was already counted when the receipt was confirmed.
-- Reimbursement is settlement of a debt to the employee, not a second expense.
-- Nothing in the dashboard, project totals or exports reads reimbursed_at --
-- verified across every financial read path -- so paying somebody moves no total.
--
-- receipts.reimbursed_at and reimbursed_by STAY, maintained by the payout RPCs as
-- a derived marker, so the unreimbursed index, the finance queue, OwedToMeCard and
-- the reversal blocker keep working untouched.
--
-- ROLLBACK (additive; deleting the tables restores exactly today's behaviour)
--   drop table reimbursement_payout_items; drop table reimbursement_payouts;
--   alter table companies drop column payouts_enabled;

create table if not exists reimbursement_payouts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  -- the employee being paid back, and the finance user who paid them
  paid_to      uuid not null references profiles(id) on delete restrict,
  paid_by      uuid not null references profiles(id) on delete restrict,
  paid_at      timestamptz not null default now(),
  total_amount numeric(14,2) not null check (total_amount > 0),
  -- how the money actually moved. Optional: a company paying cash from a drawer
  -- has nothing to reference.
  method       text check (method in ('cash', 'mobile_money', 'bank', 'other')),
  reference    text,
  note         text,
  -- a payout is never deleted; a mistake is voided and stays visible
  voided_at    timestamptz,
  voided_by    uuid references profiles(id) on delete set null,
  void_reason  text,
  created_at   timestamptz not null default now(),
  constraint payout_void_marker_complete check ((voided_at is null) = (voided_by is null)),
  constraint payout_void_needs_reason check (
    voided_at is null or coalesce(length(btrim(void_reason)), 0) >= 10
  )
);

create table if not exists reimbursement_payout_items (
  id          uuid primary key default gen_random_uuid(),
  payout_id   uuid not null references reimbursement_payouts(id) on delete cascade,
  -- ON DELETE RESTRICT on purpose: a receipt somebody has been paid for must not
  -- be deletable out from under the payment record.
  receipt_id  uuid not null references receipts(id) on delete restrict,
  -- The snapshot. This is what was paid, and it never changes, whatever happens
  -- to the receipt afterwards.
  amount_paid numeric(14,2) not null check (amount_paid > 0),
  -- Stamped when the parent payout is voided. It lives on the ITEM because a
  -- partial unique index cannot read the parent's state -- the same shape as the
  -- reversed_at marker on petty_cash_transactions.
  voided_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- One live payment per receipt. A double-clicked payout loses here, on an index,
-- rather than in a race. A voided item frees the receipt to be paid again.
create unique index if not exists one_active_payout_per_receipt
  on reimbursement_payout_items (receipt_id) where voided_at is null;

create index if not exists reimbursement_payouts_company_idx on reimbursement_payouts (company_id, paid_at desc);
create index if not exists reimbursement_payouts_person_idx on reimbursement_payouts (paid_to, paid_at desc);
create index if not exists reimbursement_payout_items_payout_idx on reimbursement_payout_items (payout_id);

alter table reimbursement_payouts enable row level security;
alter table reimbursement_payout_items enable row level security;

-- Finance sees the company's payments. An employee sees only the payments made to
-- them -- enough to answer "have I been paid back?", not a view of the payroll.
drop policy if exists reimbursement_payouts_select on reimbursement_payouts;
create policy reimbursement_payouts_select on reimbursement_payouts
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and (
      paid_to = auth.uid()
      or private.auth_role() = any (array['owner', 'accountant']::user_role[])
    )
  );

drop policy if exists reimbursement_payout_items_select on reimbursement_payout_items;
create policy reimbursement_payout_items_select on reimbursement_payout_items
  for select to authenticated
  using (exists (
    select 1 from reimbursement_payouts p
     where p.id = reimbursement_payout_items.payout_id
  ));

-- No INSERT, UPDATE or DELETE policy for anybody, including finance. The RPCs in
-- 0070 are the only writers, exactly as with petty_cash_transactions after 0065.

-- Per-company switch for the richer payout UI (reference, note, void, history).
-- Off everywhere: with it off the Reimbursements page behaves as it does today.
alter table companies
  add column if not exists payouts_enabled boolean not null default false;
