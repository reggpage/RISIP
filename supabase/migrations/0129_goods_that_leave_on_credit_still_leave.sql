-- MEASURED, proving a credit sale end to end:
--
--   draft                 debt_issued | 6000.00 | Juma | pay=NULL | pending
--   line                  Chakula cha mbwa | 3.000 kifuko | base null null
--   stock after confirm   0 (was 0)
--
-- Three bags of dog food walked out of the shop and the shelf never moved.
--
-- Two causes, both one line long, and they compound.
--
-- 1. private.snapshot_daily_record_stock_unit begins
--
--      if v_kind not in ('sale', 'stock_purchase') then
--        new.stock_base_quantity := null; …
--
--    so a line on any OTHER kind is stored with no base quantity. The stock
--    functions fall back to coalesce(stock_base_quantity, quantity), which is
--    the raw number the trader said. For a base unit that is right by accident.
--    For "3 kifuko" it silently subtracts three of something with no measure
--    attached, and phase 2's stock_loss and owner_use have been relying on that
--    accident since the day they shipped.
--
-- 2. wa_stock_on_hand counts sale, stock_purchase, stock_loss and owner_use.
--    debt_issued is not among them, so goods sold on credit never leave at all.
--
-- Both are fixed by naming what each kind DOES to the shelf, once:
--
--   out, sold      sale, debt_issued      the unit must be a selling unit
--   out, not sold  stock_loss, owner_use  any declared unit — a shop can lose
--                                         a sack it never intended to sell
--   in             stock_purchase         the unit must be a purchase unit
--
-- A credit sale is a sale of the same goods at the same price to the same
-- shelf. The only thing that has not happened yet is the money.
--
-- ROLLBACK: restore private.snapshot_daily_record_stock_unit and
-- wa_stock_on_hand / company_stock_on_hand from their previous definitions.

create or replace function private.snapshot_daily_record_stock_unit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_company uuid;
  v_kind text;
  v_key text := private.product_key(new.description);
  v_declared public.product_units;
  v_base text;
  v_matches integer;
  -- What this kind does to the shelf, and which units it may use.
  v_moves_stock boolean;
  v_needs_sale_unit boolean;
  v_needs_purchase_unit boolean;
begin
  select r.company_id, r.kind into v_company, v_kind
    from public.daily_records r where r.id = new.daily_record_id;

  v_moves_stock := v_kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use');
  v_needs_sale_unit := v_kind in ('sale', 'debt_issued');
  v_needs_purchase_unit := v_kind = 'stock_purchase';

  if not v_moves_stock or v_key is null then
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
         and ((v_needs_sale_unit and u.can_sell)
              or (v_needs_purchase_unit and u.can_purchase)
              or (not v_needs_sale_unit and not v_needs_purchase_unit));
      if v_matches > 1 then
        raise exception 'the product and unit match more than one declared item'
          using errcode = 'P0001', hint = 'ambiguous_unit';
      end if;
      if v_matches = 1 then
        select * into v_declared
          from public.product_units u
         where u.company_id = v_company
           and private.product_key(new.description) = u.product_key || ' ' || u.unit_key
           and ((v_needs_sale_unit and u.can_sell)
                or (v_needs_purchase_unit and u.can_purchase)
                or (not v_needs_sale_unit and not v_needs_purchase_unit));
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
  if v_needs_sale_unit and not v_declared.can_sell then
    raise exception 'the stated unit is not a selling unit for this product'
      using errcode = 'P0001', hint = 'unknown_sale_unit';
  end if;
  if v_needs_purchase_unit and not v_declared.can_purchase then
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
$fn$;

-- ── the shelf ──────────────────────────────────────────────────────────────

drop function if exists public.wa_stock_on_hand(uuid, text);

create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null::text)
returns table(
  product_name text, unit text, measured boolean, on_hand numeric, has_count boolean,
  counted_at timestamptz, bought_since numeric, sold_since numeric,
  lost_since numeric, taken_since numeric, incomplete_purchases boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
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
      -- Sold, whether or not the money arrived. Credit is a payment state, not
      -- a different shelf.
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind in ('sale', 'debt_issued')
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'stock_loss'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'owner_use'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = p_company_id
      and r.status = 'confirmed'
      and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use')
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
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0)
      - coalesce(m.sold_since, 0) - coalesce(m.lost_since, 0) - coalesce(m.taken_since, 0),
    lc.product_key is not null,
    lc.counted_at,
    coalesce(m.bought_since, 0),
    coalesce(m.sold_since, 0),
    coalesce(m.lost_since, 0),
    coalesce(m.taken_since, 0),
    (select any_bare from bare)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where p_product is null
     or private.product_key(coalesce(m.product_key, lc.product_key)) = private.product_key(p_product)
  order by coalesce(m.product_name, lc.product_name)
  limit 500;
$fn$;

grant execute on function public.wa_stock_on_hand(uuid, text) to service_role;

drop function if exists public.company_stock_on_hand();

create or replace function public.company_stock_on_hand()
returns table(
  product_key text, product_name text, unit text, measured boolean,
  counted_qty numeric, counted_at timestamptz, has_count boolean,
  bought_since numeric, sold_since numeric, lost_since numeric, taken_since numeric,
  on_hand numeric, incomplete_purchases boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
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
        where r.kind in ('sale', 'debt_issued')
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'stock_loss'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'owner_use'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use')
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
    coalesce(m.lost_since, 0),
    coalesce(m.taken_since, 0),
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0)
      - coalesce(m.sold_since, 0) - coalesce(m.lost_since, 0) - coalesce(m.taken_since, 0),
    (select any_bare from bare_purchases)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where (select id from company) is not null
  order by coalesce(m.product_name, lc.product_name);
$fn$;

revoke all on function public.company_stock_on_hand() from public, anon;
grant execute on function public.company_stock_on_hand() to authenticated;
