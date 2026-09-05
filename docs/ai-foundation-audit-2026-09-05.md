# Risip AI foundation audit — 5 September 2026

## Release decision

**Not launch-ready; not certified parser-free.** This is an evidence-based initial audit, before foundation changes. Line references below refer to Git `93403df`, not to a future edited checkout. Existing comments saying “every message reaches AI” are not evidence of execution order. Screenshots alone cannot establish whether the model ran.

At the audit baseline, Production Management API reported `whatsapp-webhook` **v299**, ACTIVE, bundle SHA256 `d8018fb6f310f81f7479629263fdcebd4b2da9f9291c1272cf09d12436b636c6`; worker v44; evaluator v1. Subsequently downloaded all 83 webhook source assets into an isolated temporary directory: **83/83 matched Git 93403df**, using Git blob hashes with checkout normalization. The baseline defects were therefore present in the deployed source, not merely an old local checkout. Post-release evidence is recorded separately below.

Production migration records exist for 0132–0136, 0167 and 0169. 0168 has no marker. Other local/remote history discrepancies and four nonnumeric filenames exist. Do not bulk-repair history or run db push. Production function definitions and ACL metadata were queried read-only; function-body/rollback verification remains necessary.

## Observed architecture

- WhatsApp signature/identity handling feeds a large webhook containing both legacy conversation handlers and a later AI loop. `_shared/whatsappRouting.ts` tests eligibility, but is not the sole entry point.
- `_shared/whatsappAssistant.ts:1591` calls Anthropic, requests tool choice, runs tools and either returns model prose or a tool's `terminalReply` (1850). Model defaults to Haiku; prose rounds can use another model. Environment settings need separate verification.
- `_shared/whatsappBusinessEvent.ts` interprets wording again after the model. This is **AI plus parser**, not exclusively AI interpretation.
- Existing live retrieval (`whatsapp-webhook/index.ts:1486`) loads company vocabulary, products, units and prices. This is real database context, but only the first 60 names / 500 units are loaded; failures silently become empty context.
- Existing memory uses `whatsapp_ai_threads`, `whatsapp_ai_messages`, and one `whatsapp_conversations` row per identity. History is bounded to 12 messages / 24 hours, not unlimited memory. Pending questions normally expire after 30 minutes. Multiple independent unfinished topics are not represented as separate durable threads.
- Ledger writes reuse daily_records / daily_record_lines, protected RPCs and confirmations. Retain this accounting architecture; replacing validators with model arithmetic would be unsafe.

## Flow audit

All paths are under `supabase/functions/` unless stated otherwise. A path classification describes inspected code, **not a live WhatsApp replay**.

