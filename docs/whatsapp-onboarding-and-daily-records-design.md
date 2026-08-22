# WhatsApp onboarding + daily business records — audit and design

Status: **proposal**. Nothing here is implemented. No production object changes.

Audited against the live schema on 2026-08-12, at commit `9ce3ebc` (finance-control
complete). Flags at audit time: Mhandisi all false; RISIP_UI_TEST_CO approval,
reversal and payouts all true.

---

# Part 1 — Audit

## 1. WhatsApp: what exists

Five tables and two edge functions, all working:

| Object | Shape |
| --- | --- |
| `whatsapp_identities` | id, **profile_id**, **company_id**, phone_e164, wa_id, verified_at, revoked_at, opted_out_at, **lang** |
| `whatsapp_link_tokens` | token_hash (SHA-256 only), profile_id, company_id, expires_at, used_at, revoked_at, attempts |
| `whatsapp_conversations` | **PK identity_id**, company_id, profile_id, awaiting, receipt_id, options jsonb, expires_at (30 min) |
| `whatsapp_messages` | wa_message_id (idempotency), kind, media_*, status, retry_count, receipt_id, caption, timings |
| `whatsapp_audit_log` | per-intent trail |

`whatsapp-webhook` (`verify_jwt=false`, HMAC-authenticated) routes deterministically
over eight intents: `link_account`, `change_language`, `submit_receipt`,
`clarification_reply`, `confirm_action`, `cancel_action`, `help`, `unknown`.
`whatsapp-worker` (service-role) downloads media and invokes the existing
`extract-receipt`.

**Two unique indexes decide everything about Part A:**

```
whatsapp_identities_active_phone_uniq   (phone_e164) WHERE revoked_at IS NULL
whatsapp_identities_active_profile_uniq (profile_id) WHERE revoked_at IS NULL
```

One live number, globally, bound to one profile — and `company_id` is `NOT NULL`.
A number therefore serves exactly one business today.

## 2. Language

Two stores, **not synced**:
- Web: `localStorage['risip.lang']`, `'en' | 'sw'`, default **en**.
- WhatsApp: `whatsapp_identities.lang`, set by `parseLanguageCommand`, with
  `detectLanguage()` as a fallback.

A trader who picks Kiswahili in WhatsApp still lands on an English web page.

## 3. WhatsApp ↔ profile mapping

`LINK <token>` sent from the user's own number. The token is single-use, 15 minutes,
SHA-256-hashed at rest, attempt-counted, and minted by `create_whatsapp_link_token()`
from an authenticated web session. Deactivating an employee revokes the identity by
trigger. **This mechanism is sound and should be reused, not replaced.**

## 4. Auth, invites, membership — the blocking finding

```
profiles.id         = auth.users.id   (primary key)
profiles.company_id = NOT NULL
```

**One auth user is one profile is exactly one company.** There is no join table.
A person cannot belong to two businesses; they would need two accounts with two
email addresses.

Worse for our purposes, every RLS policy in the product routes through:

```sql
create function private.auth_company_id() ... as $$
  select company_id into v from profiles where id = auth.uid();
$$;
create function private.auth_role() ... as $$
  select role into v from profiles where id = auth.uid();
$$;
```

> Historical note (superseded August 2026): the public shared-password and email
> registration paths described below were retired when Risip moved to WhatsApp
> passwordless onboarding. Their database history remains intact, but the public
> frontend and legacy Edge Function source no longer expose these flows.

The former joining paths were company shared-password (`join-company`), project
invite token + company password (`join-project`), and company signup
(`signup-company`). `invite_links` is **project-scoped** (`project_id NOT NULL`)
and role-bound — there is no company-level invite code.

## 5. Magic link / passwordless

**Implemented (August 2026).** Public login and registration now start with a
WhatsApp number. Linked users receive a five-minute, single-use `/wa-login` link;
unknown users enter the existing WhatsApp onboarding conversation. Risip does not
use SMS phone auth or expose email/password login publicly. See
`docs/whatsapp-passwordless-auth.md` for the current design and rollout gates.

The WhatsApp deep link (`/receipts?receipt=<id>`) is a **plain authenticated link** —
it assumes an existing web session and grants nothing by itself. That is the correct
posture, and it means "log in from WhatsApp" does not exist yet in any form.

## 6. Receipt ingestion via WhatsApp

