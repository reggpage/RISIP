-- A product may be bought in one unit and sold in declared portions.
--
-- The old rule (0095) prevented a product being counted in one unit and priced
-- in another because there was no conversion between them. Keep that safety:
-- every additional unit below has an explicit, immutable size in ONE base unit.
-- Nothing here derives "robo", "nusu", "ndoo" or any other word from its name.
--
-- Example (all numbers are stated by the trader):
--   mafuta: base = lita
--   ndoo:   20 lita, purchase unit
--   robo:   0.25 lita, sale unit @ 700
--   nusu:   0.50 lita, sale unit @ 1,200
--
-- Existing rows keep their old meaning. New configured rows carry a conversion
-- snapshot in 0108, so a later price change cannot rewrite stock history.

create table if not exists public.product_units (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  product_key        text not null,
  product_name       text not null,
  unit_key           text not null,
  unit_name          text not null,
  base_quantity      numeric(18,6) not null check (base_quantity > 0),
  is_base            boolean not null default false,
  can_purchase       boolean not null default false,
  can_sell           boolean not null default false,
  can_count          boolean not null default true,
  created_by         uuid not null references public.profiles(id) on delete restrict,
  created_at         timestamptz not null default clock_timestamp(),
  constraint product_units_names_not_blank check (
    length(btrim(product_key)) >= 2
    and length(btrim(product_name)) >= 2
    and length(btrim(unit_key)) between 1 and 40
    and length(btrim(unit_name)) between 1 and 40
  ),
  constraint product_units_base_is_one check (not is_base or base_quantity = 1),
  unique (company_id, product_key, unit_key)
);

create unique index if not exists product_units_one_base
  on public.product_units (company_id, product_key)
  where is_base;

create index if not exists product_units_lookup
  on public.product_units (company_id, product_key, unit_key);

create table if not exists public.product_unit_audit_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  product_key    text not null,
  actor_id       uuid not null references public.profiles(id) on delete restrict,
  action         text not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default clock_timestamp()
);

create index if not exists product_unit_audit_lookup
  on public.product_unit_audit_log (company_id, product_key, created_at desc);

alter table public.product_units enable row level security;
alter table public.product_unit_audit_log enable row level security;
revoke all on public.product_units, public.product_unit_audit_log from public, anon, authenticated;

drop policy if exists product_units_company_read on public.product_units;
create policy product_units_company_read on public.product_units
  for select to authenticated
  using (company_id = private.auth_company_id());

drop policy if exists product_unit_audit_finance_read on public.product_unit_audit_log;
create policy product_unit_audit_finance_read on public.product_unit_audit_log
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() in ('owner', 'accountant')
  );

grant select on public.product_units to authenticated;
grant select on public.product_unit_audit_log to authenticated;

-- The unit attached to an append-only cost/price row remains readable even if
-- the product later gains more prices. These columns are snapshots, not caches.
alter table public.product_costs
  add column if not exists base_unit text,
  add column if not exists unit_base_quantity numeric(18,6),
  add column if not exists base_unit_cost numeric(18,6);

-- Do not rewrite existing ledger rows. Legacy costs keep their original fields;
-- readers treat a missing conversion snapshot as one-to-one. New rows receive
-- an explicit immutable snapshot from the insert trigger below.

alter table public.product_costs
  add constraint product_costs_unit_base_quantity_positive
    check (unit_base_quantity is null or unit_base_quantity > 0),
  add constraint product_costs_base_unit_cost_positive
    check (base_unit_cost is null or base_unit_cost > 0);

alter table public.product_selling_prices
  add column if not exists sale_unit text,
  add column if not exists sale_unit_key text,
  add column if not exists unit_base_quantity numeric(18,6);

-- Existing price rows likewise remain byte-for-byte historical. A null
-- conversion is the pre-portion one-to-one representation used by readers.

alter table public.product_selling_prices
  add constraint selling_prices_unit_base_quantity_positive
    check (unit_base_quantity is null or unit_base_quantity > 0);

create index if not exists product_selling_prices_unit_lookup
  on public.product_selling_prices
    (company_id, product_key, sale_unit_key, effective_from desc, created_at desc);

