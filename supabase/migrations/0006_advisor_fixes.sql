-- Risip · security advisor fixes.
-- 1. Pin search_path on the two remaining functions that lack it.
-- 2. Move the three RLS-helper functions out of `public` so PostgREST can't expose
--    them at /rest/v1/rpc/<name>. RLS policies keep working because Postgres stores
--    function references by OID, not by name — `alter function ... set schema` is
--    transparent to policies (and to storage.objects policies).

-- ─── 1. search_path pinning ────────────────────────────────────────────────
alter function public.receipts_set_company_id() set search_path = public;
alter function public.storage_first_uuid_segment(text) set search_path = public;

-- ─── 2. hide RLS helpers from the REST API ─────────────────────────────────
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

alter function public.auth_company_id()          set schema private;
alter function public.auth_role()                set schema private;
alter function public.auth_can_see_project(uuid) set schema private;

-- Re-grant execute (schema move preserves grants, but be explicit for clarity).
grant execute on function private.auth_company_id()          to authenticated;
grant execute on function private.auth_role()                to authenticated;
grant execute on function private.auth_can_see_project(uuid) to authenticated;
