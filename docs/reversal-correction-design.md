# Reversal & correction of booked petty cash

Status: **implemented** in migrations 0062–0066, behind `companies.reversal_enabled`
(default `false` for every company). The design below is kept as written; what
changed between design and build is listed in **§14 As built**, at the end.

Grounded in the schema as audited on 2026-08-12: `petty_cash_transactions`
(`type` ∈ allocation | expense | adjustment, `status` ∈ pending | accepted |
declined, `receipt_id` ON DELETE SET NULL), the partial unique index
`petty_cash_one_expense_per_receipt (receipt_id) WHERE type='expense'`, the
`petty_cash_apply_transaction` AFTER trigger that moves the balance on entry into
`accepted`, the `petty_cash_guard_balance` BEFORE INSERT guard (FOR UPDATE,
negative amounts only), and the 0053 guards that freeze a booked receipt.

---

## 1. Four distinct operations

| Operation | The mistake | Ledger effect | Receipt outcome |
| --- | --- | --- | --- |
| **Void** | The posting should never have existed — wrong account, a duplicate that slipped through, an approval made in error | one compensating entry, net zero | receipt leaves `confirmed`; goes to `pending_review` or `duplicate` |
| **Reversal** | *The mechanism*, not a user-facing action | one compensating `adjustment` of `+amount` | none by itself |
| **Correction** | The receipt is genuine but a value is wrong (183,024 vs 183,204) | reverse, then re-book the corrected figure | stays `confirmed`, now with the right amount |
| **Replacement** | The wrong receipt was photographed entirely | void the posting | original marked `duplicate`/void; employee submits a **new** receipt that books on its own |

**The rule underneath all four: a posting is never updated and never deleted.**
Every correction is an *appended compensating entry*. The original stays visible,
which is what makes the float auditable and what "never silently rewrite a booked
transaction" actually requires.

---

## 2. When a confirmed petty-cash receipt was wrong

1. Finance opens the receipt and chooses **Reverse** (void) or **Correct**.
2. A reason is required (§6). Nothing proceeds without it.
3. One RPC does all of it in a single transaction:
   - insert the compensating `adjustment`,
   - write the audit row,
   - move the receipt's status/fields as the chosen operation requires.
4. The employee and the other finance users are notified **after commit** (§8).

The employee never reverses. They may **request** a reversal, which notifies
finance and changes no money (§5).

---

## 3. How the ledger records it

The reversal entry is `type = 'adjustment'`, **not** `'expense'`. This is forced
by the existing partial unique index: a second `expense` row for the same
`receipt_id` cannot exist, and that index is exactly what stops double-booking.
`adjustment` is already a permitted `type`, so no enum change is needed.

Proposed columns on `petty_cash_transactions`:

| Column | Purpose |
| --- | --- |
| `reverses_transaction_id uuid` | the expense row being undone; unique where not null → one reversal per posting |
| `reversal_reason text` | required when `reverses_transaction_id` is set |

A correction is then two appended rows:

```
expense     -183,024   receipt R      (original)
adjustment  +183,024   receipt R      reverses → original
expense     -183,204   receipt R      ← blocked by the unique index!
```

**Consequence to design around:** the unique index is on `receipt_id` alone, so
the corrected re-book cannot be another `expense` for the same receipt. Two
options, to be chosen before implementation:

- **(a)** Narrow the index to *unreversed* expenses, so a receipt may hold one
  live expense at a time. Cleaner ledger, but the index predicate must be
  provably correct or double-booking returns.
- **(b)** Post the corrected amount as a second `adjustment` for the delta only
  (`-180` in the example). Fewer moving parts, but the ledger no longer shows one
  row per receipt and reports must sum rather than pick.

**Recommendation: (a)**, because "one live expense per receipt" is the invariant
every other guard already assumes.

---

## 4. Restoring the balance safely