Works: image → idempotent record → media download → storage under
`<project_id>/<receipt_id>.jpg` (or `<company_id>/unassigned/`) → existing
`extract-receipt` → always `status='pending_review'`, `source='whatsapp'`. Never
counts as approved spend without a human completing it in the web app.

**Unknown senders enter onboarding.** The webhook resolves an identity and starts
the language and create/join-business flow when no linked identity exists. Account,
profile, company, and membership records are created together only when onboarding
is completed.

## 7. Active business context

**Does not exist.** Not on `profiles`, not on `whatsapp_identities`, not in the JWT.
`whatsapp_conversations.company_id` is per-conversation but `NOT NULL` and copied
from the identity, so it is a mirror, not a pointer.

## 8. Sales / products / customers / debts / stock

**None.** The 33 public tables are all finance-control, invoicing, retirements,
supplier claims or WhatsApp plumbing. Part B is greenfield — which is good news:
nothing to migrate, and no risk of colliding with receipts.

## 9. Reusable analytics layer

**None worth reusing.** Reporting is `useDashboardData`, a React hook that queries
`receipts` client-side and aggregates in JavaScript. The only server-side reporting
functions are `invoices_this_month_count` and `search_companies`.

WhatsApp cannot call a React hook. Part B needs its aggregates as SQL functions from
day one, and the web dashboard can adopt them later.

## 10. Security posture, and what is new

Sound today: HMAC on the webhook, `verify_jwt` set per function, service-role kept
server-side, hashed tokens, RLS deny-by-default, and (since the finance-control work)
money paths that are `SECURITY DEFINER`-only with audit and maker-checker.

New risk introduced by this layer:

1. **WhatsApp is single-factor.** Possession of a SIM equals possession of the
   account. Everything in Part A must assume a stolen phone.
2. **Active-business context becomes an authorisation input.** A wrong or forged
   pointer grants another company's data. It must be membership-checked server-side
   on every switch, never taken from the message.
3. **Unknown-sender onboarding costs money.** An open front door that runs AI
   extraction for anyone who messages the number is a billable DoS.
4. **Third-party messaging.** Debt reminders sent to *customers* are messages to
   people who never opted in — a Meta policy problem, not just a product choice.

---

# Part 2 — Design

## 1. The one change that unblocks everything

`profiles` must stop being the membership table.

```
company_members(profile_id, company_id, role, joined_at, deactivated_at)
  primary key (profile_id, company_id)

profiles.active_company_id uuid   -- which business this person is looking at now
```

Then, and this is the point, **the policies do not change**:

```sql
create or replace function private.auth_company_id() returns uuid ... as $$
  select active_company_id from profiles where id = auth.uid();
$$;

create or replace function private.auth_role() returns user_role ... as $$
  select m.role from company_members m
   join profiles p on p.id = m.profile_id
   where m.profile_id = auth.uid()
     and m.company_id = p.active_company_id
     and m.deactivated_at is null;
$$;
```

Every RLS policy, every guard and every RPC in finance-control keeps its exact text.
The meaning of "my company" moves from *the only one I have* to *the one I am
looking at*, in two functions.

**This is a direct dependency on finance-control**, which the instruction anticipated:
`auth_company_id()` is what `receipts_select`, the petty-cash guards, the payout RPCs
and every other policy resolve through. It cannot be avoided; it can only be done
carefully. Migration keeps `profiles.company_id` in place, backfills
`company_members` from it and sets `active_company_id = company_id`, so day one is
byte-for-byte identical.

Rejected alternative: one auth user per (person, business). It doubles accounts,
needs two emails, and breaks "no logout to switch" outright.

## 2. WhatsApp identity for a multi-business person

```
whatsapp_identities
  - company_id           DROP the NOT NULL binding; identity is to a PERSON
  + active_company_id    which business this number is currently recording into
  keep (phone_e164) unique where revoked_at is null   -- one number, one person
  keep (profile_id) unique where revoked_at is null
```

`whatsapp_conversations.company_id` becomes derived from the identity's
`active_company_id` at message time, so a mid-conversation switch cannot land a sale
in the wrong book.

**Every confirmation message names the business.** "Nimeandika kwa **Duka la Asha**:
…". This is the cheapest possible defence against the wrong-context error, and it is
non-negotiable.

## 3. Onboarding conversation flows

**Unknown number, any message:**

