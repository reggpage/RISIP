-- Keep the receipts list in sync after uploads, AI extraction, re-analysis and deletes.
-- Without this, the database changes successfully but the UI only sees them after
-- a full page refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'receipts'
  ) then
    alter publication supabase_realtime add table public.receipts;
  end if;
end
$$;

alter table public.receipts replica identity full;
