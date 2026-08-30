# WhatsApp receipt capture — setup and operations

Risip runs **one** official WhatsApp number. A linked employee photographs a
receipt, sends it to that number, and Risip files it as a `pending_review`
receipt in their company, then replies with a link to finish the details in the
web app. There is no chatbot: WhatsApp is only the front door.

The employee still belongs to **one company** (unchanged architecture). There is
no workspace switching, no personal mode, and no payments in this MVP.

---

## 1. Architecture

```
Meta Cloud API
   │  POST (X-Hub-Signature-256 over the raw body)
   ▼
whatsapp-webhook        verify_jwt = false
   │  verify signature → record message (unique wa_message_id) → 200 fast
   │  "LINK <token>" is handled inline; images become jobs
   ▼
whatsapp_messages       job table: pending → processing → done / failed / skipped
   │  nudged by the webhook, self-heals stale jobs on every call
   ▼
whatsapp-worker         verify_jwt = true (service-role only)
   │  download media from Meta → upload to `receipts` bucket
   │  invoke the EXISTING extract-receipt function (no duplicated AI logic)
   │  force pending_review → notify reviewers in-app → one WhatsApp reply
   ▼
receipts + app_notifications
```

**Why no queue extension.** `pg_cron` and `pg_net` are not installed on this
project, so the webhook nudges the worker directly and every worker call also
sweeps jobs left `processing` for more than 5 minutes back to `pending`. Jobs
retry up to 3 times, then land in `failed` with `last_error` set — nothing goes
silently missing. *Recommended upgrade once volume justifies it:* enable
`pg_cron` + `pg_net` and schedule `whatsapp-worker` every minute, which removes
the dependency on a later message arriving to trigger a sweep.

---

## 2. Environment variables (Supabase Edge Function secrets)

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Random string you also type into Meta's webhook config. Answers the GET challenge. |
| `WHATSAPP_APP_SECRET` | Meta **App Secret**. Verifies `X-Hub-Signature-256`. Without it every POST is rejected. |
| `WHATSAPP_ACCESS_TOKEN` | Permanent System User token used to send messages and download media. |
| `WHATSAPP_PHONE_NUMBER_ID` | The Phone Number ID (not the phone number) from WhatsApp Manager. |
| `WHATSAPP_API_VERSION` | Optional. Defaults to `v22.0`. |
| `RISIP_PUBLIC_APP_URL` | Public app origin, e.g. `https://risip.online`. Used to build review links. |

```bash
supabase secrets set \
  WHATSAPP_VERIFY_TOKEN="<random-string>" \
  WHATSAPP_APP_SECRET="<meta-app-secret>" \
  WHATSAPP_ACCESS_TOKEN="<system-user-token>" \
  WHATSAPP_PHONE_NUMBER_ID="<phone-number-id>" \
  RISIP_PUBLIC_APP_URL="https://risip.online" \
  --project-ref dsbplcqhlewxnivfwlcx
```

The frontend needs the public number so it can build the `wa.me` link:

```
VITE_RISIP_WHATSAPP_NUMBER=255XXXXXXXXX   # digits only, no '+'
```

Set it in `.env.local` and in the Vercel project. Until it is set, the
"Connect WhatsApp" button stays disabled and says so.

**Never** put `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_APP_SECRET` in a `VITE_*`
variable — those ship to the browser.

---

## 3. Meta dashboard steps