No balance is ever written directly. The existing `petty_cash_apply_transaction`
trigger already adds `new.amount` on entry into `accepted`, so inserting an
`adjustment` of `+amount` restores the float through the same path that reduced
it — one code path, no divergence.

`petty_cash_guard_balance` only blocks *negative* amounts, so a positive reversal
passes untouched. The correction's *re-book* is negative and therefore re-checked
against the (restored) balance, with the same `FOR UPDATE` serialisation. A
correction that increases the amount beyond the float is refused, which is
correct.

The whole RPC takes the account row lock **once, first**, so a reversal and a
concurrent spend cannot interleave.

---

## 5. Permissions

| Role | Reverse / correct | Request reversal | Notes |
| --- | --- | --- | --- |
| `worker` | ❌ never | ✅ | request moves no money |
| project `leader` | ❌ | ✅ | same as worker for money |
| `accountant` | ✅ | ✅ | subject to maker–checker below |
| `owner` | ✅ | ✅ | subject to maker–checker below |

**Maker–checker.** Consistent with the Phase 1b self-approval rule: by default a
user may not reverse a posting they themselves confirmed. A second finance user
does it. For a one-person company the existing `allow_self_approval` flag governs
it, and the audit row is marked `self_approved = true` so the exception is
visible rather than silent.

Enforcement is server-side in the RPC, never in the UI. The trigger functions
stay `REVOKE`d from `anon`/`authenticated`, as they are today.

---

## 6. Mandatory reason

- `reason text NOT NULL`, trimmed length ≥ 10 characters — enough to be a
  sentence, not "err".
- Stored on the adjustment **and** on the audit row.
- Shown to the employee in their notification and on the receipt.
- Enforced by a `CHECK` and by the RPC, so it cannot be bypassed by a direct
  table write.

---

## 7. `receipt_audit_log`

Does not exist today. `whatsapp_audit_log` covers WhatsApp intents only and must
not be overloaded.

```sql
create table receipt_audit_log (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references companies(id),
  receipt_id                uuid references receipts(id) on delete set null,
  actor_id                  uuid references profiles(id),
  event                     text not null,   -- confirmed | reversed | corrected | voided | replaced
  old_status                text,
  new_status                text,
  old_amount                numeric(14,2),
  new_amount                numeric(14,2),
  payment_method            text,
  petty_cash_account_id     uuid references petty_cash_accounts(id),
  petty_cash_transaction_id uuid references petty_cash_transactions(id),
  reason                    text,
  self_approved             boolean not null default false,
  created_at                timestamptz not null default now()
);
```

- Append-only: no UPDATE or DELETE policy for anyone, including finance.
- `receipt_id` is `ON DELETE SET NULL` so history survives even if a receipt is
  later removed — the audit row still names the company, amount and actor.
- Written **inside** the same transaction as the money. If the audit insert
  fails, the reversal fails.
- RLS: readable by `owner`/`accountant` of that company only.

---

## 8. Notifications

| Event | Recipient | Content |
| --- | --- | --- |
| reversal / void | the uploader | amount, receipt, **reason**, what to do next |
| correction | the uploader | old → new amount, reason |
| reversal requested | all finance | who asked, receipt, reason |
| any of the above | other finance users | actor + reason, for visibility |

Written to `app_notifications` **after commit**, and retryable. A failed
notification must never roll back or repeat the financial posting — the
idempotency key in §9 guarantees a retry cannot double-book.

WhatsApp delivery stays outside the database transaction entirely, as it is today.

---

## 9. Idempotency

Three layers, database-first:

1. **Unique index** on `petty_cash_transactions (reverses_transaction_id) WHERE
   reverses_transaction_id IS NOT NULL` — a posting can be reversed exactly once.
   A concurrent double-click loses on the index, not on a race.
2. **Row lock** on the petty-cash account, taken first, serialising reversal
   against any concurrent spend.
3. **Expected-state argument**: the RPC takes the transaction id it intends to
   reverse and refuses if that row is already reversed. A stale browser tab
   cannot reverse "whatever is current".

