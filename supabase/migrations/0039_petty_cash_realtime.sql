-- Live petty cash: without these tables in the realtime publication, the admin
-- page only updated after a manual browser refresh (postgres_changes never fired
-- for petty_cash_accounts / petty_cash_transactions). Add both so pending top-ups
-- appear instantly and balances move live when staff accept.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'petty_cash_transactions'
  ) then
    alter publication supabase_realtime add table public.petty_cash_transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'petty_cash_accounts'
  ) then
    alter publication supabase_realtime add table public.petty_cash_accounts;
  end if;
end $$;
