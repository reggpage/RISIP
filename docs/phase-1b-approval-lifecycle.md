# Phase 1b — receipt approval lifecycle (design only, not implemented)

## 1. States

| State | Meaning | In official totals |
| --- | --- | --- |
| `processing` | extraction running | no |
| `pending_review` | captured; details incomplete or unchecked | no |
| `submitted` | the uploader completed it and sent it to finance | **no** |
| `changes_requested` | finance sent it back with a reason; editable again | **no** |
| `rejected` | **terminal.** Finance refused it, with a reason | **no** |
| `confirmed` | approved. **The only state counted as project spend** | **yes** |
| `duplicate`, `error` | terminal, from extraction | no |

```
processing ──▶ pending_review ──▶ submitted ──▶ confirmed
                                     │  ▲            (terminal, counted)
                                     │  └── changes_requested ──┘
                                     └────▶ rejected  (terminal)
processing ──▶ duplicate | error
```

Only `confirmed` enters totals. `submitted`, `changes_requested`, `rejected` and
`pending_review` all stay out — the same rule `pending_review` follows today, so
dashboards need no new logic, only awareness of the new names.

## 2. Who may do what

Roles come from the existing model (`profiles.role`, plus `project_members.role`
for leaders). No new role is introduced.

| Action | Allowed |
| --- | --- |
| review + **submit** | the uploader; finance may submit on someone's behalf |
| **approve** (→ `confirmed`) | `owner`, `accountant` — never a `worker` |
| **reject** (→ `rejected`) | `owner`, `accountant`; **reason required** |
| **request changes** | `owner`, `accountant`; **reason required** |
| re-submit after changes | the uploader |

A `worker` can never approve, reject or request changes, in any company, under
any configuration.

## 3. Self-approval (maker–checker)

**Default: a user may not approve a receipt they submitted.** Approval must come
from a different authorised finance user. This is the whole point of the
separation — an accountant expensing their own fuel should not sign it off.

**One-person companies.** Requiring a second person would make Risip unusable for
a sole owner, who is the most common first customer. So:

- `companies.allow_self_approval boolean not null default false`.
- When a company has **exactly one** active `owner`/`accountant`, the flag may be
  turned on by that owner, and the app explains plainly what it disables.
- Every self-approval writes an audit row flagged `self_approved = true`, so the
  exception is visible in history rather than silent.
- **Existing companies today:** every current company has one owner, so with the
  flag defaulting to `false` they would be unable to approve their own receipts.
  Migration therefore sets `allow_self_approval = true` for companies with a
  single finance user at rollout, and `false` where there are two or more. Nobody
  is locked out, and multi-person companies get the safe default.

## 4. Interaction with `details_confirmed`

`details_confirmed` (0044) currently means "a human has chosen project, category
and payment source". In Phase 1b that is exactly the **precondition for
`submitted`**, not a parallel status.

Treatment:

- Keep the column. It stays the gate on the *submit* action.
- `submitted` may only be entered when `details_confirmed = true`, `project_id is
  not null` and `payment_method is not null`. Enforced in the RPC, not the UI.
- Backfill: rows already `confirmed` keep `details_confirmed = true`. No row
  changes state during migration.
- Once the lifecycle is live, `details_confirmed` becomes derivable and can be
  dropped in a later cleanup — deliberately **not** in this migration, so the
  change stays reversible.

## 5. Audit and notifications

Every transition writes one row: actor, from → to, reason, timestamp, receipt,
company. `whatsapp_audit_log` generalises to `receipt_audit_log` so web, batch,
email and WhatsApp all land in one history.

| Transition | Notified |
| --- | --- |
| → `submitted` | all active `owner`/`accountant` in the company |
| → `confirmed` | the uploader |
| → `changes_requested` | the uploader, **with the reason** |
| → `rejected` | the uploader, **with the reason** |

`changes_requested` and `rejected` are refused without a non-empty reason.

## 6. Migration, flag and rollback

- `alter type receipt_status add value` for `submitted`, `changes_requested`,
  `rejected` — additive; **no existing row changes**.
- `receipts.submitted_at/by`, `approved_at/by`, `decision_reason`.
- `companies.approval_flow_enabled boolean not null default false`.

**With the flag off, behaviour is byte-for-byte what it is today** — that is what
makes this safe to deploy before it is switched on, and it is how each company is
migrated one at a time.

**Rollback.** Postgres cannot drop an enum value, so rollback is: turn the flag
off (instant, per company), then move any rows in the new states back to
`pending_review`. The unused enum values remain and are harmless.

## 7. The ten financial paths to change

`useDashboardData` · `generate-invoice` · `export-project-excel` ·
`reimbursements` · `retirements` · `ProjectDetail` · `batchScan` ·
`manualEntry` · `extract-receipt` · `whatsapp-worker`.

Each must treat "counts as spend" as `status = 'confirmed'` **only**. Any place
that currently means "not processing" must be re-read as an explicit allow-list,
not a deny-list, so a new state can never leak into totals by omission.

## 8. Tests required before rollout

- submit ≠ approve; a worker attempting approval is refused server-side.
- self-approval refused by default; permitted only with the audited flag.
- `submitted`, `changes_requested`, `rejected` absent from every total in all ten paths.
- `changes_requested`/`rejected` refused without a reason.
- `changes_requested` → edit → `submitted` round-trip.
- `rejected` is terminal: no transition out of it.
- flag off ⇒ current behaviour bit-for-bit.
- every transition writes exactly one audit row.
- no cross-company visibility of any new state or reason.
