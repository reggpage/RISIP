-- Stock conversion snapshots for product portions declared in 0107.
--
-- A daily-record line keeps the quantity the trader sold ("3 robo") and also
-- stores the base quantity that moved ("0.75 lita"). Reports and confirmations
-- continue to show the former; stock arithmetic uses the latter. The trigger is
-- the authority, so an Edge Function or browser cannot supply its own multiplier.

alter table public.daily_record_lines
  add column if not exists stock_base_quantity numeric(18,6),
  add column if not exists stock_base_unit text,
  add column if not exists unit_base_quantity numeric(18,6);

-- Historical ledger lines are not rewritten. Every stock query below falls
-- back to the original quantity/unit for legacy rows, while new inserts carry
-- the immutable conversion snapshot populated by the trigger.

alter table public.daily_record_lines
  add constraint daily_record_lines_stock_base_quantity_positive
    check (stock_base_quantity is null or stock_base_quantity > 0),
  add constraint daily_record_lines_unit_base_quantity_positive
    check (unit_base_quantity is null or unit_base_quantity > 0);

create or replace function private.snapshot_daily_record_stock_unit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid;
  v_kind text;
  v_key text := private.product_key(new.description);
  v_declared public.product_units;
  v_base text;
  v_matches integer;
begin
  select r.company_id, r.kind into v_company, v_kind
    from public.daily_records r where r.id = new.daily_record_id;
  if v_kind not in ('sale', 'stock_purchase') or v_key is null then
    new.stock_base_quantity := null;
    new.stock_base_unit := null;
    new.unit_base_quantity := null;
    return new;
  end if;

  if not exists (
    select 1 from public.product_units u
     where u.company_id = v_company and u.product_key = v_key
  ) then
    -- The ordinary priced-sale parser may keep "mafuta robo" together in the
    -- description. Resolve only the exact declared suffix; never fuzzy-match a
    -- write. Exact catalogue products still won above.
    if nullif(btrim(coalesce(new.unit, '')), '') is null then
      select count(*) into v_matches
        from public.product_units u
       where u.company_id = v_company
         and private.product_key(new.description) = u.product_key || ' ' || u.unit_key
         and ((v_kind = 'sale' and u.can_sell) or (v_kind = 'stock_purchase' and u.can_purchase));
      if v_matches > 1 then
        raise exception 'the product and unit match more than one declared item'
          using errcode = 'P0001', hint = 'ambiguous_unit';
      end if;
      if v_matches = 1 then
        select * into v_declared
          from public.product_units u
         where u.company_id = v_company
           and private.product_key(new.description) = u.product_key || ' ' || u.unit_key
           and ((v_kind = 'sale' and u.can_sell) or (v_kind = 'stock_purchase' and u.can_purchase));
        v_key := v_declared.product_key;
        new.unit := v_declared.unit_name;
      end if;
    end if;
    if v_declared.id is null then
      new.stock_base_quantity := round(new.quantity, 6);
      new.stock_base_unit := nullif(btrim(coalesce(new.unit, '')), '');
      new.unit_base_quantity := 1;
      return new;
    end if;
  end if;

  if nullif(btrim(coalesce(new.unit, '')), '') is null then
    raise exception 'this product has several declared units; say which one moved'
      using errcode = 'P0001', hint = 'unit_required';
  end if;
  if v_declared.id is null then
    select * into v_declared
      from private.product_declared_unit(v_company, v_key, new.unit);
  end if;
  if v_declared.id is null then
    raise exception 'the stated unit is not declared for this product'
      using errcode = 'P0001', hint = 'unknown_unit';
  end if;
  if v_kind = 'sale' and not v_declared.can_sell then
    raise exception 'the stated unit is not a selling unit for this product'
      using errcode = 'P0001', hint = 'unknown_sale_unit';
  end if;
  if v_kind = 'stock_purchase' and not v_declared.can_purchase then
    raise exception 'the stated unit is not a purchase unit for this product'
      using errcode = 'P0001', hint = 'unknown_purchase_unit';
  end if;
  select unit_name into v_base from public.product_units
   where company_id = v_company and product_key = v_key and is_base;

  new.description := v_declared.product_name;
  new.unit := v_declared.unit_name;
  new.unit_base_quantity := v_declared.base_quantity;
  new.stock_base_quantity := round(new.quantity * v_declared.base_quantity, 6);
  new.stock_base_unit := v_base;
  return new;