Re-running an identical reversal returns the existing result rather than
erroring, so a client retry after a dropped connection is safe.

---

## 10. Impact on every financial surface

| Surface | Effect | Risk |
| --- | --- | --- |
| Dashboard totals | receipt leaves `confirmed` (void) or changes amount (correction) → totals move | expected |
| Project expenses | same | expected |
| Petty cash balance | restored via the compensating entry | expected |
| Reimbursements | only `cash_personal` + `confirmed`; a voided receipt drops out | **if `reimbursed_at` is already set, the employee has been paid. Reversal must be BLOCKED and routed to a separate money-recovery decision.** |
| Retirements | `staff_retirement_receipts` is ON DELETE RESTRICT | **a receipt inside a submitted/paid retirement must not be reversed silently; block or require the retirement to be reopened** |
| Exports | recomputed from `confirmed` | expected |
| **Invoices** | `invoice_receipts` is ON DELETE RESTRICT | **highest risk. A generated invoice may already have been sent to a client. Reversing a receipt on a sent invoice changes a document someone else holds. Must be BLOCKED for `sent`/`accepted` invoices; only `draft` may absorb a reversal, and the PDF must be regenerated.** |

The invoice case is the one most likely to be discovered late. It should be a
hard precondition in the RPC, not a warning in the UI.

---

## 11. Fit with the Phase 1b lifecycle

Phase 1b introduces `submitted → confirmed` with `changes_requested` and
`rejected`. Reversal slots in cleanly:

- Before approval (`pending_review`, `submitted`, `changes_requested`) nothing is
  booked, so there is nothing to reverse — `changes_requested` is the correct
  tool and no money moves.
- After `confirmed`, editing is impossible (0053) and reversal is the **only**
  route back. A void returns the receipt to `submitted`, not to `confirmed`, so
  it must be approved again — reversal cannot be used to skip approval.
- `rejected` is terminal and never booked.
- `receipt_audit_log` records Phase 1b transitions and reversals in one history,
  so "what happened to this receipt" is a single query.

---

## 12. Rollback

- All new objects are additive: two nullable columns, one table, two indexes, one
  RPC. Nothing existing is altered.
- Rollback = drop the RPC and the trigger changes. **Adjustment rows already
  written are financial history and are never deleted.**
- Feature flag `companies.reversal_enabled`, default `false`. With it off,
  behaviour is exactly today's: booked receipts are frozen and correction fails
  closed. Companies are enabled one at a time.
- If the narrowed unique index (§3 option a) misbehaves, revert to the current
  index; the only consequence is that corrections are refused until it is fixed —
  fail-closed, no corruption.

---

## 13. Tests required before implementation

**Money**
- reversal restores the exact amount; balance returns to its pre-booking value
- reversal of a reversal is refused
- correction = reverse + re-book; final balance matches the corrected amount
- correction that exceeds the float is refused, and nothing is left half-applied
- concurrent reversal + spend on one account cannot produce a negative balance
- reversal never mutates or deletes the original expense row

**Idempotency**
- double-submitted reversal produces one adjustment
- retry after a dropped connection returns the same result, books nothing new
- stale expected-state argument is refused

**Permissions**
- worker and leader cannot reverse; can request
- self-reversal blocked by default; allowed only with the audited flag
- cross-company reversal refused
- trigger functions still not callable by `authenticated`/`anon`

**Blocking preconditions**
- receipt on a **sent** invoice cannot be reversed
- receipt in a submitted/paid retirement cannot be reversed
- already-reimbursed receipt cannot be reversed

**Audit & lifecycle**
- every operation writes exactly one audit row with all fields populated
- audit insert failure rolls the whole thing back
- notification failure does not roll back and does not double-book
- voided receipt returns to `submitted` (Phase 1b), never straight to `confirmed`
- flag off ⇒ behaviour identical to today

---