create or replace function private.product_declared_unit(
  p_company uuid,
  p_product_key text,
  p_unit text
)
returns public.product_units
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select u
    from public.product_units u
   where u.company_id = p_company
     and u.product_key = private.product_key(p_product_key)
     and u.unit_key = private.product_key(p_unit)
   limit 1;
$$;

revoke all on function private.product_declared_unit(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.product_declared_unit(uuid, text, text) to service_role;

-- For configured products 0095's old "one unit only" comparison must stand
-- aside; the insert triggers below enforce the stricter declared-unit rule.
-- Unconfigured products retain 0095 exactly.
create or replace function private.product_unit(p_company uuid, p_key text)
returns text
language sql stable
set search_path = pg_catalog, public
as $$
  select case
    when exists (
      select 1 from public.product_units u
       where u.company_id = p_company and u.product_key = private.product_key(p_key)
    ) then null
    else (
      select unit from (
        select c.unit, c.effective_from as at
          from public.product_costs c
         where c.company_id = p_company and private.product_key(c.product_key) = private.product_key(p_key)
           and nullif(btrim(coalesce(c.unit, '')), '') is not null
        union all
        select s.unit, s.counted_at
          from public.stock_counts s
         where s.company_id = p_company and private.product_key(s.product_key) = private.product_key(p_key)
           and nullif(btrim(coalesce(s.unit, '')), '') is not null
        union all
        select l.unit, r.occurred_at
          from public.daily_record_lines l
          join public.daily_records r on r.id = l.daily_record_id
         where r.company_id = p_company and private.product_key(l.description) = private.product_key(p_key)
           and r.status = 'confirmed'
           and nullif(btrim(coalesce(l.unit, '')), '') is not null
      ) stated
      order by at desc
      limit 1
    )
  end;
$$;

create or replace function private.guard_product_cost_unit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.product_units;
  v_base text;
begin
  if not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = private.product_key(new.product_key)
  ) then
    new.unit_base_quantity := coalesce(new.unit_base_quantity, 1);
    new.base_unit := coalesce(new.base_unit, new.unit);
    new.base_unit_cost := coalesce(new.base_unit_cost, round(new.unit_cost / new.unit_base_quantity, 6));
    return new;
  end if;

  if nullif(btrim(coalesce(new.unit, '')), '') is null then
    raise exception 'a configured product cost needs its purchase unit'
      using errcode = 'P0001', hint = 'unit_required';
  end if;
  select * into v_unit
    from private.product_declared_unit(new.company_id, new.product_key, new.unit);
  if v_unit.id is null or not v_unit.can_purchase then
    raise exception 'this is not a declared purchase unit for the product'
      using errcode = 'P0001', hint = 'unknown_purchase_unit';
  end if;
  select unit_name into v_base from public.product_units
   where company_id = new.company_id and product_key = private.product_key(new.product_key) and is_base;
  new.product_key := private.product_key(new.product_key);
  new.unit := v_unit.unit_name;
  new.base_unit := v_base;
  new.unit_base_quantity := v_unit.base_quantity;
  new.base_unit_cost := round(new.unit_cost / v_unit.base_quantity, 6);
  return new;
end;
$$;

drop trigger if exists product_costs_guard_declared_unit on public.product_costs;
create trigger product_costs_guard_declared_unit
  before insert on public.product_costs
  for each row execute function private.guard_product_cost_unit();

create or replace function private.guard_product_selling_unit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.product_units;
  v_key text := private.product_key(new.product_key);
  v_matches integer;
