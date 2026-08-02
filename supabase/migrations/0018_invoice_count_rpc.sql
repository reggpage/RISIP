-- Staff can't SELECT invoices (finance-only RLS), so the dashboard "Invoices this month"
-- metric returned 0 for them. This security-definer RPC returns just the count for the
-- caller's company/month — no invoice rows are exposed.
create or replace function invoices_this_month_count(p_project uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  n   integer;
begin
  cid := private.auth_company_id();
  if cid is null then return 0; end if;
  select count(*) into n
  from invoices i
  join projects p on p.id = i.project_id
  where p.company_id = cid
    and i.created_at >= date_trunc('month', now())
    and (p_project is null or i.project_id = p_project);
  return coalesce(n, 0);
end;
$$;
grant execute on function invoices_this_month_count(uuid) to authenticated;