1. **Create the app** — [developers.facebook.com](https://developers.facebook.com)
   → *My Apps* → *Create App* → type **Business** → add the **WhatsApp** product.
2. **Add the phone number** — WhatsApp → *API Setup*. For testing, Meta gives you
   a free test number. For production, add and verify your own number (it must
   not currently be registered to the WhatsApp consumer or Business app).
   Copy the **Phone Number ID**.
3. **Create a permanent token** — *Business Settings* → *System Users* → add a
   system user with the `whatsapp_business_messaging` and
   `whatsapp_business_management` permissions → *Generate token* → select your
   app → copy it into `WHATSAPP_ACCESS_TOKEN`. The temporary 24-hour token in the
   API Setup tab is fine for a first test but expires.
4. **App Secret** — *App Settings* → *Basic* → *App Secret* → `WHATSAPP_APP_SECRET`.
5. **Configure the webhook** — WhatsApp → *Configuration* → *Edit*:
   - Callback URL:
     `https://dsbplcqhlewxnivfwlcx.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
   - Press **Verify and save**. Meta sends a GET; a 200 with the challenge means
     the token matches.
6. **Subscribe to fields** — on the same screen, subscribe to **`messages`**.
   Nothing else is required for this MVP.
7. **Testing numbers** — while the app is in development mode, only numbers added
   under *API Setup → To* can message the business number.

### Rotating or revoking credentials

- Rotating the access token: generate a new system-user token, run
  `supabase secrets set WHATSAPP_ACCESS_TOKEN=...`, then delete the old token in
  Business Settings.
- Rotating the app secret: *App Settings → Basic → App Secret → Reset*, then set
  the secret. The webhook rejects everything until the new value is set, which is
  the intended fail-closed behaviour.
- Suspected compromise: unset `WHATSAPP_APP_SECRET`. Every inbound POST is then
  rejected with 401 and no receipts can be created over WhatsApp.

---

## 4. Deployment

```bash
supabase functions deploy whatsapp-webhook --project-ref dsbplcqhlewxnivfwlcx
supabase functions deploy whatsapp-worker  --project-ref dsbplcqhlewxnivfwlcx
```

`verify_jwt` is declared in `supabase/config.toml`: the webhook is public
(authenticated by HMAC), the worker requires the service-role key.

Database objects come from `supabase/migrations/0043_whatsapp_link.sql`.

---

## 5. How an employee connects

1. Risip → **Settings → WhatsApp → Connect WhatsApp**.
2. Risip mints a **single-use token, valid 15 minutes**, and opens
   `wa.me/<number>?text=LINK%20<token>`.
3. The employee presses send in WhatsApp.
4. The webhook hashes the received token, matches it, and links that phone number
   to their profile and company.
5. Settings then shows the masked number with a **Disconnect** action.

Only the SHA-256 hash of the token is stored, so a database leak cannot be
replayed into a link. Generating a new code revokes any outstanding one.

---

## 6. Security properties

- **Signature.** `X-Hub-Signature-256` is HMAC-SHA256 over the **raw** body,
  compared in constant time. No secret configured → everything is rejected.
- **Idempotency.** `whatsapp_messages.wa_message_id` is unique, so Meta's
  at-least-once retries collide instead of creating a second receipt.
- **Identity.** One live number maps to exactly one profile, and one profile
  holds one live number (partial unique indexes ignore revoked rows).
- **Revocation.** The user can disconnect; deactivating an employee revokes their
  identity automatically via trigger; the worker re-checks the identity and
  `deactivated_at` at processing time, not just at webhook time.
- **Tenancy.** Every statement is scoped by the company resolved from the
  identity. The AI is never consulted for authorisation.
- **Duplicates.** The global verification-code guard already prevents the same
  TRA receipt being filed twice. The WhatsApp reply says only that the receipt
  already exists — never which company or person filed the original.
- **Link safety.** The review link is a plain deep link into the authenticated
  app (`/receipts?receipt=<id>`). It carries no token and grants nothing: the user
  must be logged in and RLS still decides visibility.
- **Logging.** Phone numbers are masked; message bodies, tokens and receipt
  contents are never logged.
- **Unsupported input.** Documents, audio and video get one short reply and
  create no receipt row.

---

## 7. Manual end-to-end test

Prerequisite: secrets set, both functions deployed, `VITE_RISIP_WHATSAPP_NUMBER`
configured, your test phone added under Meta *API Setup → To*, and your company
has at least one **active project**.

1. **Link.** Settings → WhatsApp → *Connect WhatsApp* → send the prefilled
   message. Expect: "Connected…". Reload Settings — the masked number shows.
2. **Reused code.** Send the same `LINK <token>` again. Expect: "already been
   used". No second identity is created.
3. **Receipt.** Send a photo of a receipt. Expect one reply within ~15–30s with
   merchant, amount, a note that it needs confirmation, and a link.
4. **Dashboard.** Open Receipts as the accountant. The receipt is
   **pending review** with a green **WhatsApp** badge, and the reviewer has an
   in-app notification. Confirm it does **not** appear in approved totals.
5. **Complete it.** Tap the WhatsApp link, log in if needed. The receipt detail
   opens; set project, category and payment source, then save.
6. **Unsupported media.** Send a PDF. Expect one short "send it as a photo"
   reply and no new receipt.
7. **Duplicate.** Send the same receipt photo again. Expect the "already
   recorded" reply with no company or employee named.
8. **Revoke.** Settings → *Disconnect*, then send another photo. Expect the
   "not connected" reply and no receipt.

Inspect job outcomes:

```sql
select wa_message_id, status, retry_count, last_error, receipt_id, created_at
from whatsapp_messages order by created_at desc limit 20;
```

---

## 8. Known limitations

- **Project is assumed, not asked.** The receipt is filed into the employee's
  most recent active project; they change it when completing the receipt. Asking
  on WhatsApp needs list messages (10 rows max) and is deliberately out of scope.
- **Worker triggering** depends on the webhook nudge plus the sweep on the next
  call. Enable `pg_cron` for time-based guarantees.
- **Meta's 24-hour service window.** Every reply here answers the user's own
  message, so no paid template is used today. Meta has announced that service and
  utility messages inside the 24-hour window start being charged from
  **1 October 2026** — confirm current Tanzania rates before promising margins.
- **One number for the platform.** If Meta restricts it, WhatsApp capture stops
  for everyone; the web app is unaffected.
- **No manager approval in WhatsApp**, by design — approving money over a channel
  authenticated only by possession of a phone is too weak.