begin
  if not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = v_key
  ) then
    -- Existing price RPCs accept a product name but no separate sale-unit
    -- argument. "bei ya mafuta robo ..." is therefore resolved only when the
    -- full key is an exact declared product+unit pair. It must never create a
    -- phantom product called "mafuta robo".
    if nullif(btrim(coalesce(new.sale_unit, '')), '') is null then
      select count(*) into v_matches
        from public.product_units u
       where u.company_id = new.company_id
         and v_key = u.product_key || ' ' || u.unit_key
         and u.can_sell;
      if v_matches > 1 then
        raise exception 'the selling price matches more than one declared unit'
          using errcode = 'P0001', hint = 'ambiguous_unit';
      end if;
      if v_matches = 1 then
        select * into v_unit
          from public.product_units u
         where u.company_id = new.company_id
           and v_key = u.product_key || ' ' || u.unit_key
           and u.can_sell;
        new.product_key := v_unit.product_key;
        new.product_name := v_unit.product_name;
        new.sale_unit := v_unit.unit_name;
        v_key := v_unit.product_key;
      end if;
    end if;
  end if;

  if v_unit.id is null and not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = v_key
  ) then
    new.sale_unit := nullif(btrim(coalesce(new.sale_unit, '')), '');
    new.sale_unit_key := case when new.sale_unit is null then null else private.product_key(new.sale_unit) end;
    new.unit_base_quantity := coalesce(new.unit_base_quantity, 1);
    return new;
  end if;

  -- Existing app RPCs have no unit argument. For backward compatibility they
  -- update the declared base price; portion prices always use the new RPC.
  if v_unit.id is not null then
    null;
  elsif nullif(btrim(coalesce(new.sale_unit, '')), '') is null then
    select * into v_unit from public.product_units
     where company_id = new.company_id and product_key = v_key and is_base;
  else
    select * into v_unit
      from private.product_declared_unit(new.company_id, v_key, new.sale_unit);
  end if;
  if v_unit.id is null or not v_unit.can_sell then
    raise exception 'this is not a declared selling unit for the product'
      using errcode = 'P0001', hint = 'unknown_sale_unit';
  end if;
  new.product_key := private.product_key(new.product_key);
  new.sale_unit := v_unit.unit_name;
  new.sale_unit_key := v_unit.unit_key;
  new.unit_base_quantity := v_unit.base_quantity;
  return new;
end;
$$;

drop trigger if exists product_selling_prices_guard_declared_unit on public.product_selling_prices;
create trigger product_selling_prices_guard_declared_unit
  before insert on public.product_selling_prices
  for each row execute function private.guard_product_selling_unit();

