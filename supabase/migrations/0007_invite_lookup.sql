-- Risip · public invite lookup.
-- The /join/:token page needs to render project + company + role BEFORE the visitor logs in.
-- RLS on invite_links + projects + companies blocks anon reads, so we expose a narrow
-- SECURITY DEFINER RPC that returns only what the join page shows — nothing sensitive.

create or replace function get_invite_info(p_token text) returns table (
  project_id      uuid,
  project_name    text,
  company_id      uuid,
  company_name    text,
  role            user_role,
  is_valid        boolean,
  reason          text
) language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select il.project_id, il.role, il.revoked_at, il.expires_at,
         p.name as project_name, p.company_id, p.status as project_status,
         c.name as company_name
    into r
    from invite_links il
    join projects p on p.id = il.project_id
    join companies c on c.id = p.company_id
   where il.token = p_token
   limit 1;

  if not found then
    return query select null::uuid, null::text, null::uuid, null::text, null::user_role, false, 'not_found'::text;
    return;
  end if;

  if r.revoked_at is not null then
    return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, false, 'revoked'::text;
    return;
  end if;

  if r.expires_at is not null and r.expires_at < now() then
    return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, false, 'expired'::text;
    return;
  end if;

  if r.project_status <> 'active' then
    return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, false, 'project_inactive'::text;
    return;
  end if;

  return query select r.project_id, r.project_name, r.company_id, r.company_name, r.role, true, null::text;
end;
$$;

revoke all on function get_invite_info(text) from public;
grant execute on function get_invite_info(text) to anon, authenticated;
