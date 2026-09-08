# Web chat verification, 8 September 2026

`/chat` is an authenticated transport into `whatsapp-webhook`. The webhook's existing parser, assistant, tools, financial guards and pending conversation are shared. Confirmation buttons send literal `NDIYO`; cancellation sends `GHAIRI`. The UI projects the reply's exact numeric strings into a table without recalculating them.

## Architecture and release decisions

- Accounts without WhatsApp get a durable identity on first chat access. Its legacy address is `web:<profile UUID>`, with `verified_at` and `wa_id` unset. Existing protected tools resolve `p_phone` against that address, so web-only accounts use the same tools. It cannot be sent to Meta or shown as a connected WhatsApp account. Linking a verified number upgrades the identity atomically and preserves its conversation.
- Every inbound web message enters `whatsapp_messages`, the existing monthly billing source. There is no second meter. The rail uses the existing subscription window and allowance, with the same soft-limit semantics.
- The client persists one UUID per attempted send and retries that UUID. The server scopes it by authenticated user, stores a SHA-256 request fingerprint, rejects different content or company on replay, and returns durable replies for completed requests. Link/login tokens are redacted in durable history and excluded from model context.
- Both transports acquire the same identity lease and check older queued messages. The lease heartbeat works with Supabase's thenable RPC result. Business switching takes the same profile-row lock and rejects active turns or unfinished drafts. A browser disconnect does not cancel accepted work. Dead-isolate requests are marked failed after ten minutes when no lease remains; possible writes are never automatically re-executed.
- Days use Africa/Dar_es_Salaam. Pending questions retain their day across midnight. The migration imported only the 38 historical messages that actually existed. Daily history is paginated, and the minimap has a tick per loaded message.
- The user explicitly approved **streaming verified replies**. SSE carries accepted messages, completed tool activity, validated replies, heartbeats and completion. This release does not expose model tokens before the existing full-response guards run.
- Added session draft retention, retry with the original request ID, an offline notice, a shortcut to an unfinished question on another day, and the scanner's manual barcode fallback. These improve recovery without adding composer controls.

## Real command output

Full captured stdout/stderr and exit codes: [TypeScript](typecheck.txt), [production build](build.txt), [tests](tests.txt), [landing lint](lint.txt), [edge source check](edge.txt).

```text
npx tsc -b
Exit code: 0

npm test
 Test Files  181 passed (181)
      Tests  2626 passed (2626)
Exit code: 0

npm run lint:landing
> eslint --config eslint.landing.config.mjs src/routes/marketing src/App.tsx tailwind.config.ts
Exit code: 0
```

The full Deno type check was also investigated: it reports 78 existing type errors in the legacy webhook and its older Supabase typings. It is not reported as passing. The targeted edge source check and real cloud execution passed. No existing money guard was relaxed.

## Database and transport evidence

Tests used two disposable, explicitly marked QA users and companies in the linked database. The temporary evaluator imported the actual webhook, invoked the authenticated web entry or HMAC-verified WhatsApp entry, and suppressed outgoing Meta traffic only. It did not replace the parser, tools, confirmation RPCs or database. Thus the WhatsApp proof covers its server path, not delivery to a physical handset.

The identical sentence on each transport was `Nimeuza QA sukari kilo 2 kwa 3000 kila kilo`. Both required explicit confirmation and stored:

```json
{"kind":"sale","status":"confirmed","amount":6000,"currency":"TZS","payment_method":null,"description":null}
```

Both line items were quantity `2`, unit amount `3000`, total `6000`. Both stocks changed from `20` to `18`. See [initial parity](transport-parity.json) and [line items and concurrency](boundaries.json).

The browser scanner decoded EAN-13 `6011040121093`, resolved `QA sukari`, and submitted the ordinary message `Nimeuza "QA sukari" 1`. A further WhatsApp draft was confirmed through the web transport on the same identity. Both companies then contained identical confirmed `3000` and `6000` records, and stock `17`. See [final database and production evidence](production-proof.json).

The midnight fixture deliberately placed only the disposable pending question on the previous day. Its subsequent real confirmation shows:

```text
content:    NDIYO
chat_day:   2026-09-07
created_at: 2026-09-08T05:46:59.46305+00:00
```

Other checks: simultaneous lease acquisition returned `[false,true]`; switching with a pending question returned `chat_pending`; another identity's messages remained invisible even with company membership. Replaying a completed ID returned HTTP 200 with `replayed=true`; changed content and wrong active company returned 409.

The production `whatsapp-webhook/chat` was separately exercised after deployment: authenticated SSE HTTP 200 completed, identical retry replayed, conflicting retry returned 409, and unauthenticated access returned 401. This evidence is in `production-proof.json`.

## Browser verification

Verified sale entry, confirmation, scanner-to-message, business switching, Today/Yesterday/Two days ago, active-day calendar selection and minimap hover preview/click jump. Repeated day/calendar/minimap/scanner checks at 390 x 844; document scroll width was exactly 390, with no horizontal overflow. English UI and Swahili UI were both inspected. Backend language remains the shared identity preference, so changing frontend language does not translate historical messages.

- [Desktop chat and minimap](desktop-chat.png)
- [Mobile minimap](mobile-minimap.png)
- [Mobile calendar](mobile-calendar.png)
- [Mobile scanner lookup](mobile-scanner.png)

The scanner test used a camera-video fixture containing the real barcode through the existing ZXing decoder and product lookup. Physical camera hardware was unavailable in the browser environment; physical-device camera operation remains unverified.

Console inspection found the two existing React Router v7 future warnings (`v7_startTransition`, `v7_relativeSplatPath`), plus normal Vite/React DevTools development messages. No new chat runtime error was observed in the final successful UI session. An earlier discarded local proxy setup produced authentication-load failures; that setup was not used for final verification.

## Cleanup and deployment

Migrations 0171, 0172 and 0173 were applied to the linked project. Legacy remote migration history prevents a blanket `db push`; only these exact migrations were applied and marked, without rewriting unrelated remote history. The webhook deployed successfully with the requested `--no-verify-jwt`; the chat route verifies the user's JWT explicitly and the WhatsApp route retains HMAC verification.

The temporary evaluator was deleted remotely and removed from the source tree. Both QA companies and auth users were removed, and the fixture credentials were deleted locally. [Cleanup result](cleanup.json) confirms the original six profiles and four live identities remain.

Vercel reported successful deployments for the pushed application. Both `risip.online` and `www.risip.online` served HTTP 200 with a bundle containing the authenticated `/chat` route and `ChatPage-B3JWhIq6.js`.

The first GitHub CI run exposed runner configuration problems: nine existing suites failed to import without frontend environment values, and two existing QR wall-clock assertions exceeded their limits under parallel CPU load. The CI unit-test step now supplies inert localhost values and runs files sequentially. No assertions or timing thresholds were changed. [Local run using the CI configuration](ci-local.txt) captures the complete result.
