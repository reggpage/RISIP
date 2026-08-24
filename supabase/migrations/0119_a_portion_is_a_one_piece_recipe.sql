-- A recipe with ONE ingredient is still a recipe.
--
-- 0114 built combinations for shop nicknames — "zege = chips + mayai 2" — and
-- required two to six pieces, because a nickname for a single product is just
-- that product under another name.
--
-- A portion is not. A butcher's "mshikaki" is one ingredient and nothing else:
--
--   mshikaki = nyama ya ngombe, kilo 0.055
--
-- Selling forty of them must take 2.2 kilos of beef off the shelf. Written as a
-- one-piece combination that already works — the reading rule, the pricing and
-- the per-product sale lines are all in place — and the ONLY thing standing in
-- the way is the count of two.
--
-- Fractional quantities need no change at all: `quantity` is already numeric
-- and only has to be above zero.
--
-- The shop still declares its own ratio. How many skewers a kilo yields is
-- asked, in the owner's words, as an AVERAGE — "kilo moja inatoa wastani wa
-- mishikaki mingapi?" — because bone and fat mean it never comes out the same
-- twice, and a system that treats an average as a law reports theft every day
-- until nobody believes it.
--
-- ROLLBACK:
--   alter table public.product_combos drop constraint product_combos_pieces_shape;
--   alter table public.product_combos add constraint product_combos_pieces_shape check (
--     jsonb_typeof(pieces) = 'array' and jsonb_array_length(pieces) between 2 and 6);
--   -- and restore wa_save_combo from 0114.

alter table public.product_combos drop constraint if exists product_combos_pieces_shape;
alter table public.product_combos add constraint product_combos_pieces_shape check (
  jsonb_typeof(pieces) = 'array'
  and jsonb_array_length(pieces) between 1 and 6
);

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
  if v_count < 1 or v_count > 6 then
    raise exception 'a combination is one to six products'
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