| User message / flow | Handler and tool | AI / parser / formatter / DB | Context and retrieval | Validation / failure / recommended fix |
|---|---|---|---|---|
| `nimeuza mafuta 2`, then `mafuta ya taa` / `mafuta ya kula` | webhook:4374 executeBusinessEvent → :3563 priceAndDraftSale; propose_business_event | AI initial extraction + server wording parsing + product/pricing DB + confirmation formatter | Company catalogue/units used. Product choices exist, but pendingClarificationOf (:3777) omits product_choice/product_read_choice; legacy :8493 parses follow-up before AI | Ambiguous products must not be substituted. P0: AI must receive original draft plus candidate identifiers; resolve only offered candidate; preserve quantity and band. Oil/lotion/cream must not imply litres. |
| `nimeuza vest 2 rejareja` | :4540 sale conversion → bandFromWording (:3506) → priceAndDraftSale | AI + band parser + DB pricing + formatter | Catalogue used. Per-line band wording now exists, but message-level fallback can still affect other lines | P0: canonical per-line band in strict tool contract; backend checks enum and live price, not sentence wording. Ensure explicit retail never becomes wholesale. |
| `nimeuza bidhaa mbili` | validateBusinessEvent / decideQuantities → priceAndDraftSale | AI + numeric wording parser + DB | No exact product identity supplied | P0: clarify product rather than treating generic “bidhaa” as new merchandise or guessing quantity 1. Test no draft/stock effect before clarification. |
| `nimeuza ng’ombe mmoja kwa Musa kwa deni` | propose_business_event kind credit_sale → sale pricing | AI + parsing + DB | Customer identity/credit wording carried | This is **selling on customer credit**, not buying an animal. P0: preserve receivable direction, validate sellable catalogue item/unit, no procurement/breakdown inferred. Clarify ambiguous party relation. |
| `nimemlipa Musa 300000 cash` | propose_money_event → executeMoneyEvent (:4874) → supplier payment draft | AI + payment/amount parsing + DB + formatter | Supplier outstanding read by backend | 0169 confirm_daily_record:48–64 locks supplier liability and rejects overpayment at confirmation. P0: regression partial payment, concurrent payment, void and customer/supplier direction. Model must never calculate outstanding. |
| `nimeongeza ng’ombe ya sala 20 stoo` | propose_business_event → purchase flow / product resolver | AI + server direction check (:4440–4446) + DB | Alias catalogue exists, partial | P0: ask whether “Nguvu ya sala” is intended; never assume animal procurement from the noun alone. Preserve original purchase intent while asking product/cost. |
| `jana nilifanya mauzo` | propose_business_event or propose_money_event → decideDate / decideQuantities | AI + date parser + validation | History and current clock provided | Missing amount/products must produce contextual clarification; retain yesterday when later quantity arrives. P1: normalized date contract and historical pricing RPC, no date reset to today. |
| Multi-product mixed retail/wholesale; `1 jumla 2 rejareja …` | resolve_pending_clarification → executeClarification (:4095), price_band_choice | AI plus alignment; several legacy pending handlers run earlier | pendingClarificationOf gives original AND open-row numbering (:3788–3817), allowing two index interpretations | P0: one stable row identifier / displayed numbering; do not renumber remaining products; require complete, unambiguous mapping. |
| `tano`, `robo kilo`, or `2` after a quantity question | pre-AI :8293 parseQuantityAnswer; :9488 new-product numeric answers | **Parser can own ordinary follow-up before model** | Original wanted quantity object survives; AI may not run | P0: common dispatch boundary before every language handler. Only menu choices, not arbitrary quantity numbers, qualify as protected control replies. |
| Worker records/confirms own sale, purchase/count | :9093 wa_confirm_daily_record; 0169:18 confirm_daily_record; :90/:152 stock count bridges | AI proposal + deterministic own confirmation + DB | Active identity/company and recorded_by | Worker own confirmation enabled, boss approval not required. New product branches still block workers (:3617; cost tools :5549; cost/price SQL RPCs). P1: one explicit operational role matrix, no blanket finance-read grant. Audit UI policy separately. |
| Boss asks `jana nini kiliuzwa?`, profit or stock | get_day_records / get_business_summary / get_stock_on_hand; readOnlyToolReply | AI intent + DB facts + model or terminal formatter | live company data; current-date label transformations exist | P1: classify **interpretation separately from rendering**; read-only report must not mutate drafts; profit needs backend confirmed COGS/expenses, missing cost != zero. No Phase 9 UI changes. |
| New product setup, then confirm | :9510 new_product_registration_confirmation | AI/legacy extraction + three RPC writes + formatter | One parked setup | P0: costs → prices → counts are separate transactions. Partial failure/retry can replay earlier effects. Build one idempotent atomic registration RPC; test rollback at each stage. Do not claim “nothing saved” on partial success. |
| Ordinary sentence while another question is pending | :7918–10110 pending handlers; AI only at :10260 | Multiple parser/template paths can terminate first | Pending state often exists but is not uniformly supplied to AI | P0: move AI dispatch in front of legacy language handlers; bind exact controls to expected question kind, not just any awaiting state. |
| Login/invite/language/onboarding | :7365–7435 scans/login; :7528 systemCommand; handleOnboarding | Natural-language command parsers bypass model | Separate onboarding state | P1: AI selects explicit account capability, backend validates authority; retain one-use token security. Ordinary invitation sentence is not a protected confirmation. Unlinked onboarding needs its own safe AI contract. |

## Cross-cutting defects and priorities