create or replace function private.configure_product_units(
  p_company uuid,
  p_actor uuid,
  p_name text,
  p_base_unit text,
  p_purchase_unit text,
  p_purchase_size numeric,
  p_purchase_cost numeric,
  p_sale_units jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text := private.product_key(p_name);
  v_base_key text := private.product_key(p_base_unit);
  v_purchase_key text := private.product_key(p_purchase_unit);
  v_currency text;
  v_item jsonb;
  v_unit text;
  v_unit_key text;
  v_size numeric;
  v_retail numeric;
  v_wholesale numeric;
  v_min numeric;
  v_count integer := 0;
begin
  if p_company is null or p_actor is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if v_base_key is null or v_purchase_key is null then
    raise exception 'base and purchase units are required' using errcode = 'P0001', hint = 'unit_required';
  end if;
  if p_purchase_size is null or p_purchase_size <= 0 or p_purchase_size > 1000000 then
    raise exception 'purchase unit size is out of range' using errcode = 'P0001', hint = 'invalid_conversion';
  end if;
  if v_purchase_key = v_base_key and abs(p_purchase_size - 1) > 0.000001 then
    raise exception 'the base unit must have a conversion size of one'
      using errcode = 'P0001', hint = 'conversion_conflict';
  end if;
  if p_purchase_cost is null or p_purchase_cost <= 0 or p_purchase_cost > 1000000000 then
    raise exception 'purchase cost is out of range' using errcode = 'P0001', hint = 'invalid_cost';
  end if;
  if jsonb_typeof(p_sale_units) <> 'array' or jsonb_array_length(p_sale_units) = 0 then
    raise exception 'at least one selling unit is required' using errcode = 'P0001', hint = 'no_sale_units';
  end if;
  if jsonb_array_length(p_sale_units) > 30 then
    raise exception 'too many selling units' using errcode = 'P0001', hint = 'too_many_units';
  end if;
  if exists (select 1 from public.product_units where company_id = p_company and product_key = v_key) then
    raise exception 'this product already has a unit setup'
      using errcode = 'P0001', hint = 'already_configured';
  end if;

  select currency into v_currency from public.companies where id = p_company;
  if v_currency is null then
    raise exception 'company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  -- Validate every selling unit before writing any row.
  for v_item in select value from jsonb_array_elements(p_sale_units) loop
    v_unit := btrim(coalesce(v_item ->> 'unit', ''));
    v_unit_key := private.product_key(v_unit);
    v_size := nullif(v_item ->> 'base_quantity', '')::numeric;
    v_retail := nullif(v_item ->> 'retail', '')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min := nullif(v_item ->> 'min_qty', '')::numeric;
    if v_unit_key is null or length(v_unit_key) > 40 then
      raise exception 'a selling unit name is not usable' using errcode = 'P0001', hint = 'invalid_unit';
    end if;
    if v_size is null or v_size <= 0 or v_size > 1000000 then
      raise exception 'selling unit % has an invalid conversion', v_unit
        using errcode = 'P0001', hint = 'invalid_conversion';
    end if;
    if v_retail is null or v_retail <= 0 or v_retail > 1000000000 then
      raise exception 'selling unit % has an invalid price', v_unit
        using errcode = 'P0001', hint = 'invalid_price';
    end if;
    if v_wholesale is not null and (v_wholesale <= 0 or v_wholesale > v_retail) then
      raise exception 'selling unit % has an invalid wholesale price', v_unit
        using errcode = 'P0001', hint = 'invalid_wholesale';
    end if;
    if v_min is not null and (v_min <= 0 or v_wholesale is null) then
      raise exception 'selling unit % has an invalid wholesale minimum', v_unit
        using errcode = 'P0001', hint = 'invalid_min_qty';
    end if;
  end loop;

  insert into public.product_units
    (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
     is_base, can_purchase, can_sell, can_count, created_by)
  values
    (p_company, v_key, btrim(p_name), v_base_key, btrim(p_base_unit), 1,
     true, v_base_key = v_purchase_key, false, true, p_actor);

  if v_purchase_key <> v_base_key then
    insert into public.product_units
      (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
       is_base, can_purchase, can_sell, can_count, created_by)
    values
      (p_company, v_key, btrim(p_name), v_purchase_key, btrim(p_purchase_unit),
       round(p_purchase_size, 6), false, true, false, true, p_actor);
  else
    update public.product_units
       set can_purchase = true
     where company_id = p_company and product_key = v_key and unit_key = v_base_key;
  end if;

  for v_item in select value from jsonb_array_elements(p_sale_units) loop
    v_unit := btrim(v_item ->> 'unit');
    v_unit_key := private.product_key(v_unit);
    v_size := (v_item ->> 'base_quantity')::numeric;
    v_retail := (v_item ->> 'retail')::numeric;
    v_wholesale := nullif(v_item ->> 'wholesale', '')::numeric;
    v_min := nullif(v_item ->> 'min_qty', '')::numeric;

    insert into public.product_units
      (company_id, product_key, product_name, unit_key, unit_name, base_quantity,
       is_base, can_purchase, can_sell, can_count, created_by)
    values
      (p_company, v_key, btrim(p_name), v_unit_key, v_unit, round(v_size, 6),
       v_unit_key = v_base_key, v_unit_key = v_purchase_key, true, true, p_actor)
    on conflict (company_id, product_key, unit_key) do update
      set can_sell = true,
          can_purchase = public.product_units.can_purchase or excluded.can_purchase;

    if exists (
      select 1 from public.product_units
       where company_id = p_company and product_key = v_key and unit_key = v_unit_key
         and abs(base_quantity - v_size) > 0.000001
    ) then
      raise exception 'unit % has two different conversions', v_unit
        using errcode = 'P0001', hint = 'conversion_conflict';
    end if;

    insert into public.product_selling_prices
      (company_id, product_key, product_name, retail_price, wholesale_price,
       wholesale_min_qty, currency, recorded_by, sale_unit)
    values
      (p_company, v_key, btrim(p_name), round(v_retail, 2),
       case when v_wholesale is null then null else round(v_wholesale, 2) end,
       v_min, v_currency, p_actor, v_unit);
    v_count := v_count + 1;
  end loop;

  insert into public.product_costs
    (company_id, product_key, product_name, unit, unit_cost, currency, recorded_by,
     note)
  values
    (p_company, v_key, btrim(p_name), btrim(p_purchase_unit), round(p_purchase_cost, 2),
     v_currency, p_actor, 'Portion-selling setup');

  insert into public.product_unit_audit_log
    (company_id, product_key, actor_id, action, metadata)
  values
    (p_company, v_key, p_actor, 'configured', jsonb_build_object(
      'base_unit', btrim(p_base_unit),
      'purchase_unit', btrim(p_purchase_unit),
      'purchase_size', round(p_purchase_size, 6),
      'selling_units', v_count
    ));

  return jsonb_build_object(
    'product', btrim(p_name), 'base_unit', btrim(p_base_unit),
    'purchase_unit', btrim(p_purchase_unit), 'purchase_size', round(p_purchase_size, 6),
    'selling_units', v_count
  );
end;
$$;

revoke all on function private.configure_product_units(uuid, uuid, text, text, text, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function private.configure_product_units(uuid, uuid, text, text, text, numeric, numeric, jsonb)
  to service_role;

create or replace function public.configure_product_units(
  p_name text,
  p_base_unit text,
  p_purchase_unit text,
  p_purchase_size numeric,
  p_purchase_cost numeric,
  p_sale_units jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or private.auth_company_id() is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may configure product units'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.configure_product_units(
    private.auth_company_id(), auth.uid(), p_name, p_base_unit, p_purchase_unit,
    p_purchase_size, p_purchase_cost, p_sale_units
  );
end;
$$;

revoke all on function public.configure_product_units(text, text, text, numeric, numeric, jsonb)
  from public, anon;
grant execute on function public.configure_product_units(text, text, text, numeric, numeric, jsonb)
  to authenticated;

create or replace function public.wa_configure_product_units(
  p_phone text,
  p_name text,
  p_base_unit text,
  p_purchase_unit text,
  p_purchase_size numeric,
  p_purchase_cost numeric,
  p_sale_units jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid;
  v_company uuid;
  v_role text;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from public.whatsapp_identities i
    join public.profiles p on p.id = i.profile_id
    join public.company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may configure product units'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.configure_product_units(
    v_company, v_profile, p_name, p_base_unit, p_purchase_unit,
    p_purchase_size, p_purchase_cost, p_sale_units
  );
end;
$$;

revoke all on function public.wa_configure_product_units(text, text, text, text, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.wa_configure_product_units(text, text, text, text, numeric, numeric, jsonb)
  to service_role;

-- One service-role read for pricing a whole WhatsApp till roll. It never accepts
-- a phone or returns data outside the already-resolved active company.
create or replace function public.wa_company_product_sale_units(p_company_id uuid)
returns table (
  product_key text,
  product_name text,
  unit_key text,
  unit_name text,
  base_quantity numeric,
  retail_price numeric,
  wholesale_price numeric,
  wholesale_min_qty numeric
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with latest as (
    select distinct on (s.product_key, s.sale_unit_key)
      s.product_key, s.sale_unit_key, s.retail_price, s.wholesale_price,
      s.wholesale_min_qty
    from public.product_selling_prices s
    where s.company_id = p_company_id and s.sale_unit_key is not null
    order by s.product_key, s.sale_unit_key, s.effective_from desc, s.created_at desc
  )
  select u.product_key, u.product_name, u.unit_key, u.unit_name, u.base_quantity,
         l.retail_price, l.wholesale_price, l.wholesale_min_qty
    from public.product_units u
    left join latest l on l.product_key = u.product_key and l.sale_unit_key = u.unit_key
   where u.company_id = p_company_id and u.can_sell
   order by u.product_key, u.base_quantity, u.unit_key;
$$;

revoke all on function public.wa_company_product_sale_units(uuid) from public, anon, authenticated;
grant execute on function public.wa_company_product_sale_units(uuid) to service_role;
