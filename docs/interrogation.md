# The interrogation

A continuous evaluation of what Risip can actually answer, built from the shop's
own database and graded against arithmetic done separately from the code being
tested.

```bash
npm run interrogate
```

```bash
npm run interrogate:quick
```

---

## What it is

`scripts/interrogate.ts` reads a real company's catalogue, prices, costs, stock
counts and confirmed records; invents questions out of those real names and real
numbers the way a shopkeeper would ask them; mistypes a third of them; runs each
through the **real** routing chain and the **real** reply builders — the same
modules the deployed edge function imports, not copies — and checks every answer
against ground truth it computes itself.

It is read-only. Selects and read RPCs. It writes nothing to the database.

### Why it exists

Every eval file in this repo was written by somebody who already knew what the
parsers expect. That is useful, and it is also why bugs survive: the question
gets phrased the way the code wants it. This harness has no such knowledge, and
on its first run it found nine defects the polite tests never touched —
including one that recorded twenty thousand shillings as twenty.

### What it cannot see

It cannot call the model. The Anthropic key lives only in Edge Function secrets
and stays there. A question that falls through to `conversational_ai` is
reported as exactly that — named, not judged — because a question about money
reaching the model is a question being improvised instead of computed, and that
is the finding rather than a gap in the harness.

It also **saturates**. The generator can only ask what its templates know how to
ask, so a clean run means "nothing left in these shapes", not "nothing left".
When a run goes quiet, the useful next move is to add templates, not to relax.

---

## The grade

`scripts/lib/grade.ts` holds the band, in one place, so it cannot drift to meet
a bad run.

| Score | Grade | Meaning | Deploy |
| --- | --- | --- | --- |
| 98–100% | **A** | Production Ready — Highly Capable | allowed |
| 90–97% | **B** | Stable with minor edge-case risks | allowed |
| below 90% | **F** | Failed | **blocked** — the process exits non-zero |

The band is decided on the exact ratio and only the *display* is rounded, and
rounded **down**: 97.96% prints as 97.9% and is a B. A harness that rounds its
own score up across a band edge is a harness protecting itself.

### Registered changes

A score on its own is nearly useless — nobody can tell 97.9 from 98.2 by feel,
and both look fine. What a person can act on is *"the debtor questions went from
100% to 74% overnight"*, so every run is appended to
`docs/interrogation-history.json` and the next one reports what moved,
**per topic**, **regressions first**.

Topics are compared rather than individual questions, because the questions are
generated fresh from a seed and no two runs ask exactly the same thing. Rates
are compared rather than counts, because a topic asked 18 times yesterday and 23
times today has not "improved by five".

### The line

```
Risip AI Current Capability Score: 99.4% | Grade: A | Registered Changes: [madeni 100%↓75%]
```

Printed at the end of every run, written into the report, and lifted into the
GitHub Actions job summary.

---

## Daily runs

`.github/workflows/interrogate.yml` runs at **04:00 UTC** — 07:00 in Dar es
Salaam, before the shops open — and on any pull request that touches the
language pipeline.

**Why an Action and not a Supabase cron.** The interrogation is not a database
job. It imports the same TypeScript the edge functions import and asserts
against arithmetic done in the same process. A scheduled Deno function would
have to reimplement all of that, and a second implementation is precisely the
thing that drifts and stops meaning anything.

### Secrets to set

*Settings → Secrets and variables → Actions*

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key |

The service-role key bypasses RLS. It is required because the harness reads the
shop's shape the way the webhook does. It is passed to one step as an
environment variable, is never committed, never goes into a `VITE_` variable,
and is never printed.

On a scheduled run the workflow commits the refreshed report and history back to
the branch, so the trend line accumulates on its own.

---

## Question families

| Family | Asserts |
| --- | --- |
| Sales priced from the list | the shop's own retail/wholesale, or a band question where two prices exist |
| Sales that state their money | the arithmetic in the message |
| Purchases, expenses, debts, payments | the amount **and the direction** |
| Stock counts and stock questions | the number `wa_stock_on_hand` returns |
| Out of stock, shelf listing | the counted products at or below zero |
| Summary, profit, debtors | recomputed from `daily_records` by the harness |
| Product analytics | the ranking route |
| Selling-price questions | the price in `product_selling_prices` |
| **Money in words** | "elfu ishirini" = 20,000; "elfu saba na mia tano" = 7,500 |
| **Money in shorthand** | `12,500/=`, `12500/-`, `20k`, `TSh 8,000` |
| **Long till rolls** | 12–22 lines in one message |
| **Plural verbs** | "tumeuza", "tuliuza" — a shop with an employee |
| **Payment methods** | "cash", "mpesa" on the end of a sale; never "mkopo" |
| **Nothing happened** | `forbid`: must never become a record |
| **Noise** | emoji, punctuation, bare digits — must never become a record |
| **Extreme quantities** | 0.5 … 1000 |

The last six are the chaos tier. Several carry a `forbid` list rather than an
expectation: for "sijauza chochote leo" the valuable assertion is the negative —
whatever else happens, it must not become a sale.

---

## Adding a family

In `addChaos()` (or the main bank), push a builder returning an `Ask`:

```ts
make.push(() => ({
  topic: 'jina la mada',        // grouped in the report and the trend line
  said: '…',                    // what the shopkeeper types
  want: ['quantity_sale'],      // routes that would be a correct reading
  forbid: ['daily_record'],     // routes that would be actively wrong
  wantAmount: 7500,             // the number the answer must contain
  wantKind: 'sale',             // the ledger fact the message states
  truth: 'kutoka database: …',  // shown in the report
  execute: true,                // run the real database read
}));
```

The rule for `truth`: it must be computed from the database or fixed by the
phrase itself — never from the parser under test. The moment ground truth comes
from the thing being measured, the number stops meaning anything.
