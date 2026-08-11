# Risip

Multi-tenant SaaS: any company signs up, its workers scan receipts, its accountants generate category-grouped invoices, its owner sees a live financial dashboard. Started for a Tanzanian civil-engineering firm, built generic. UI copy is in Swahili.

## Tech stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind. Path alias `@/*` → `src/*`.
- **Backend / DB / Auth / Storage / Realtime:** Supabase (Postgres 15).
- **AI receipt extraction:** Claude API — default **Haiku 4.5** (`claude-haiku-4-5-20251001`), allow swap to Sonnet 5 per company/project for hard-to-read receipts. Anthropic API key lives only in Edge Function env vars.
- **PDF generation for invoices:** `pdf-lib` (Deno-native, no Node polyfills needed).
- **Transactional email:** **Resend**, called from a Supabase Edge Function. The Resend API key must never ship to the browser or appear in a `VITE_*` env var. This covers signup email confirmations (once prod turns them on), invite-link delivery, invoice-sent notifications, etc.

## Roles

Three roles, fixed per company via `profiles.role`:

- `owner` — full admin, sees everything. UI color: **purple** (`--role-admin`).
- `accountant` — financials + invoices, all projects in the company. UI color: **coral** (`--role-accountant`).
- `worker` — only projects they're a member of, upload flow only. UI color: **teal** (`--role-worker`).

Invite links are role-bound (one link per role per project — never a role dropdown).

## Data model (see `supabase/migrations/`)

Every business row is scoped by `company_id`, directly or via `project → company`. `receipts.company_id` is denormalized and kept in sync by a trigger.

Duplicate/fraud guard: **global** unique index on `(receipts.verification_code)` where `verification_code is not null and status <> 'duplicate'` (migration 0041). A TRA verification code is one real transaction, so the same code is rejected across the whole platform — even across companies (no double input-VAT claim). The `23505` handlers in `extract-receipt` / `batch-extract-receipts` look up the original by `verification_code` alone and mark the newcomer `status='duplicate'`.

## RLS posture

RLS enabled on every table. No policies = deny. Anon role has **no** direct table access. Anything that must cross tenants (company signup, join-by-token, invoice generation) runs in an Edge Function using the `service_role` key.

Helper SQL functions (`auth_company_id`, `auth_role`, `auth_can_see_project`) are `security definer` with a pinned `search_path = public`, and `execute` is granted only to `authenticated` (or `service_role` for the RPC).

## WhatsApp receipt capture (whatsapp-webhook + whatsapp-worker)

One official Risip number on the Meta Cloud API acts as a front door, not a chatbot.
A linked employee sends a receipt photo; `whatsapp-webhook` (`verify_jwt=false`,
authenticated by the `X-Hub-Signature-256` HMAC) records it idempotently on
`whatsapp_messages.wa_message_id` and returns 200 immediately; `whatsapp-worker`
(service-role only) downloads the media, stores it under the normal
`<project_id>/<receipt_id>.jpg` convention, and **invokes the existing
`extract-receipt`** rather than duplicating the AI pipeline. The receipt is always
forced to `status='pending_review'` with `source='whatsapp'`, so it never counts
towards approved spend before the employee completes project/category/payment
source in the web app via a plain authenticated deep link (`/receipts?receipt=<id>`
— no public bypass token).

Linking uses a single-use, 15-minute token (`create_whatsapp_link_token`) sent as
`LINK <token>` from the user's own WhatsApp; only its SHA-256 hash is stored. One
live number ↔ one profile, enforced by partial unique indexes; deactivating an
employee revokes their identity by trigger. See `docs/whatsapp-setup.md` for Meta
dashboard steps, secrets and the manual end-to-end test.

## Scan-to-email (inbound-email edge function)

Each company has `scanner_inbox_token` (unique uuid) + `scanner_sender_email`. Its inbox address is `<scanner_inbox_token>@scan.risip.co`, shown in Settings → *Scanner & Hardware Integration*. A Canon printer's "Scan to Email" sends an A3 scan there; the email provider (Resend Inbound / SendGrid / Mailgun) POSTs the parsed message to `inbound-email` (`verify_jwt=false`). The function: resolves the company by inbox token → optionally checks `from` against `scanner_sender_email` → uploads the image to the `receipts` bucket (`<project_id>/inbound/<uuid>.jpg`, most-recent active project, owner as on-behalf uploader) → runs the same Claude A3 split as `batch-extract-receipts` → inserts receipts as `status='pending_review'`. The accountant approves/discards each from the receipt details modal.

Provider setup (not code): point MX/inbound routing for `scan.risip.co` at the provider and set its inbound webhook to this function's URL. Optionally set `INBOUND_WEBHOOK_SECRET` (checked via `?secret=` or `x-webhook-secret`). Security rests on the unguessable inbox token + optional authorized-sender check. Non-actionable POSTs return `202` so the provider doesn't retry.

## Storage buckets

- `receipts` (private) — path: `<project_id>/<receipt_id>.<ext>`
- `invoices` (private, signed URLs) — path: `<project_id>/<invoice_id>.pdf`, writes by edge function only
- `company-logos` (public read) — path: `<company_id>.<ext>`, writes by owner only

Policies key off the first path segment via `storage_first_uuid_segment(name)` (deliberately neutral name — different buckets encode different ids there).

## Build order

1. Foundation — scaffold, migrations, shell. ✅
2. Auth + company signup (`signup-company` edge function). ✅
3. Projects CRUD + role-bound invite links.
4. Public `/join/:token` (edge function creates user + profile, adds worker to `project_members`).
5. Worker upload flow (mobile-first camera → storage → `extract-receipt` edge function).
6. Live realtime dashboard.
7. Invoice generation (`generate-invoice` edge function → aggregate + `pdf-lib` → storage).
8. Settings (company profile, logo, member list, deactivate).

## Conventions

- All UI copy comes from `src/i18n/sw.ts`. Don't hardcode strings in components.
- Currency default is `TZS`, displayed as `TSh 1,234` (prefix, thousands-separated). See `src/lib/format.ts`.
- Role tokens are CSS vars (`--role-worker`, `--role-accountant`, `--role-admin`) exposed as Tailwind `text-role-*` / `bg-role-*`. Never hardcode teal/coral/purple hex values in components.
- Migrations are numbered `NNNN_name.sql`. New RPCs get their own migration; do not edit past migrations after they've been pushed.
- Edge functions live under `supabase/functions/<name>/index.ts`; shared helpers under `supabase/functions/_shared/`.