```
Karibu Risip 👋
Chagua lugha / Choose language:   [Kiswahili]  [English]
→ Una biashara Risip?
   [Fungua biashara mpya]  [Jiunge na biashara]  [Nina akaunti tayari]
```

- **Fungua biashara mpya** → name → location → creates company + profile +
  `company_members(owner)` + identity, then sends a login link for the web.
- **Jiunge na biashara** → 6-character company invite code → adds
  `company_members(role from the code)`; owner is notified and can revoke.
- **Nina akaunti tayari** → login link; after the web session confirms, the number
  links through the existing `LINK <token>` mechanism in reverse.

**Unknown number sends a photo:** store the media, reply with onboarding, and **do
not call the AI**. Extraction begins only once a company exists to attach it to.
This is the DoS gate from audit §10.3.

New object: `company_invite_codes(company_id, code, role, expires_at, max_uses,
uses, revoked_at)` — company-level, because `invite_links` is project-scoped and
a Kariakoo shop has no projects.

## 4. Login link (the missing magic link)

A trader may have no email, so email magic links cannot be the only route.

Reuse the `whatsapp_link_tokens` shape exactly — SHA-256 at rest, single use, short
expiry, attempt-counted — as `wa_login_tokens`:

1. WhatsApp: "Nitumie link ya kuingia" → mint token, send
   `https://risip.co/wa-login?t=<token>`.
2. `wa-login` edge function (`verify_jwt=false`): verifies hash, expiry, single use,
   and that it belongs to a live identity; then mints a Supabase session for that
   `profile_id` server-side.
3. Token consumed. Never logged, never re-sendable.

Expiry **5 minutes** — shorter than the 15 for account linking, because this one
hands over a session rather than binding a number.

## 5. Switching business

```
"biashara"  →  Biashara zako:
               1. Duka la Asha  (mmiliki)
               2. Mhandisi Consultancy  (mfanyakazi)
               Jibu namba kubadilisha.
```

`switch_active_company(p_company uuid)` — `SECURITY DEFINER`, verifies
`company_members` membership and that it is not deactivated, then sets
`active_company_id` on both the profile and the identity. **Never trust the number in
the message beyond using it as an index into the list we just sent.**

## 6. Daily records data model

A separate namespace, `biz_*`, deliberately not joined to `receipts`:

```
biz_products         company_id, name, unit, default_price, active
biz_customers        company_id, name, phone, note
biz_sales            company_id, sold_at, total_amount, payment_type
                     (cash|credit|mobile), customer_id?, note, source_message_id
biz_sale_items       sale_id, product_id, qty, unit_price, line_total
biz_expenses         company_id, spent_at, amount, category, note
biz_stock_purchases  company_id, purchased_at, product_id, qty, unit_cost, supplier
biz_debt_payments    company_id, customer_id, amount, paid_at, note
biz_entry_drafts     identity_id, raw_text, parsed jsonb, expires_at
```

**Debt is derived, never stored as a balance**: what a customer owes is
`sum(credit sales) − sum(debt payments)`. Same discipline as the petty-cash ledger —
append-only rows, computed totals — but without double entry, because no second
account is involved.

**Stock is movement, not a level**: quantity on hand is purchases minus sales. A
`current_stock` column would drift exactly the way `current_balance` would have,
and here there is no reason to accept that cost.

## 7. Parse → confirm → save

Never save from a single message. Always:

1. **Deterministic parse first** — quantities, `@`, prices, known product names,
   known customer names. Most Kariakoo messages are regular enough for this and it
   costs nothing.
2. **AI fallback** (Haiku) only when the deterministic pass fails.
3. **Echo and confirm**, always, with the business name:

```
Duka la Asha — nimeelewa:
  unga   10 kg × 2,500 = 25,000
  sukari  6 kg × 3,000 = 18,000
  Jumla: 43,000
Ni sahihi? [NDIYO] [HAPANA]
```

4. `NDIYO` writes every row in **one transaction**; `HAPANA` discards. The draft
   keeps the original text either way, so a mis-parse is diagnosable later.

## 8. Analytics

SQL functions from day one, because WhatsApp cannot call a React hook:

- `biz_summary(p_company, p_from, p_to)` → sales, expenses, estimated profit,
  transaction count
- `biz_top_products(p_company, p_from, p_to, p_limit)`
- `biz_debtors(p_company)` → per customer, outstanding and days since oldest
- `biz_stock_position(p_company)` → purchased vs sold per product
- `biz_growth(p_company, p_period)` → this period vs last