## Risk list

1. **Invoices already sent.** Reversing a receipt on a client-facing document.
   Mitigation: hard block on non-draft invoices. *Highest severity.*
2. **Already-reimbursed receipts.** The employee has the money; a ledger reversal
   does not get it back. Mitigation: block, route to a human decision.
3. **Unique-index change (§3a).** Getting the predicate wrong reopens
   double-booking. Mitigation: keep the old index until the new one is proven
   under concurrency tests.
4. **Two-session concurrency still untested in CI.** Carried over from the
   booking work; reversal adds a second writer to the same account row.
   Mitigation: build the local/CI harness before implementing this.
5. **Reversal as an approval bypass.** If a void returned a receipt to
   `confirmed`, it would launder an unapproved change. Mitigation: void returns
   to `submitted`.
6. **Audit gap until Phase 1b.** `receipt_audit_log` does not exist, so today's
   confirmations are unrecorded. Reversal should not ship before it.
7. **Retirement coupling.** `ON DELETE RESTRICT` protects rows but says nothing
   about a *reversed* receipt still sitting in a bundle. Needs an explicit rule.

---

## 14. As built

Seven things differed from the proposal. Each was found by reading production or
by running the tests, not by re-reading the plan.

1. **`receipt_audit_log` already existed** (0055), with the exact columns §7
   proposed and a trigger writing a row on every status change. So the RPC writes
   no audit row of its own: it hands the trigger the right words through
   transaction-local settings (0064), the same mechanism 0058 uses for
   `self_approved`. Otherwise every reversal would have produced **two** rows.

2. **The trigger attributed rows to the wrong person.** Its actor was
   `coalesce(decided_by, submitted_by, auth.uid())`, and on a reversal
   `decided_by` still names whoever *approved* it. A forced actor now wins.

3. **A correction changes no status,** and the trigger listened to
   `UPDATE OF status`, so a correction would have gone unrecorded. It now listens
   to every update and returns early unless the status moved or an event was
   forced.

4. **The "is it booked?" test lives in five places, not four** — the fifth is
   `petty_cash_auto_book_receipt`'s idempotency check. Without it, a receipt that
   was voided, re-submitted and re-approved would silently fail to book again.
   All five moved to "live (unreversed) expense" together in 0063.

5. **A void returns the receipt to `pending_review`, not `submitted`** (§11 said
   `submitted`). Mhandisi Consultancy runs with `approval_flow_enabled = false`,
   where `decide_receipt` raises outright, so a receipt parked in `submitted`
   could never leave it. `pending_review` is actionable under both flag states and
   is *stricter* under an enabled flow: re-submit **and** re-approve.

6. **A positive adjustment acquires no lock.** §4 credited
   `petty_cash_guard_balance` with serialising the reversal, but that trigger is
   `BEFORE INSERT` only and returns early on `amount >= 0`. The RPC therefore
   takes the account row lock explicitly, as its first write-path statement. This
   is load-bearing, not defensive.

7. **The retry path was unreachable** (fixed in 0066). The status check ran
   before the already-reversed check, so a retried call got *"only a confirmed
   receipt has a posting to reverse"* instead of the previous result. No money was
   ever at risk — the unique index and the account lock already made a second
   posting impossible — but §9's promise was not kept until the checks were
   reordered.

Also closed while here: `petty_cash_transactions_insert_finance` let any
accountant `POST` an arbitrary adjustment through PostgREST — no reason, no audit,
no receipt — which would have made the RPC bypassable on the day it shipped. It is
dropped in 0065. Verified safe first: nothing in `src/` or `supabase/functions/`
inserts into that table, and all four petty-cash writers are `SECURITY DEFINER`
owned by `postgres`.

**Still outstanding:** the two-session concurrency harness
(`supabase/tests/two_session_concurrency.sh`) is written but **unrun** — this
machine has neither Docker nor `psql`. Risk 4 stands until it executes in CI.
