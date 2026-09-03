-- Workers can read company reporting, profit and customer receivables.
-- This migration changes only the reporting read gate. Product-cost writes,
-- approvals, reversals and all other finance mutations remain role-gated.
--
-- Recreate the existing functions from their stored definitions so this
-- migration stays small while still updating databases that already applied
-- 0137. The explicit checks below fail closed if the expected functions have
-- changed shape, rather than silently widening a different function.
do $migration$
declare
  fn record;
  definition text;
  old_gate text := 'v_role not in (''owner'', ''accountant'')';
  new_gate text := 'v_role not in (''owner'', ''accountant'', ''worker'')';
begin
  for fn in
    select p.oid, p.proname, p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('bucha_reporting_snapshot', 'wa_bucha_reporting_snapshot')
       and p.pronargs in (2, 4)
  loop
    if position(old_gate in fn.prosrc) = 0 then
      if position(new_gate in fn.prosrc) > 0 then
        continue;
      end if;
      raise exception 'expected company-reporting role gate was not found in public.%', fn.proname;
    end if;

    definition := replace(pg_get_functiondef(fn.oid), old_gate, new_gate);
    execute definition;
  end loop;
end;
$migration$;
