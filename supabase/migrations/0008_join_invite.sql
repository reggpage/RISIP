-- Risip · atomic join-by-invite RPC.
-- Called by the join-project edge function after the visitor has verified their email OTP
-- and set a password. We create the profile + (for workers) the project_members row.
--
-- security definer + service_role only, same pattern as signup_company_v1.

create or replace function join_by_invite_v1(
  p_user_id    uuid,
  p_token      text,
  p_full_name  text,
  p_phone      text
) returns table (
  project_id  uuid,
  role        user_role
) language plpgsql security definer set search_path = public as $$
declare
  v_invite invite_links%rowtype;
  v_project projects%rowtype;
begin
  if p_user_id is null then raise exception 'user_id required'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'full_name required'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user does not exist';
  end if;
  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'profile already exists';
  end if;

  select * into v_invite from invite_links where token = p_token limit 1;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  select * into v_project from projects where id = v_invite.project_id limit 1;
  if v_project.status <> 'active' then raise exception 'project not active'; end if;

  insert into profiles (id, company_id, full_name, phone, role)
  values (p_user_id, v_project.company_id, trim(p_full_name), nullif(trim(p_phone), ''), v_invite.role);

  if v_invite.role = 'worker' then
    insert into project_members (project_id, profile_id)
    values (v_project.id, p_user_id)
    on conflict do nothing;
  end if;

  return query select v_project.id, v_invite.role;
end;
$$;

revoke all on function join_by_invite_v1(uuid, text, text, text) from public, authenticated, anon;
grant execute on function join_by_invite_v1(uuid, text, text, text) to service_role;
