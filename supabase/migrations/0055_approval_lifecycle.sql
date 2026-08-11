-- Phase 1b: employee submission separated from finance approval.
-- Gated behind companies.approval_flow_enabled, default false, so nothing changes
-- for any existing company until it is switched on one at a time.
--
-- BLAST RADIUS: all six financial read paths (useDashboardData, reimbursements,
-- retirements, ProjectDetail, generate-invoice, export-project-excel) filter on an
-- explicit allow-list (status = 'confirmed'), never a deny-list, so a new status
-- cannot leak into a total by omission. Verified before writing this.
--
-- ROLLBACK: set approval_flow_enabled = false everywhere (instant, per company),
-- then move any rows in the new states back to pending_review. The enum values
-- remain -- Postgres cannot drop them -- and are harmless while unused.

alter table companies
  add column if not exists approval_flow_enabled boolean not null default false,
  add column if not exists allow_self_approval boolean not null default false;

-- One-person companies would otherwise be unable to approve anything, so they
-- start with the exception on. Companies with two or more finance users get the
-- safe default.
update companies c set allow_self_approval = true
 where (select count(*) from profiles p
         where p.company_id = c.id and p.deactivated_at is null
           and p.role in ('owner','accountant')) <= 1;

alter table receipts
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references profiles(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references profiles(id),
  add column if not exists decision_reason text;

-- Append-only history for every status change, on every ingestion path. Written
-- by trigger so it covers flag=false companies too -- otherwise the first audited
-- event would be the first reversal, with the confirmations before it unrecorded.
create table if not exists receipt_audit_log (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references companies(id) on delete cascade,
  receipt_id                uuid references receipts(id) on delete set null,
  actor_id                  uuid references profiles(id) on delete set null,
  event                     text not null,
  old_status                text,
  new_status                text,
  old_amount                numeric(14,2),
  new_amount                numeric(14,2),
  payment_method            text,
  petty_cash_account_id     uuid references petty_cash_accounts(id) on delete set null,
  petty_cash_transaction_id uuid references petty_cash_transactions(id) on delete set null,
  reason                    text,
  self_approved             boolean not null default false,
  created_at                timestamptz not null default now()
);
create index if not exists receipt_audit_log_receipt_idx on receipt_audit_log (receipt_id, created_at desc);
create index if not exists receipt_audit_log_company_idx on receipt_audit_log (company_id, created_at desc);

alter table receipt_audit_log enable row level security;

drop policy if exists receipt_audit_log_finance_select on receipt_audit_log;
create policy receipt_audit_log_finance_select on receipt_audit_log
  for select to authenticated
  using (company_id = private.auth_company_id()
         and private.auth_role() = any (array['owner','accountant']::user_role[]));
-- No insert/update/delete policy: append-only, written by trigger only.

create or replace function public.receipts_write_audit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  insert into public.receipt_audit_log (
    company_id, receipt_id, actor_id, event, old_status, new_status,
    old_amount, new_amount, payment_method, reason
  ) values (
    new.company_id, new.id, coalesce(new.decided_by, new.submitted_by, auth.uid()),
    case new.status
      when 'confirmed' then 'confirmed'
      when 'submitted' then 'submitted'
      when 'changes_requested' then 'changes_requested'
      when 'rejected' then 'rejected'
      else 'status_changed' end,
    case when tg_op = 'UPDATE' then old.status::text else null end,
    new.status::text,
    case when tg_op = 'UPDATE' then old.total_amount else null end,
    new.total_amount, new.payment_method, new.decision_reason
  );
  return new;
end $$;

drop trigger if exists receipts_write_audit_aiu on receipts;
create trigger receipts_write_audit_aiu
  after insert or update of status on receipts
  for each row execute function public.receipts_write_audit();

revoke execute on function public.receipts_write_audit() from public, anon, authenticated;
