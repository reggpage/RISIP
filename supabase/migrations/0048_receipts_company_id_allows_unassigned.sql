-- Captured from production: applied on 2026-08-11 as
-- "receipts_company_id_allows_unassigned" alongside 0046, but the function body
-- was not committed at the time. This file is the source of record for it.
--
-- 0046 made receipts.project_id nullable, but this trigger still derived
-- company_id from the project and raised when there was none, so an unassigned
-- receipt could not be inserted at all. Keep the project authoritative whenever
-- one is given, and fall back to the caller-supplied company_id only when the
-- project is genuinely not chosen yet.

create or replace function public.receipts_set_company_id()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_company uuid;
begin
  if new.project_id is not null then
    select company_id into v_company from projects where id = new.project_id;
    if v_company is null then
      raise exception 'receipts.project_id % does not resolve to a company', new.project_id;
    end if;
    new.company_id := v_company;
  elsif new.company_id is null then
    raise exception 'a receipt with no project must carry a company_id';
  end if;
  return new;
end;
$function$;
