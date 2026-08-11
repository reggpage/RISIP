# Migration history snapshot — before repair (2026-08-12)

Taken before `supabase migration repair`. Repair changes bookkeeping only: it
writes/removes rows in `supabase_migrations.schema_migrations` and never runs the
migrations' DDL. No business data is touched.

## Remote entries present (timestamp versions from `apply_migration`)

| version | name | equivalent local file |
| --- | --- | --- |
| 20260809212045 | receipt_reimbursements | 0042 |
| 20260811112725 | whatsapp_link | 0043 |
| 20260811191910 | receipt_details_confirmed | 0044 |
| 20260811201756 | cancel_petty_cash_request | 0045 |
| 20260811203250 | receipt_unassigned_project | 0046 |
| 20260811203335 | receipts_company_id_allows_unassigned | 0048 |
| 20260811203547 | whatsapp_language_and_state | 0047 |
| 20260811205311 | whatsapp_message_timings | appended into 0047 |

## Local files with no remote entry

0038, 0039, 0040, 0041 — applied earlier as raw SQL, never recorded.
0042–0048 — recorded, but under the timestamp versions above rather than their
file numbers.

## Verified already applied (objects exist in production)

- 0038 `petty_cash_apply_transaction_ai` fires on INSERT **or UPDATE**
- 0039 petty cash tables in `supabase_realtime` (plus `app_notifications`)
- 0040 `invoices.company_id` / `public_token` / `line_items`, `invoice_comments`, `invoice_activity`
- 0041 unique index `receipts_global_verification_unique`
- 0042–0048 receipt columns, whatsapp tables, RPCs and policies all confirmed present

## Rollback

Re-insert the removed timestamp rows and delete the numeric ones:

```sql
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260809212045','receipt_reimbursements'),
  ('20260811112725','whatsapp_link'),
  ('20260811191910','receipt_details_confirmed'),
  ('20260811201756','cancel_petty_cash_request'),
  ('20260811203250','receipt_unassigned_project'),
  ('20260811203335','receipts_company_id_allows_unassigned'),
  ('20260811203547','whatsapp_language_and_state'),
  ('20260811205311','whatsapp_message_timings');
delete from supabase_migrations.schema_migrations where version between '0038' and '0048';
```