end;
$$;

drop trigger if exists daily_record_lines_snapshot_stock_unit on public.daily_record_lines;
create trigger daily_record_lines_snapshot_stock_unit
  before insert on public.daily_record_lines
  for each row execute function private.snapshot_daily_record_stock_unit();

-- Keep what was physically typed while normalising the anchor to the base unit.
alter table public.stock_counts
  add column if not exists reported_quantity numeric(18,6),
  add column if not exists reported_unit text,
  add column if not exists unit_base_quantity numeric(18,6);

-- Keep old physical counts append-only too. Null reported_* values mean the
-- original quantity/unit are already the reported one; new counts snapshot both.

alter table public.stock_counts
  add constraint stock_counts_reported_quantity_nonnegative
    check (reported_quantity is null or reported_quantity >= 0),
  add constraint stock_counts_unit_base_quantity_positive
    check (unit_base_quantity is null or unit_base_quantity > 0);

create or replace function private.normalise_stock_count_unit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text := private.product_key(new.product_key);
  v_declared public.product_units;
  v_base text;
begin
  new.reported_quantity := coalesce(new.reported_quantity, new.quantity);
  new.reported_unit := coalesce(new.reported_unit, new.unit);

  if not exists (
    select 1 from public.product_units u
     where u.company_id = new.company_id and u.product_key = v_key
  ) then
    new.unit_base_quantity := coalesce(new.unit_base_quantity, 1);
    return new;
  end if;
  if nullif(btrim(coalesce(new.unit, '')), '') is null then
    raise exception 'this product has declared units; say which unit was counted'
      using errcode = 'P0001', hint = 'unit_required';
  end if;
  select * into v_declared
    from private.product_declared_unit(new.company_id, v_key, new.unit);
  if v_declared.id is null or not v_declared.can_count then
    raise exception 'the stated unit cannot be used to count this product'
      using errcode = 'P0001', hint = 'unknown_count_unit';
  end if;
  select unit_name into v_base from public.product_units
   where company_id = new.company_id and product_key = v_key and is_base;

  new.product_key := v_key;
  new.product_name := v_declared.product_name;
  new.reported_quantity := new.quantity;
  new.reported_unit := v_declared.unit_name;
  new.unit_base_quantity := v_declared.base_quantity;
  new.quantity := round(new.quantity * v_declared.base_quantity, 6);
  new.unit := v_base;
  return new;
end;
$$;

drop trigger if exists stock_counts_normalise_declared_unit on public.stock_counts;
create trigger stock_counts_normalise_declared_unit
  before insert on public.stock_counts
  for each row execute function private.normalise_stock_count_unit();

create or replace function public.company_stock_on_hand()
returns table (
  product_key text,
  product_name text,
  unit text,
  measured boolean,
  counted_qty numeric,
  counted_at timestamptz,
  has_count boolean,
  bought_since numeric,
  sold_since numeric,
  on_hand numeric,
  incomplete_purchases boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with company as (select private.auth_company_id() as id),
  last_count as (
    select distinct on (product_key)
      product_key, product_name, quantity, unit, counted_at
    from public.stock_counts
    where company_id = (select id from company)
    order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select
      private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '')
        order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'stock_purchase'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'sale'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind in ('sale', 'stock_purchase')
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  ),
  bare_purchases as (
    select count(*) > 0 as any_bare
    from public.daily_records r
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind = 'stock_purchase'
      and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select
    coalesce(m.product_key, lc.product_key),
    coalesce(m.product_name, lc.product_name),
    coalesce(lc.unit, m.unit),
    coalesce(m.measured, lc.unit is not null, false),
    lc.quantity,
    lc.counted_at,
    lc.product_key is not null,
    coalesce(m.bought_since, 0),
    coalesce(m.sold_since, 0),
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0) - coalesce(m.sold_since, 0),
    (select any_bare from bare_purchases)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where (select id from company) is not null
  order by coalesce(m.product_name, lc.product_name);