1. **P0 routing test blind spot:** src/features/whatsapp/__tests__/aiFirstRouting.test.ts:43–94 inspects only a small eligibility substring. It can pass while pre-AI handlers consume the message. Test the actual dispatch boundary, pending states and tool loop.
2. **P0 numeric control collision:** answersPendingQuestion accepts generic confirmation/rejection in many states, even quantity questions. A `1` can mean quantity, candidate or confirmation. Require expected-answer shape, known option index and state kind.
3. **P0 schema execution boundary:** whatsappAssistant.ts:1835 checks tool NAME against ASSISTANT_TOOL_NAMES, including hidden legacy tools; it does not validate full runtime JSON schema before execution. Provider strict mode is not a backend security boundary. Validate exposed-tool schema locally before any executor call; reject malformed/extra properties without effects.
4. **P0 multiple proposals:** sequential tool execution still overwrites the single pending conversation row when two mutation tools appear in one turn (:1829). Ordering removes the race but not the loss. Reject conflicting proposals before executing either, or use an atomic combined proposal.
5. **P0 truncation:** whatsappAssistant.ts:1599 silently cuts user text to 2000 characters. A later line/negation/price band can vanish. Reject oversized input before a model call; never process a truncated financial instruction.
6. **P1 partial memory:** :4140–4208 validates only quantities in the current reply. Resolved quantities are not merged into persisted answers before asking about missing products. Two replies can repeatedly lose each other.
7. **P1 misleading failure recovery:** :4132 tells model not to mention expired state. Instead explain that an old question expired when it matters; never silently reinterpret a bare answer as a new transaction.
8. **P1 intent re-parsing:** :4440 regex is literally `/^[s]*[d][d.,s]*$/`, not digit/whitespace syntax. More importantly, fixing its escapes alone would preserve the wrong architecture: messageStatesDirection can override an AI interpretation after a contextual follow-up. Move direction meaning to a validated AI contract with original-message evidence.
9. **P1 observability:** telemetry has static prompt/tool version strings and no deployed revision, state version, retrieval status or per-tool result category. toolRounds is tool count, not rounds. Missing lookup data and missing product are indistinguishable.
10. **P1 evaluation gap:** scripts/run-evals.ts uses scripts/lib/route.ts (legacy parser chain). It labels some cases unchecked but is not end-to-end proof of AI behavior. stage-a-ai-eval v1 measures first tool choice, not memory/DB/confirmation/Meta delivery.
11. **P1 retrieval failure semantics:** catalogue lookup failures at :1486–1553 become empty lists. A lookup outage must not be presented as “product does not exist”. Mark unavailable/incomplete and block catalogue-dependent proposals until an authoritative lookup succeeds.

## Target foundation

1. Authenticate transport and active membership. Load company-scoped, expiring state.
2. Resolve only an exact control against the active question's allowed choices. All other text enters AI exactly once; no parser fallback on outage.
3. Supply bounded history, structured original draft, stable question/row IDs and live retrieval with completeness/error metadata. Retrieval content is untrusted data, not system instructions.
4. Model proposes a capability and canonical typed fields, with missing/ambiguous fields explicit. Backend validates schema, current state version, live catalogue, actor authority and numerical bounds.
5. Backend calculates totals and effects. A preview does not post stock or money. Sender confirms own operational entry; owner/accountant reporting stays restricted. DB commits effects atomically/idempotently.
6. Record a privacy-conscious trace: release/prompt/schema/model, route, state transition, retrieval health, tool results, rejection/failure layer and confirmation outcome. Replay uses synthetic/anonymized fixtures; no production writes or WhatsApp sends in evaluation mode.
7. Reviewed feedback: redact failed examples → label correction → update company alias only with approval → run held-out/multi-turn tests → review and release. No automatic self-training claim.

## Verification gates (not yet satisfied)

- Full tests, edge typecheck, frontend typecheck/build, diff check.
- Real shared tool-loop regression with mocked provider and DB fixtures; live model evaluations separately labelled.
- SQL rollback proofs: cross-company/worker-other-draft denial, worker-own confirm, supplier partial/overpayment/void, stock idempotency, registration atomicity.
- Exact WhatsApp conversation replay in a designated test business, no real merchant ledger mutations.
- Production bundle/source comparison, migration body checks, changed-functions-only deploy after gates pass, and post-deploy checks.
- Remaining failures/untested scopes must be reported. This audit is targeted across the important AI flows; it is **not** a claim that every repository line, every Supabase function, or every UI permission has been reviewed.

Phase 9 UI/reporting integration remains on hold.

## Foundation checkpoint implemented (not the complete AI modernization)

- `whatsapp-webhook/index.ts:7456`: one shared AI dispatcher runs before linked-user legacy text handlers. Ordinary text failures terminate; they never fall through to a sentence parser. This claim is limited to the linked text boundary, not unlinked onboarding or image/caption paths.
- `whatsappRouting.ts`: exact controls are scoped to active, unexpired question kinds and offered choices. Amount/quantity values are not generic yes/no answers. The second animal source is no longer confused with HAPANA. Saved sale product choices resume the typed draft directly rather than re-parsing its direction.
- `whatsappAiDirection.ts` and webhook:4466: AI supplies operation direction, backend checks kind/enum consistency. Removed messageStatesDirection and the malformed digit regular expression from the business-event executor.
- `whatsappToolBoundary.ts` / assistant loop: whole-round runtime schema validation of exposed tools, hidden/extra/invalid input rejection, one state-changing proposal per turn, no retry after an uncertain mutation, mandatory quantity evidence. Missing-product calls are rejected before execution and can be repaired by the model.
- `whatsappPendingContext.ts` / webhook:4120: bounded typed active-question snapshot, original sale recovery including date/credit/bands, product-bound quantity/unit answers merged across bubbles, explicit expired-state behavior. This is bounded memory, not independent multi-topic memory.
- `whatsappRetrievalHealth.ts`: distinguish unavailable/partial catalogue from an absent product; fail closed on catalogue-dependent proposals when core retrieval fails.
- `whatsappAiFailure.ts` / telemetry: privacy-conscious failure-layer and retrieval-health logs, prompt `risip-agent-v3-active-question`, schema `tools-foundation-v1-runtime-checked`. Existing telemetry remains; this is not yet a complete trace/replay system.
- AI account-action tool selects only protected capabilities; actor/tenant/role are server-derived. Login/invitation credentials are excluded from AI memory. No autonomous account deletion or logout without their existing confirmation.
- `stage-a-ai-eval`: authenticated, synthetic first-tool evaluation uses the real prompt/tool schema and validates returned calls, with no database handle, tool execution or WhatsApp sends. A temporary separate evaluation token is removed after a run; the existing operator token is not overwritten.

