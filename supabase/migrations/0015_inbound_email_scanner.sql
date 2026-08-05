-- Scan-to-email inbound processing.
-- Receipts that arrive via the company's scanner mailbox land in a review state so the
-- accountant checks them before they count.
alter type receipt_status add value if not exists 'pending_review';

-- Per-company inbound scanner mailbox token (<token>@scan.risip.co) + the printer sender
-- allowed to submit to it (optional hardening).
alter table companies add column if not exists scanner_inbox_token uuid not null default gen_random_uuid();
alter table companies add column if not exists scanner_sender_email text;
create unique index if not exists companies_scanner_inbox_token_idx on companies(scanner_inbox_token);