$$;

revoke execute on function public.company_stock_on_hand() from public, anon;
grant execute on function public.company_stock_on_hand() to authenticated;

create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null)
returns table (
  product_name text,
  unit text,
  measured boolean,
  on_hand numeric,
  has_count boolean,
  counted_at timestamptz,
  bought_since numeric,
  sold_since numeric,
  incomplete_purchases boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with last_count as (
    select distinct on (product_key)
      product_key, product_name, quantity, unit, counted_at
    from public.stock_counts
    where company_id = p_company_id
    order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select
      private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '')
        order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'stock_purchase'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'sale'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = p_company_id
      and r.status = 'confirmed'
      and r.kind in ('sale', 'stock_purchase')
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  ),
  bare as (
    select count(*) > 0 as any_bare
    from public.daily_records r
    where r.company_id = p_company_id
      and r.status = 'confirmed'
      and r.kind = 'stock_purchase'
      and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select
    coalesce(m.product_name, lc.product_name),
    coalesce(lc.unit, m.unit),
    coalesce(m.measured, lc.unit is not null, false),
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0) - coalesce(m.sold_since, 0),
    lc.product_key is not null,
    lc.counted_at,
    coalesce(m.bought_since, 0),
    coalesce(m.sold_since, 0),
    (select any_bare from bare)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where p_product is null
     or private.product_key(coalesce(m.product_key, lc.product_key)) = private.product_key(p_product)
  order by coalesce(m.product_name, lc.product_name)
  limit 30;
$$;

revoke execute on function public.wa_stock_on_hand(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_stock_on_hand(uuid, text) to service_role;

-- The displayed "previous" count must be in the unit the trader just used.
-- Stock itself remains stored in the base unit.
create or replace function public.wa_record_stock_count(
  p_phone text,
  p_name text,
  p_quantity numeric,
  p_unit text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid;
  v_company uuid;
  v_role text;
  v_key text := private.product_key(p_name);
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_declared public.product_units;
  v_previous_base numeric;
  v_previous_reported numeric;
  v_id uuid;
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
    raise exception 'only an owner or accountant may record a stock count'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;

  if exists (select 1 from public.product_units where company_id = v_company and product_key = v_key) then
    if v_unit is null then
      raise exception 'this product has declared units; say which unit was counted'
        using errcode = 'P0001', hint = 'unit_required';
    end if;
    select * into v_declared from private.product_declared_unit(v_company, v_key, v_unit);
    if v_declared.id is null or not v_declared.can_count then
      raise exception 'the stated unit cannot be used to count this product'
        using errcode = 'P0001', hint = 'unknown_count_unit';
    end if;
  end if;

  select on_hand into v_previous_base
    from public.wa_stock_on_hand(v_company, p_name) limit 1;
  v_previous_reported := case
    when v_previous_base is null then null
    when v_declared.id is null then v_previous_base
    else round(v_previous_base / v_declared.base_quantity, 6)
  end;

  insert into public.stock_counts
    (company_id, product_key, product_name, quantity, unit, counted_by)
  values
    (v_company, v_key, btrim(p_name), round(p_quantity, 6), v_unit, v_profile)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'product', btrim(p_name),
    'quantity', round(p_quantity, 6),
    'unit', v_unit,
    'previous', v_previous_reported
  );
end;
$$;

revoke all on function public.wa_record_stock_count(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.wa_record_stock_count(text, text, numeric, text)
  to service_role;
