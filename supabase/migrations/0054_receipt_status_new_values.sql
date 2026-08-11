-- Phase 1b lifecycle states. Additive only: no existing row changes, and with
-- companies.approval_flow_enabled = false (the default, added in 0055) nothing
-- can ever enter these states, so behaviour is unchanged for every current company.
--
-- Must run alone: Postgres will not let a new enum value be used in the same
-- transaction that adds it.
alter type receipt_status add value if not exists 'submitted';
alter type receipt_status add value if not exists 'changes_requested';
alter type receipt_status add value if not exists 'rejected';
