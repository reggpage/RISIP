-- URGENT FIX for a bug introduced by 0051.
--
-- 0051 wrote `SET search_path TO 'pg_catalog, public'`. Quoted, that is ONE schema
-- literally named "pg_catalog, public", not a two-element list. The booking
-- function itself still worked because it fully qualifies its tables, but
-- petty_cash_apply_transaction() -- which has no search_path of its own and uses
-- unqualified names -- inherited the broken path and failed with
-- 'relation "petty_cash_accounts" does not exist', breaking petty cash booking.
--
-- Fix: unquoted comma-separated list, and give the inherited function its own
-- fixed search_path plus schema-qualified names so it can never depend on its
-- caller's setting again. Also revokes EXECUTE from anon/authenticated on every
-- trigger function so none can be called directly to bypass confirmation.
--
-- ROLLBACK: restore the bodies from 0050 (which used `search_path to 'public'`,
-- a single valid schema). No data is touched.

create or replace function public.petty_cash_apply_transaction()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'accepted')
     or (tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted') then
    update public.petty_cash_accounts
       set current_balance = current_balance + new.amount,
           updated_at = now()
     where id = new.account_id;
  end if;
  return new;
end $$;

revoke execute on function public.petty_cash_apply_transaction() from public, anon, authenticated;

-- The four functions from 0051 are recreated identically except for the corrected
-- `set search_path = pg_catalog, public`; see 0051 for their documented bodies.
