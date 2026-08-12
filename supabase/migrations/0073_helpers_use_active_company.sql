-- The swap. Two functions change; not one policy does.
--
-- private.auth_company_id() and private.auth_role() are what every RLS policy,
-- every trigger guard and every SECURITY DEFINER RPC in the product resolves
-- through. Moving the source of "my company" from profiles.company_id (the only
-- one I have) to profiles.active_company_id (the one I am looking at) is the
-- whole of P0 -- and it is why this migration ships alone, with the finance-control
-- suite replayed either side of it.
--
-- FAIL CLOSED, DELIBERATELY. Both functions join company_members, so an
-- active_company_id that is null, or that points at a company the person does not
-- belong to, or whose membership is deactivated, yields NULL -- which every policy
-- already treats as "no access". A forged or stale pointer grants nothing.
--
-- WHAT IS NOT CHANGED: profiles.deactivated_at is still not consulted here,
-- exactly as before. Adding it would be a behaviour change wearing a refactor's
-- clothes, and it belongs in its own migration if it is wanted at all.
--
-- profiles.company_id stays. Nothing reads it after this migration, but it is the
-- rollback, and dropping it is a separate decision for a later phase.
--
-- PROVEN IDENTICAL: with 0072 backfilled, both functions were invoked as each of
-- the 6 real users, before and after, and returned the same company and the same
-- role in every case.
--
-- ROLLBACK (restores 0013-era behaviour exactly)
--   create or replace function private.auth_company_id() ... as $$
--     select company_id into v from profiles where id = auth.uid(); return v; $$;
--   create or replace function private.auth_role() ... as $$
--     select role into v from profiles where id = auth.uid(); return v; $$;

create or replace function private.auth_company_id()
returns uuid
language plpgsql
stable security definer
set search_path = 'public'
set row_security = 'off'
as $$
declare v uuid;
begin
  select p.active_company_id into v
    from profiles p
    join company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = auth.uid();
  return v;
end $$;

create or replace function private.auth_role()
returns user_role
language plpgsql
stable security definer
set search_path = 'public'
set row_security = 'off'
as $$
declare v user_role;
begin
  select m.role into v
    from profiles p
    join company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = auth.uid();
  return v;
end $$;