**Profit is labelled an estimate, every time.** It is
`sales − COGS(weighted average from stock purchases) − expenses`, and a trader who
does not record all purchases will see a flattering number. Saying "makisio"
(estimate) in the message is the honest fix; silently calling it profit is not.

The web dashboard should adopt these same functions rather than keeping a second
implementation in JavaScript.

## 9. Debt reminders

**Phase 1 sends reminders to the business owner, never to the customer.**

```
Asha anakudai 18,000 — siku 12 sasa.
```

Messaging a customer who never opted in is a Meta policy violation and a
reputational risk for the trader, and it needs approved templates plus consent
capture. If it is wanted later it is its own project, with opt-in recorded per
customer.

## 10. What may happen in WhatsApp, and what may not

| In WhatsApp | Secure web session required |
| --- | --- |
| Choose language | Approve / reject a receipt |
| Create a business, join with a code | Reverse or correct petty cash |
| Switch active business | Record or void a reimbursement payout |
| Record sales, expenses, stock, debts, customer payments | Invite or deactivate staff |
| Upload a receipt photo | Change company flags or settings |
| Ask for summaries, debtors, growth | Generate or send an invoice |
| Request a login link | Anything with maker-checker |

The line is not "risky vs safe" — it is **whose money moves**. Daily records are the
trader's own book, and a mistake there costs them a wrong number they can correct.
Everything on the right moves money between people, and every one of those paths
already has audit, reasons and maker-checker that a WhatsApp message cannot carry.

Plain-text "approve" is never accepted. A stolen phone must not be able to approve
a payment.

## 11. Phases

| Phase | Content | Why this order |
| --- | --- | --- |
| **P0** | `company_members`, `active_company_id`, helper swap | Riskiest, touches finance-control, ships alone behind a full regression |
| **P1** | Onboarding, company invite codes, `wa-login`, business switching | Needs P0 |
| **P2** | Products, sales, expenses + the parse/confirm loop | Greenfield, no dependency on P0 except company context |
| **P3** | Customers, credit sales, debt payments | Needs P2 |
| **P4** | Summaries, top products, debtors, growth | Needs P2/P3 |
| **P5** | Owner-facing debt reminders | Needs P3 and a scheduler |

P0 alone should ship, be verified, and sit for a while before P1.

## 12. Tests

**P0 — the dangerous one.** Every finance-control assertion already written is
re-run unchanged: approval flow, petty-cash booking and reversal, payouts and voids,
worker privacy, history RLS. Plus: a two-company person sees exactly one company's
receipts at a time; switching changes what they see and nothing else; a deactivated
membership cannot be switched into; `active_company_id` pointing at a company the
person does not belong to resolves to **no access**, not to that company's data.

**P1.** Unknown sender is onboarded, not extracted. Invite code: expired, revoked,
over-used, wrong company — all refused. Login token: single use, expiry, wrong hash,
attempt cap. Number change and lost phone: old identity revoked, new one linked,
no orphan access.

**P2–P4.** Parser corpus in Swahili and English, including the examples from the
brief. Nothing saves without confirmation. Confirmation writes exactly once
(idempotent on `wa_message_id`). Totals arithmetic. Debt balance equals
credit sales minus payments across a long sequence. Summaries match hand-computed
figures on a fixture.

**Always.** Mhandisi flags unchanged; no receipt, petty-cash, payout or audit row
altered by anything in this layer.

## 13. Risks and stop conditions

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| 1 | **The helper swap changes the meaning of every policy** | 🔴 highest | Backfill so day one is identical; full finance-control regression before and after; ship P0 alone |
| 2 | **Wrong active business** — a sale recorded in the wrong book | 🔴 | Membership checked server-side on switch; every confirmation names the business |
| 3 | **Stolen phone = full account** | 🔴 | Money actions behind a web session; login tokens 5 minutes, single use |
| 4 | Unknown-sender AI cost / DoS | 🟠 | Onboard before extracting; rate-limit per number |
| 5 | Mis-parsed amounts | 🟠 | Confirmation is mandatory; raw text kept |
| 6 | Meta 24-hour window and template approval | 🟠 | Only reply inside the window; templates for anything proactive |
| 7 | Third-party messaging to customers | 🟠 | Owner-facing reminders only in phase 1 |
| 8 | Number recycling / lost phone | 🟡 | Revoke-and-relink flow, owner notified |
| 9 | "Profit" read as accounting profit | 🟡 | Always labelled an estimate |

