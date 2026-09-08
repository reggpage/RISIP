# Admin console review — 8 September 2026

The console is useful for human-led platform operations, but it is not yet sufficient for unattended incident detection and response.

## Verified capabilities

The public deployment at https://admin.risip.online returned HTTP 200 with title **Risip Platform Console**. Its published application includes Overview, Companies, company detail, WhatsApp, AI Operations and Platform Settings. This is the platform operator's console, separate from a merchant's financial workspace.

Published RPC references include overview, company listing/detail, WhatsApp operations, AI operations, settings, company status, company AI enablement, and AI limit/reset controls. These help an operator find an affected business, inspect usage and failure patterns, and apply controlled configuration changes.

The live definitions of all four inspected mutation RPCs (`platform_admin_set_company_status`, `platform_admin_set_whatsapp_ai`, `platform_admin_set_company_ai_limits`, `platform_admin_reset_company_ai_limits`) include the server-side platform-admin check and an audit call. Migration 0155 supplies the company control implementation and requires a reason. These checks are stronger than merely hiding controls in the browser. No production settings or business statuses were changed during this review.

The AI Operations RPC in `20260906100000_phase10_ai_observability.sql` exposes aggregates and bounded diagnostics: success/failure, latency percentiles, model/runtime versions, tool/failure layer and retrieval health. It deliberately excludes merchant message bodies and financial values from diagnostic metadata. It helps diagnose *where* an AI turn failed; it does not prove that an answer was semantically correct.

## Gaps and practical priorities

| Priority | Evidence and limitation | Next useful improvement |
| --- | --- | --- |
| High | Live `cron.job` contains only the active `billing-sweep-daily` schedule. No database schedule invokes the operations monitor. An external scheduler was not verified. | Configure the existing monitor with an accountable incident owner and authorized alert destination; test detection and recovery alerts. |
| High | AI operations measure operational failure; a wrong-but-successful interpretation can still look successful. | Maintain release evaluation cases for sale intent, price corrections, stock units, pending context, permissions and retries; expose aggregate regression outcomes alongside runtime versions. |
| Medium | The published route/RPC inventory has no dedicated policy acceptance or privacy-request workflow. | Add restricted acceptance-version reporting and a request workflow with identity verification, ownership, deadlines and resolution history. Avoid exposing merchant content unnecessarily. |
| Medium | Backup restore, concurrent recovery and migration rollback drills were pending in the 6 September readiness document. This review did not execute or independently close those drills. | Attach dated evidence from an isolated recovery environment and assign an owner to each remaining readiness gate. |
| Medium | This review inspected the public deployment, published bundle, repository definitions and selected live database definitions. It did not log in as every platform role or exercise destructive controls. | Run an authenticated read/support/admin permission matrix and verify denied actions, required reasons and audit entries in a controlled environment. |

## Conclusion

Keep this console as the platform operations center. It already gives useful company, usage, WhatsApp and AI diagnostics. Its next priority is actionable monitoring and evidence of recovery, followed by policy/privacy operations. A healthy dashboard alone cannot establish accounting correctness, AI comprehension or complete launch readiness.
