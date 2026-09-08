# Chat context regression verification

## Confirmed causes

- The reported sale was routed to `request_account_action(login)` using earlier login history. The executor had no current-message login check.
- The repeated sale failed with `missing_required_tool_call`. Its broad telemetry category was `provider_error`, but the detailed code identifies a model/tool-contract failure, not a demonstrated provider outage. The fallback incorrectly asked the trader which operation they wanted.
- Pending daily-record drafts were described as mandatory `payment_method` questions. Their `record.lines` were omitted from the active context. A price-band correction therefore hit the wrong-field refusal.
- The tool-priority list omitted active-draft corrections. Live evaluation showed a two-product correction being treated as price enquiries until that precedence was corrected.
- The frontend inferred confirmation controls from pending state alone, including for a refusal message.

## Resulting behavior

The current message governs login access; stale login calls are rejected before any executor runs. A missing required tool call gets one corrective model round before any operation executes. Failures use the existing honest failure messages.

The full draft enters bounded active context. Price-band changes use `resolve_pending_clarification` with exact draft product names. Migration 0175 adds a service-only RPC that locks the conversation and draft, checks identity, active membership, expected draft snapshot, expiry and pending status, reads catalogue prices effective at the transaction date, recalculates the same record, updates its preview atomically, and writes an audit entry. Untouched rows, units, quantities, dates and payment metadata remain intact. Combined payment details are supported; credit never becomes a payment method. No correction confirms a transaction or changes catalogue prices.

Only an actual daily-record preview with amounts and confirmation instructions receives web approval controls. Unavailable or ambiguous corrections remain questions, without raw internal field names.

## Validation

- Full Vitest suite: 183 files, 2,642 tests passed. Targeted prompt and fallback tests were rerun after final edits: 24 and 92 passed respectively.
- `npm run build`: passed. `npm run check:edge`: 21 functions passed its undefined-name, redeclaration and duplicate-import checks; this is not a full Deno typecheck.
- `scripts/verify-draft-band-correction.sql`: assertions passed in a transaction with synthetic companies/profiles/records; everything rolled back. Covers the 46,100 to 44,100 example, retained rows/date/payment, combined payment correction, historical pricing, no duplicate sale, audit, stale snapshot, missing/unknown/duplicate products, missing price, wrong tenant, legacy identity company after switching, revoked identity, expiry, confirmed records, and client RPC permissions.
- Final deployed isolated evaluator: 14/14 synthetic boundary-loop cases passed. Includes sale after login, misspelled draft correction, two-product correction, payment detail, new stock question during a draft, retail/mixed sales, supplier payment, customer credit, supplier procurement, payment typo, incomplete historical sale, quantity and product follow-ups.
- Evaluator calls use the real model and shared prompt/tool loop with a synthetic executor. They do not execute merchant tools, send WhatsApp messages, or constitute a full production chat/accounting test. Its temporary evaluation credential is removed after each run.

Prompt version: `risip-agent-v4-draft-review`. Model selection, financial confirmation guards and company feature flags are unchanged. Unsupported corrections require clarification; these checks do not establish universal language accuracy.
