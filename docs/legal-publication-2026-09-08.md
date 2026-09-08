# Risip policy publication and acceptance

## Source and scope

The bilingual publication is in `supabase/functions/_shared/risipLegal.ts`, version `2026-09-08`. Public `/terms` and `/privacy` pages and the AI help tool share this source. Migration 0176 archives the exact English and Swahili documents. Future policy changes require a new version and migration; do not rewrite an accepted publication.

The terms cover authority and adult accounts, service scope, AI review and confirmation, account security, acceptable use, plans and billing, records ownership, availability, responsibility, disputes, cancellation and changes. The privacy notice covers data categories and purposes, business/operator responsibilities, AI processing, providers, transfers, retention, security, browser storage, rights, complaints and children.

## Acceptance behavior

The final web signup step has an unchecked, required agreement with links to both documents. The draft endpoint validates explicit acceptance and the version and records a server timestamp. This anonymous draft does not constitute acceptance on behalf of an unrelated authenticated profile.

At first authenticated app entry, a separate unchecked agreement is required before protected pages render. The database records the authenticated profile, policy version, server time, language, source and privacy acknowledgment. Retrying does not overwrite the original evidence. Profile-scoped RLS and revoked direct client writes protect these records. The web chat endpoint also checks current acceptance before accepting a turn. This is not a claim that every existing financial RPC was changed to enforce legal acceptance.

Acceptance of Terms is distinct from optional data-processing consent. The notice explicitly avoids claiming that one checkbox authorizes advertising, unrelated processing or an international transfer that otherwise needs safeguards or approval.

## Operator facts and legal review

The publication uses the existing service name **Risip**, homepage contact **reaganfraizer13@gmail.com**, and published location **Mbezi Shule, Dar es Salaam, Tanzania**. The owner's exact legal entity name, registration details and preferred privacy contact were requested but have not yet been supplied. No incorporation, PDPC registration, transfer permit, fixed retention period, provider training restriction or guaranteed refund outcome is invented.

This is a service-policy draft and implementation, not a certification of legal compliance or enforceability. The operator should confirm its legal identity, current processor contracts/locations, retention schedule and applicable registration/transfer obligations with qualified Tanzanian counsel before treating the policy as legally finalized. Any material revision should receive a new publication version and renewed acceptance.

## Primary legal references reviewed

- [Tanzania Personal Data Protection Act](https://www.pdpc.go.tz/media/media/THE_PERSONAL_DATA_PROTECTION_ACT.pdf): processing responsibilities and data-subject protections inform the notice; publishing a notice is not proof of compliance.
- [2023 collection and processing regulations](https://www.pdpc.go.tz/media/media/GN_NO._449C_OF_2023_3_1_2_TJPKuyC.pdf): international transfer requirements must be assessed separately from a terms checkbox.
- [PDPC privacy notice](https://pdpc.go.tz/privacy-notice/) and [PDPC FAQs](https://pdpc.go.tz/feedback-faqs/): regulator contact and rights context.

## Verification

The migration and acceptance proof ran together in a transaction that rolled back. False acceptance, stale version, missing profile, anonymous execution and direct client writes were rejected; retry evidence stayed unchanged and cross-profile reads were empty. Browser tests used synthetic intercepted responses, not real acceptance or business writes, to verify public bilingual pages, mobile layout, required signup agreement and first-entry gating.