**Stop conditions.**

- If the P0 backfill cannot make `auth_company_id()` return the same value for every
  existing user, stop and report before touching any policy.
- If any finance-control test changes result after the helper swap, stop.
- If onboarding requires weakening the webhook's HMAC check or `verify_jwt`, stop.
- If daily records need a foreign key into `receipts`, stop and re-design — the two
  modules stay separable until there is a proven reason.

---

## Open decisions

1. **P0 scope.** Ship `company_members` + `active_company_id` on its own, or fold it
   into P1? Recommendation: on its own.
2. **Do daily records belong to `companies` at all?** A Kariakoo shop is not a
   construction firm: no projects, no VAT, no approval flow. Reusing `companies`
   keeps one tenancy model; a separate `businesses` table keeps the two products
   genuinely independent. Recommendation: reuse `companies`, because multi-business
   membership is being built anyway and two tenancy models would double every
   policy.
3. **Web language.** Sync `whatsapp_identities.lang` into a persisted profile
   preference, or leave the two stores separate?

---

# Part 3 — Logging out (as built, 2026-08-14)

## Why it needed designing at all

A probe of the phrases people actually typed at the live number found four
questions in ten answered with the generic fallback, two of them about leaving:
`"logout"` and `"nataka kutoka"` matched nothing.

Worse than nothing, in one case. Bare **"toka"** already matched `isStopCommand`
— the cancel-a-draft command — so somebody typing it to mean *let me out* was
told their draft had been cancelled and stayed fully linked.

## What logout means here

The phone number **is** the credential, so signing out has to mean **unlinking
it**. The two real reasons anyone asks are *my phone was stolen* and *this
employee has left*; clearing a chat session answers neither, because the number
could still record sales the next morning.

`wa_logout(phone)` (migration `0083`) removes: the identity, any unused login
link, any unused linking token, the conversation state, and the assistant's
memory of the thread.

It keeps, deliberately: the profile, the company membership, and every receipt,
daily record and audit row that person ever created. **Leaving a business is not
the same as erasing what you did there**, and the books must not move because
somebody changed phone.

## The "toka" rule

One word genuinely means two things, so it gets one short question rather than a
guess:

| What they typed | What is pending | What happens |
|---|---|---|
| `toka` | a draft | cancel — unchanged behaviour |
| `toka` | nothing | ask: *1. cancel  2. remove this number* |
| `logout`, `ondoa namba`, `sign out`, `jiondoe` | anything | confirm, then unlink |

An explicit logout overrides a pending draft; an ambiguous one never does.

The confirmation names what survives before it asks, because somebody unlinking
a stolen phone needs to know their records are safe, and somebody doing it by
accident needs to know it is not free to undo. The question is parked in the
ordinary conversation slot (`awaiting = 'logout_confirm'`, migration `0085`), so
an abandoned logout expires on the normal timer instead of leaving a person
half-signed-out.

## Retrieval, which was the deeper problem

Kiswahili is agglutinative — `deni → madeni`, `jiunge → kujiunga` — and exact
token matching cannot see through any of it. Retrieval now scores **exact 3,
stem 2, near-miss 1** after stripping the common noun-class and infinitive
prefixes.

The prefix list is kept short on purpose. `ji` and `ki` were tried and removed:
they turn `jiunga` into `unga` and `kitabu` into `tabu`, which is how a question
about *joining a business* starts matching *flour*.

Two corpus gaps were also just absent rather than mis-ranked: **`faida` appeared
in no keyword list at all**, so the most common finance question in the language
the app is written in could not be retrieved; and there was no chunk about
logging out, because there was no logout.

## Registration, in the words people use

The menu accepted a digit and little else, so anyone who answered it the way
they talk got *"I did not understand"*. It now reads sentences
(`nataka kufungua duka langu`, `nimealikwa na bosi wangu`), and a person who
simply **pastes the code they were sent** skips the menu instead of being asked
to pick 1, 2 or 3 first.

Invite codes are recognised lowercase, spaced or hyphenated. The matcher uses
the generator's own alphabet — no `O`, `I`, `L`, `0`, `1`, because a code gets
read aloud and typed on a keypad — which is also what stops `BOOKSHOP` passing
for one. An earlier "must contain a digit" rule was **wrong and was caught before
shipping**: roughly one real code in nine is all letters.
