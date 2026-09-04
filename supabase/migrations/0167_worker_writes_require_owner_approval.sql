-- Workers may read the business and prepare questions, but they must not add
-- anything to the books themselves. Approval is not a substitute for this
-- rule: the owner/accountant must be the actor who creates the record.
--
-- This is a database backstop for every app, RPC and WhatsApp write path. The
-- WhatsApp service-role bridge sets the resolved user's role in the request
-- claims before it calls the ledger functions, so private.auth_role() still
-- identifies the worker here. Service-role maintenance without a worker claim
-- is not blocked.

create or replace function private.refuse_worker_ledger_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if private.auth_role() = 'worker' then
    raise exception 'Mfanyakazi hawezi kuandika rekodi bila idhini ya boss au accountant.'
      using errcode = 'P0001', hint = 'worker_write_requires_owner_approval';
  end if;
  return new;
end
$function$;

comment on function private.refuse_worker_ledger_insert() is
  'Prevents workers from inserting ledger or stock-count rows. The owner or '
  'accountant must create or approve the business record.';

drop trigger if exists daily_records_worker_write_gate on public.daily_records;
create trigger daily_records_worker_write_gate
  before insert on public.daily_records
  for each row execute function private.refuse_worker_ledger_insert();

drop trigger if exists stock_counts_worker_write_gate on public.stock_counts;
create trigger stock_counts_worker_write_gate
  before insert on public.stock_counts
  for each row execute function private.refuse_worker_ledger_insert();
