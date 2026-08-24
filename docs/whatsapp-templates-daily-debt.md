# Two templates: daily summary, debt reminder

For Codex to submit via the WhatsApp Business Cloud API. Same pattern as the two
templates already live (`risip_login_link`, `risip_start_onboarding`) — see
`docs/whatsapp-passwordless-auth.md`.

Both are **UTILITY**, not MARKETING: neither sells anything or invites the
person anywhere new — each reports the state of an account the person already
owns. Submitting them as MARKETING would need marketing opt-in records Risip
does not collect, and Meta reviews UTILITY faster.

---

## Prerequisite — do this before submitting

Meta requires a documented opt-in for a business-initiated UTILITY message,
separate from the login flow. Logging in is **user-initiated** (they tapped
Send); a daily report or a debt reminder is **not** — nobody asked for this
specific message before it arrives. Without an opt-in record on file, Meta can
reject the template or suspend it after the fact even if it first approves.

The cheapest opt-in that is already true today: the owner is a **linked
WhatsApp identity** in `whatsapp_identities`, which only exists because they
sent Risip a message from that number. That is consent to *be messaged by
Risip*, not consent to *receive unprompted daily summaries*. Before this goes
live, add one explicit toggle — a Settings switch or a one-time
`"washa taarifa za kila siku"` reply — and keep the timestamp of that consent.
This doc only covers the templates; the toggle and the cron that sends them are
separate work, not yet built.

---

## 1. `risip_daily_summary`

Sent once a day, only to an owner or accountant who opted in, only when the
business had at least one confirmed record that day (an empty report is not
worth a message and risks the account's quality rating).

**Category:** `UTILITY`
**Name:** `risip_daily_summary`

### English (`en_US`)

> **Risip — {{1}}, {{2}}**
> Sales: {{3}}
> Expenses: {{4}}
> {{5}}
>
> Reply STOP to stop these.

### Swahili (`sw`)

> **Risip — {{1}}, {{2}}**
> Mauzo: {{3}}
> Matumizi: {{4}}
> {{5}}
>
> Jibu SITISHA kuzima taarifa hizi.

### Variables

| # | Meaning | Example |
|---|---|---|
| `{{1}}` | Business name | `St. Ritha bookshop` |
| `{{2}}` | The date, in the shop's own words | `Jumatatu, 24 Agosti` |
| `{{3}}` | Sales total, formatted | `TSh 2,393,250` |
| `{{4}}` | Expenses total, formatted | `TSh 25,700` |
| `{{5}}` | One line — the single fact worth a glance: a loss, an out-of-stock item, or "Hakuna tatizo leo." | `⚠️ Velvet napkin inauzwa chini ya gharama` |

Line 5 is deliberately one fact, not a list — a template can't branch, and a
report crowded with everything the adviser knows stops getting read. It is the
same "one thing that matters" rule already built into `get_business_advice`
(see `whatsappAdvisor.ts`).

### API body (Cloud API `POST /{whatsapp-business-account-id}/message_templates`)

```json
{
  "name": "risip_daily_summary",
  "language": "en_US",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Risip — {{1}}, {{2}}\nSales: {{3}}\nExpenses: {{4}}\n{{5}}\n\nReply STOP to stop these.",
      "example": {
        "body_text": [
          ["St. Ritha bookshop", "Monday, 24 August", "TSh 2,393,250", "TSh 25,700", "No issues today."]
        ]
      }
    }
  ]
}
```

Swahili is a **separate submission** with `"language": "sw"` and the Swahili
body/example above — Meta approves each language independently.

---

## 2. `risip_debt_reminder`

Sent to the **owner or accountant**, about **one debtor at a time** — never a
list, so nobody's balance sits next to a stranger's name if a phone is glanced
at over someone's shoulder. Triggered by staleness (e.g. a debt older than N
days with no payment), not on a fixed schedule.

**Category:** `UTILITY`
**Name:** `risip_debt_reminder`

### English (`en_US`)

> **Risip — outstanding debt**
> {{1}} owes {{2}}, recorded {{3}}.
>
> Reply STOP to stop these.

### Swahili (`sw`)

> **Risip — deni lililopo**
> {{1}} anadaiwa {{2}}, tarehe {{3}}.
>
> Jibu SITISHA kuzima taarifa hizi.

### Variables

| # | Meaning | Example |
|---|---|---|
| `{{1}}` | Debtor's name, as recorded | `Juma` |
| `{{2}}` | Amount owed, formatted | `TSh 25,000` |
| `{{3}}` | When the debt was recorded | `12 Agosti` |

### API body

```json
{
  "name": "risip_debt_reminder",
  "language": "en_US",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Risip — outstanding debt\n{{1}} owes {{2}}, recorded {{3}}.\n\nReply STOP to stop these.",
      "example": {
        "body_text": [
          ["Juma", "TSh 25,000", "12 August"]
        ]
      }
    }
  ]
}
```

Swahili as its own submission, same as above.

---

## Notes for whoever wires the sending side later

- Both templates carry **"Reply STOP"**. Meta expects an opt-out path on a
  recurring UTILITY message, and the webhook already has a `STOP`/`SITISHA`
  handler pattern to extend from `isCancel` in `whatsappIntent.ts` — reusing
  the flag design of the AI budget rather than inventing a new one.
- `{{5}}` in the daily summary and the whole debt reminder both need a
  **source of truth for "who gets one and when"** — a per-company cron reading
  confirmed records for that day, and a staleness query on `daily_records`
  where `kind = 'debt_issued'`. Neither exists yet; this doc is the template
  copy only.
- Test in the WhatsApp Business sandbox before requesting production review —
  Meta's category classifier sometimes reclassifies a template as MARKETING on
  wording alone (words like "kupata", "punguzo", any exclamation-heavy tone).
  The copy above avoids that on purpose; keep edits conservative.