## Verification evidence for this checkpoint

1. Full suite: **175 files / 2,584 tests passed** after the final product-choice guard and prompt-budget adjustment. Baseline was 174 files / 2,545 tests. Tests include real shared assistant-loop mocks; many legacy tests are source/pure-function tests, not end-to-end executions.
2. Frontend typecheck and production build passed. Edge check passed for 20 entry points (undefined names/redeclarations/imports, **not full Deno semantic typechecking**). Build retains pre-existing CSS `-: T` and large-chunk warnings; no UI work was included.
3. Live Haiku 4.5 first-tool smoke: one run passed **9/9**, but a repeat against the committed prompt passed only **6/9**. The repeat exposed malformed payment fields (two cases) and an empty-product business-event call (one case); the new runtime boundary rejects all three before execution. Per-product retail/wholesale and contextual quantity/product choices passed. Earlier runs also exposed provider timeouts. The original evaluator's auto tool choice was corrected to match production's forced first capability. **Do not report the single 9/9 run as stable accuracy.** These are development examples, not held-out accuracy or full WhatsApp proof. Synthetic results are under `tmp/ai-foundation-*-eval.json`; no secrets are logged. An additional capture-only mode now exercises the actual assistant schema-repair loop, still without business tools, DB or WhatsApp delivery.
4. `supabase/tests/ai_foundation_isolated_rollback.sql`: **23 assertions passed on the linked database**, using only new synthetic companies/auth users inside one transaction. Proves worker-own sale/purchase confirmation, worker-other-draft and cross-company denial, idempotent confirmation, pending/confirmed stock, supplier partial payments, confirmation-time overpayment rejection, void restoration, whole-animal no-meat-stock boundary and 1,200,000 − 300,000 = 900,000 liability. Final query confirmed synthetic companies absent after rollback. Installed triggers were inspected first; no external sends invoked. This does not test true concurrent connections or every Phase 1–7 SQL case.
5. No schema change required by this checkpoint. **No migration applied and no migration-history repair performed.** Existing 0168/history discrepancies remain separately documented above.
6. Live **real assistant boundary-loop: 9/9 passed** with a capture-only executor. Supplier-payment and incomplete-historical-sale cases each required a rejected attempt followed by successful AI repair; their durations were 16.3s and 8.5s. Other cases completed in 2.7–5.8s. This demonstrates runtime schema correction, not first-attempt perfection, DB tool execution, or end-to-end WhatsApp success.

## Still not done / do not claim completion

- Unlinked onboarding and some image/caption/protected legacy paths have not been converted or fully audited. Numeric/date/payment/band wording parsers still exist behind AI tools. Therefore **the whole application is not parser-free**.
- Full canonical field contracts, a complete role matrix, atomic/idempotent multi-RPC product registration, state-version/CAS protection across every write, independent topic bubbles, and comprehensive replay/monitoring remain required.
- Permission nuance found during final review: `canUseCompanyFinanceReads` is owner/accountant, but the existing separate `canReadCompanyReporting` and prompt allow workers to read reports/profit/debts. These were **not expanded by this change**. Earlier statements that all finance reports are already boss-only are not established by this repository. Report-access policy must be reconciled explicitly with the user's intended matrix; worker-own transaction confirmation is independently proved.
- No full live WhatsApp conversation was sent because a designated test business and a user-controlled test number have not been provided. Do not silently use a real shop's stock/ledger for test sales.
- The entire repository and every production function have not been audited line-by-line. RAG remains bounded and is not a full search/pagination service. No automatic training from live conversations was added.
- A foundation deployment is an incremental safety release, **not launch approval or completion of all ten requested architecture areas**. Phase 9 remains on hold.

## Release record

Foundation code committed and pushed to main as `f3ec5491f825ca2662d5ed3ec61509f739ddac9c` (31 intended files; unrelated settings/output/build cache excluded). The isolated evaluator was deployed during testing. Main webhook release and source comparison will be appended only after they succeed. No frontend deployment is needed for this backend-only checkpoint.
