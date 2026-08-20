-- Names a shop uses for two products sold as one thing: chips yai, zege.
--
-- The owner's list of what was failing: a kijiwe registers "chips kavu" and
-- "yai" and then every real order arrives as "chips yai", "chipssosej" or
-- "zege". Splitting handles the first two — the words are the shop's own — but
-- "zege" is a nickname, 0.00 similar to "chips mayai", and no amount of fuzzy
-- matching will ever reach it. A nickname has to be LEARNED, once.
--
-- This is a reading rule, not a ledger. Sales are still written as ordinary
-- per-product lines, so stock and money are unaffected by anything here; what
-- changes is only how a phrase is read into those lines. Editing a combo does
-- not rewrite a single past sale.
--
-- Owner and accountant only, on the owner's own instruction: a worker who saved
-- "zege = chips + kuku kilo" would misprice every zege sold after it.
--
-- ROLLBACK:
--   drop function if exists public.wa_save_combo(text, text, jsonb);
--   drop function if exists public.wa_delete_combo(text, text);
--   drop function if exists public.wa_company_combos(uuid);
--   drop table if exists public.product_combos;

create table if not exists public.product_combos (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  name_key    text not null,
  -- [{ "key": "...", "name": "...", "quantity": 1, "unit": null }, …]
  pieces      jsonb not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_combos_name_key_len check (length(name_key) between 2 and 80),
  constraint product_combos_pieces_shape check (
    jsonb_typeof(pieces) = 'array'
    and jsonb_array_length(pieces) between 2 and 6
  )
);

create unique index if not exists product_combos_company_name_idx
  on public.product_combos (company_id, name_key);

alter table public.product_combos enable row level security;

drop policy if exists product_combos_read on public.product_combos;
create policy product_combos_read on public.product_combos
  for select to authenticated
  using (company_id = private.auth_company_id());

-- Writing is finance-only. Reading is everybody's, because a worker recording a
-- sale has to be able to write "zege 3" and have it understood.
drop policy if exists product_combos_write on public.product_combos;
create policy product_combos_write on public.product_combos
  for all to authenticated
  using (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'))
  with check (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'accountant'));

comment on table public.product_combos is
  'Shop-taught names for combinations of products (chips yai, zege). A reading rule only: sales are still stored as per-product lines.';

-- Read: used by the webhook with the service role, one round trip per message.
create or replace function public.wa_company_combos(p_company_id uuid)
returns table (name text, pieces jsonb)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select c.name, c.pieces
    from public.product_combos c
   where c.company_id = p_company_id
   order by c.name;
$$;

revoke execute on function public.wa_company_combos(uuid) from public, anon, authenticated;
grant execute on function public.wa_company_combos(uuid) to service_role;

-- Save: the phone decides who is asking, and the role decides whether they may.
create or replace function public.wa_save_combo(
  p_phone text,
  p_name text,
  p_pieces jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text;
  v_name text; v_key text; v_piece jsonb; v_count int;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may save a combination'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_key := private.product_key(v_name);
  if v_key is null or length(v_key) < 2 then
    raise exception 'that name cannot be used' using errcode = 'P0001', hint = 'bad_name';
  end if;

  if jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'no pieces given' using errcode = 'P0001', hint = 'empty';
  end if;
  v_count := jsonb_array_length(p_pieces);
  if v_count < 2 or v_count > 6 then
    raise exception 'a combination is two to six products'
      using errcode = 'P0001', hint = 'bad_pieces';
  end if;

  -- Every piece must be a product this company actually has. A combination
  -- pointing at a name nobody sells would price a sale from nothing.
  for v_piece in select * from jsonb_array_elements(p_pieces) loop
    if not exists (
      select 1 from public.company_product_names(v_company) n
       where private.product_key(n.product_name) = private.product_key(v_piece ->> 'key')
    ) then
      raise exception 'not a product of this business: %', coalesce(v_piece ->> 'name', v_piece ->> 'key')
        using errcode = 'P0001', hint = 'unknown_product';
    end if;
    if coalesce((v_piece ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'a piece needs a quantity above zero'
        using errcode = 'P0001', hint = 'bad_quantity';
    end if;
  end loop;

  insert into public.product_combos (company_id, name, name_key, pieces, created_by)
  values (v_company, v_name, v_key, p_pieces, v_profile)
  on conflict (company_id, name_key)
  do update set pieces = excluded.pieces, name = excluded.name, updated_at = now();

  return jsonb_build_object('saved', true, 'name', v_name, 'pieces', v_count);
end $$;

revoke execute on function public.wa_save_combo(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_save_combo(text, text, jsonb) to service_role;

-- Forgetting one, for when a shop stops selling it that way.
create or replace function public.wa_delete_combo(p_phone text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_key text; v_gone int;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may remove a combination'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  v_key := private.product_key(btrim(coalesce(p_name, '')));
  delete from public.product_combos
   where company_id = v_company and name_key = v_key;
  get diagnostics v_gone = row_count;
  return jsonb_build_object('deleted', v_gone);
end $$;

revoke execute on function public.wa_delete_combo(text, text) from public, anon, authenticated;
grant execute on function public.wa_delete_combo(text, text) to service_role;
