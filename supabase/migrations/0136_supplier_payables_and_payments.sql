-- RISIP BUCHA, PHASE 8 — supplier credit and supplier payments.
--
-- Supplier liabilities are journal facts, not a second accounting system:
--   supplier_payable = goods/input received on supplier credit
--   supplier_payment = money later paid to that supplier
--
-- Balances are derived from confirmed, non-voided daily_records. A pending
-- record has no financial effect, and voiding a confirmed record removes its
-- effect while preserving the daily_record_audit_log history.

alter table public.daily_records drop constraint if exists daily_records_supplier_fields_check;
alter table public.daily_records add constraint daily_records_supplier_fields_check check (
  kind not in ('supplier_payable', 'supplier_payment')
  or party_name is not null
);

alter table public.daily_records drop constraint if exists daily_records_supplier_payment_method_check;
alter table public.daily_records add constraint daily_records_supplier_payment_method_check check (
  kind <> 'supplier_payable' or payment_method is null
);

alter table public.daily_records drop constraint if exists daily_records_supplier_payment_requires_method_check;
alter table public.daily_records add constraint daily_records_supplier_payment_requires_method_check check (
  kind <> 'supplier_payment' or payment_method is not null
);

create index if not exists daily_records_supplier_balance_idx
  on public.daily_records (company_id, kind, party_name, status, occurred_at desc)
  where kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement');

-- A supplier-credit stock purchase is physically the same inbound movement as
-- a cash stock purchase. The payment state must not delay the shelf movement.
create or replace function private.snapshot_daily_record_stock_unit()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_company uuid;
  v_kind text;
  v_key text := private.product_key(new.description);
  v_declared public.product_units;
  v_base text;
  v_matches integer;
  v_moves_stock boolean;
  v_needs_sale_unit boolean;
  v_needs_purchase_unit boolean;
begin
  select r.company_id, r.kind into v_company, v_kind
    from public.daily_records r where r.id = new.daily_record_id;

  v_moves_stock := v_kind in ('sale', 'debt_issued', 'stock_purchase', 'supplier_payable', 'stock_loss', 'owner_use');
  v_needs_sale_unit := v_kind in ('sale', 'debt_issued');
  v_needs_purchase_unit := v_kind in ('stock_purchase', 'supplier_payable');

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

drop trigger if exists daily_record_lines_snapshot_stock_unit on public.daily_record_lines;
create trigger daily_record_lines_snapshot_stock_unit
  before insert on public.daily_record_lines
  for each row execute function private.snapshot_daily_record_stock_unit();

-- Make the company catalogue aware of products that have only arrived on
-- supplier credit. This is a vocabulary read, not a Phase 9 UI/report.
create or replace function public.company_product_names(p_company_id uuid)
returns table (product_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with sold as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id and r.kind = 'sale' and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  bought as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id and r.kind in ('stock_purchase', 'supplier_payable')
       and r.status = 'confirmed' and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  configured as (
    select distinct on (u.product_key) u.product_name as name
      from product_units u where u.company_id = p_company_id
     order by u.product_key, u.is_base desc, u.created_at desc
  ),
  priced as (
    select distinct on (private.product_key(c.product_key)) c.product_name as name
      from product_costs c where c.company_id = p_company_id
     order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  everything as (
    select name from sold union select name from bought union
    select name from configured union select name from priced
  )
  select distinct on (private.product_key(name)) name
    from everything where private.product_key(name) is not null
   order by private.product_key(name), name limit 500;
$$;

revoke execute on function public.company_product_names(uuid) from public, anon, authenticated;
grant execute on function public.company_product_names(uuid) to authenticated, service_role;

-- The Phase 7 return contracts are preserved; only the inbound kind changes.
drop function if exists public.wa_stock_on_hand(uuid, text);
create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null::text)
returns table(
  product_name text, unit text, measured boolean, on_hand numeric, has_count boolean,
  counted_at timestamptz, bought_since numeric, sold_since numeric,
  lost_since numeric, taken_since numeric, produced_since numeric, incomplete_purchases boolean
)
language sql stable security definer set search_path to 'pg_catalog', 'public'
as $fn$
  with last_count as (
    select distinct on (product_key) product_key, product_name, quantity, unit, counted_at
      from public.stock_counts where company_id = p_company_id
     order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('stock_purchase', 'supplier_payable')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('sale', 'debt_issued')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_loss'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'owner_use'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since,
      0::numeric as produced_since
      from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
      left join last_count lc on lc.product_key = private.product_key(l.description)
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'supplier_payable', 'stock_loss', 'owner_use')
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
    union all
    select o.product_key, max(o.product_name), max(o.base_unit), true,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      coalesce(sum(o.base_quantity) filter (where lc.counted_at is null or r.occurred_at > lc.counted_at), 0)
      from public.whole_animal_breakdown_outputs o
      join public.daily_records r on r.id = o.breakdown_daily_record_id
      left join last_count lc on lc.product_key = o.product_key
     where r.company_id = p_company_id and r.status = 'confirmed'
     group by o.product_key
  ),
  grouped as (
    select product_key, max(product_name) as product_name, max(unit) as unit,
      bool_or(measured) as measured, sum(bought_since) as bought_since,
      sum(sold_since) as sold_since, sum(lost_since) as lost_since,
      sum(taken_since) as taken_since, sum(produced_since) as produced_since
      from movement group by product_key
  ),
  bare as (
    select count(*) > 0 as any_bare from public.daily_records r
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.kind in ('stock_purchase', 'supplier_payable')
       and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select coalesce(g.product_name, lc.product_name), coalesce(lc.unit, g.unit),
    coalesce(g.measured, lc.unit is not null, false),
    coalesce(lc.quantity, 0) + coalesce(g.bought_since, 0) + coalesce(g.produced_since, 0)
      - coalesce(g.sold_since, 0) - coalesce(g.lost_since, 0) - coalesce(g.taken_since, 0),
    lc.product_key is not null, lc.counted_at, coalesce(g.bought_since, 0),
    coalesce(g.sold_since, 0), coalesce(g.lost_since, 0), coalesce(g.taken_since, 0),
    coalesce(g.produced_since, 0), (select any_bare from bare)
    from grouped g full join last_count lc on lc.product_key = g.product_key
   where p_product is null or private.product_key(coalesce(g.product_key, lc.product_key)) = private.product_key(p_product)
   order by coalesce(g.product_name, lc.product_name) limit 500;
$fn$;
grant execute on function public.wa_stock_on_hand(uuid, text) to service_role;

drop function if exists public.company_stock_on_hand();
create or replace function public.company_stock_on_hand()
returns table(
  product_key text, product_name text, unit text, measured boolean,
  counted_qty numeric, counted_at timestamptz, has_count boolean,
  bought_since numeric, sold_since numeric, lost_since numeric, taken_since numeric,
  produced_since numeric, on_hand numeric, incomplete_purchases boolean
)
language sql stable security definer set search_path to 'pg_catalog', 'public'
as $fn$
  with company as (select private.auth_company_id() as id),
  last_count as (
    select distinct on (product_key) product_key, product_name, quantity, unit, counted_at
      from public.stock_counts where company_id = (select id from company)
     order by product_key, counted_at desc, created_at desc
  ),
  movement as (
    select private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') order by r.occurred_at desc)
        filter (where nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null))[1] as unit,
      bool_or(coalesce(l.stock_base_quantity, l.quantity) <> round(coalesce(l.stock_base_quantity, l.quantity))
        or nullif(btrim(coalesce(l.stock_base_unit, l.unit, '')), '') is not null) as measured,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('stock_purchase', 'supplier_payable')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind in ('sale', 'debt_issued')
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'stock_loss'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (where r.kind = 'owner_use'
        and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since,
      0::numeric as produced_since
      from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
      left join last_count lc on lc.product_key = private.product_key(l.description)
     where r.company_id = (select id from company) and r.status = 'confirmed'
       and r.kind in ('sale', 'debt_issued', 'stock_purchase', 'supplier_payable', 'stock_loss', 'owner_use')
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
    union all
    select o.product_key, max(o.product_name), max(o.base_unit), true,
      0::numeric, 0::numeric, 0::numeric, 0::numeric,
      coalesce(sum(o.base_quantity) filter (where lc.counted_at is null or r.occurred_at > lc.counted_at), 0)
      from public.whole_animal_breakdown_outputs o
      join public.daily_records r on r.id = o.breakdown_daily_record_id
      left join last_count lc on lc.product_key = o.product_key
     where r.company_id = (select id from company) and r.status = 'confirmed'
     group by o.product_key
  ),
  grouped as (
    select product_key, max(product_name) as product_name, max(unit) as unit,
      bool_or(measured) as measured, sum(bought_since) as bought_since,
      sum(sold_since) as sold_since, sum(lost_since) as lost_since,
      sum(taken_since) as taken_since, sum(produced_since) as produced_since
      from movement group by product_key
  ),
  bare as (
    select count(*) > 0 as any_bare from public.daily_records r
     where r.company_id = (select id from company) and r.status = 'confirmed'
       and r.kind in ('stock_purchase', 'supplier_payable')
       and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select coalesce(g.product_key, lc.product_key), coalesce(g.product_name, lc.product_name),
    coalesce(lc.unit, g.unit), coalesce(g.measured, lc.unit is not null, false),
    lc.quantity, lc.counted_at, lc.product_key is not null, coalesce(g.bought_since, 0),
    coalesce(g.sold_since, 0), coalesce(g.lost_since, 0), coalesce(g.taken_since, 0),
    coalesce(g.produced_since, 0), coalesce(lc.quantity, 0) + coalesce(g.bought_since, 0)
      + coalesce(g.produced_since, 0) - coalesce(g.sold_since, 0)
      - coalesce(g.lost_since, 0) - coalesce(g.taken_since, 0),
    (select any_bare from bare)
    from grouped g full join last_count lc on lc.product_key = g.product_key
   where (select id from company) is not null
   order by coalesce(g.product_name, lc.product_name);
$fn$;
revoke all on function public.company_stock_on_hand() from public, anon;
grant execute on function public.company_stock_on_hand() to authenticated;

-- ── supplier liability read ────────────────────────────────────────────────
create or replace function public.wa_supplier_balances(
  p_profile_id uuid,
  p_company_id uuid,
  p_supplier_name text default null
)
returns table(supplier_name text, payable numeric, payments numeric, outstanding numeric)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
  v_key text := nullif(private.product_key(p_supplier_name), '');
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m on m.profile_id = p.id
      and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  return query
  with facts as (
    select private.product_key(r.party_name) as supplier_key,
      max(btrim(r.party_name)) as supplier_name,
      sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else 0 end) as payable,
      sum(case when r.kind = 'supplier_payment' then r.amount else 0 end) as payments
      from public.daily_records r
     where r.company_id = p_company_id and r.status = 'confirmed'
       and r.party_name is not null
       and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
       and (r.kind <> 'whole_animal_procurement' or r.payment_method is null)
     group by private.product_key(r.party_name)
  )
  select f.supplier_name, f.payable, f.payments, f.payable - f.payments
    from facts f
   where (v_key is null or f.supplier_key = v_key)
     and f.payable - f.payments <> 0
   order by f.supplier_name;
end;
$fn$;

revoke all on function public.wa_supplier_balances(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_supplier_balances(uuid, uuid, text) to service_role;

-- ── supplier-credit purchase draft ─────────────────────────────────────────
create or replace function public.wa_create_supplier_credit_purchase_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_supplier_name text,
  p_lines jsonb,
  p_amount numeric default null,
  p_occurred_at timestamptz default now(),
  p_source_message_id text default null
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
  v_supplier text := nullif(btrim(regexp_replace(coalesce(p_supplier_name, ''), '\s+', ' ', 'g')), '');
  v_message text := nullif(btrim(coalesce(p_source_message_id, '')), '');
  v_amount numeric(14,2) := case when p_amount is null then null else round(p_amount, 2) end;
  v_currency text;
  v_id uuid;
  v_existing public.daily_records%rowtype;
  v_line jsonb;
  v_desc text;
  v_unit text;
  v_key text;
  v_qty numeric;
  v_unit_amount numeric;
  v_sum numeric(14,2) := 0;
  v_normalized_lines jsonb := '[]'::jsonb;
  v_cost public.product_costs%rowtype;
  v_declared public.product_units%rowtype;
  v_matches integer;
begin
  select p.active_company_id into v_active_company
    from public.profiles p join public.company_members m on m.profile_id = p.id
      and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company' using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_supplier is null or length(v_supplier) > 200 then
    raise exception 'supplier name is required' using errcode = 'P0001', hint = 'supplier_required';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'at least one purchased product is required' using errcode = 'P0001', hint = 'purchase_required';
  end if;
  if v_amount is not null and (v_amount <= 0 or v_amount > 100000000) then
    raise exception 'purchase amount must be positive' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if v_message is not null and length(v_message) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  select c.currency into v_currency from public.companies c where c.id = p_company_id;
  if v_currency is null then raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found'; end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_desc := nullif(btrim(v_line->>'description'), '');
    v_unit := nullif(btrim(v_line->>'unit'), '');
    v_qty := (v_line->>'quantity')::numeric;
    if v_desc is null or v_qty is null or v_qty <= 0 then
      raise exception 'each purchase line needs a product and positive quantity' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_key := private.product_key(v_desc);
    select count(*) into v_matches from public.product_units u
     where u.company_id = p_company_id and u.product_key = v_key and u.can_purchase
       and (v_unit is null or u.unit_key = private.product_key(v_unit) or u.unit_name = v_unit);
    if v_matches > 1 and v_unit is null then
      raise exception 'this product has more than one purchase unit; say which unit' using errcode = 'P0001', hint = 'unit_required';
    end if;
    select * into v_declared from public.product_units u
     where u.company_id = p_company_id and u.product_key = v_key and u.can_purchase
       and (v_unit is null or u.unit_key = private.product_key(v_unit) or u.unit_name = v_unit)
     order by u.is_base desc, u.created_at desc limit 1;
    if v_declared.id is not null then
      v_desc := v_declared.product_name;
      v_unit := v_declared.unit_name;
      v_key := v_declared.product_key;
    end if;
    select * into v_cost from public.product_costs c
     where c.company_id = p_company_id and private.product_key(c.product_key) = v_key
       and (c.unit is null or v_unit is null or private.product_key(c.unit) = private.product_key(v_unit))
       and (p_occurred_at is null or c.effective_from <= p_occurred_at)
     order by (case when v_unit is not null and c.unit is not null then 0 else 1 end), c.effective_from desc, c.created_at desc limit 1;
    if v_cost.id is null and v_amount is null then
      raise exception 'no configured purchase cost for %' , v_desc using errcode = 'P0001', hint = 'purchase_cost_required';
    end if;
    v_unit_amount := coalesce(
      (v_line->>'unit_amount')::numeric,
      v_cost.unit_cost,
      case when v_amount is not null and jsonb_array_length(p_lines) = 1
        then round(v_amount / v_qty, 2) end
    );
    if v_unit_amount is null or v_unit_amount < 0 then
      raise exception 'purchase line cost is invalid' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line := jsonb_build_object('description', v_desc, 'quantity', v_qty, 'unit', v_unit, 'unit_amount', v_unit_amount);
    v_normalized_lines := v_normalized_lines || jsonb_build_array(v_line);
    v_sum := v_sum + round(v_qty * v_unit_amount, 2);
  end loop;
  if v_amount is null then v_amount := v_sum; end if;
  if v_amount <= 0 then raise exception 'purchase amount must be positive' using errcode = 'P0001', hint = 'invalid_amount'; end if;

  -- Rebuild line totals from trusted/server-resolved prices; no model-supplied
  -- total is accepted without matching the line arithmetic.
  if abs(v_sum - v_amount) > 0.01 then
    if jsonb_array_length(p_lines) = 1 and v_amount > 0 then
      v_normalized_lines := jsonb_set(v_normalized_lines, '{0,unit_amount}', to_jsonb(round(v_amount / ((v_normalized_lines->0->>'quantity')::numeric), 2)), false);
    else
      raise exception 'purchase total does not match configured line costs' using errcode = 'P0001', hint = 'purchase_total_mismatch';
    end if;
  end if;
  p_lines := v_normalized_lines;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    'supplier_payable', v_amount, v_supplier, 'Ununuzi wa bidhaa kwa deni', coalesce(p_occurred_at, now()), null,
    'whatsapp', v_message, p_lines, null, null
  );
end;
$fn$;

revoke all on function public.wa_create_supplier_credit_purchase_draft(uuid, uuid, text, jsonb, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.wa_create_supplier_credit_purchase_draft(uuid, uuid, text, jsonb, numeric, timestamptz, text) to service_role;

-- ── supplier payment draft ─────────────────────────────────────────────────
create or replace function public.wa_create_supplier_payment_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_supplier_name text,
  p_amount numeric,
  p_payment_method text,
  p_occurred_at timestamptz default now(),
  p_source_message_id text default null
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
  v_supplier text := nullif(btrim(regexp_replace(coalesce(p_supplier_name, ''), '\s+', ' ', 'g')), '');
  v_key text := private.product_key(v_supplier);
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_message text := nullif(btrim(coalesce(p_source_message_id, '')), '');
  v_outstanding numeric;
begin
  select p.active_company_id into v_active_company from public.profiles p
    join public.company_members m on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then raise exception 'WhatsApp identity is not active in this company' using errcode = 'P0001', hint = 'wrong_company'; end if;
  if v_supplier is null then raise exception 'supplier name is required' using errcode = 'P0001', hint = 'supplier_required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'payment amount must be positive' using errcode = 'P0001', hint = 'invalid_amount'; end if;
  if v_method = 'deni' then raise exception 'deni is not a payment method' using errcode = 'P0001', hint = 'deni_is_not_a_payment_method'; end if;
  if v_method not in ('cash', 'mobile_money', 'bank', 'other') then raise exception 'payment method is required' using errcode = 'P0001', hint = 'invalid_payment_method'; end if;

  select coalesce(sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else -r.amount end), 0)
    into v_outstanding from public.daily_records r
   where r.company_id = p_company_id and r.status = 'confirmed' and r.party_name is not null
     and private.product_key(r.party_name) = v_key
     and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
     and (r.kind <> 'whole_animal_procurement' or r.payment_method is null);
  if p_amount > v_outstanding then
    raise exception 'supplier payment exceeds outstanding balance' using errcode = 'P0001', hint = 'supplier_overpayment';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    'supplier_payment', round(p_amount, 2), v_supplier, 'Malipo kwa supplier', coalesce(p_occurred_at, now()), null,
    'whatsapp', v_message, '[]'::jsonb, v_method, null
  );
end;
$fn$;

revoke all on function public.wa_create_supplier_payment_draft(uuid, uuid, text, numeric, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.wa_create_supplier_payment_draft(uuid, uuid, text, numeric, text, timestamptz, text) to service_role;

-- Confirmation is the only point at which a payment changes AP. The advisory
-- lock makes two simultaneous payments for one supplier observe one balance.
create or replace function public.confirm_daily_record(p_daily_record_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare
  v_actor uuid := auth.uid(); v_company uuid := private.auth_company_id(); v_role public.user_role := private.auth_role();
  v_record public.daily_records; v_balance numeric;
begin
  if v_actor is null or v_company is null or v_role is null then raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated'; end if;
  select * into v_record from public.daily_records dr where dr.id = p_daily_record_id for update;
  if not found or v_record.company_id <> v_company then raise exception 'daily record not found' using errcode = 'P0001', hint = 'not_found'; end if;
  if v_record.status = 'confirmed' then return v_record.id; end if;
  if v_record.status = 'voided' then raise exception 'a voided daily record cannot be confirmed' using errcode = 'P0001', hint = 'bad_transition'; end if;
  if v_role not in ('owner', 'accountant') then raise exception 'only an owner or accountant can confirm daily records' using errcode = 'P0001', hint = 'not_authorized'; end if;

  if v_record.kind = 'supplier_payment' then
    perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || private.product_key(v_record.party_name), 0));
    select coalesce(sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else -r.amount end), 0)
      into v_balance from public.daily_records r
     where r.company_id = v_company and r.status = 'confirmed' and r.party_name is not null
       and private.product_key(r.party_name) = private.product_key(v_record.party_name)
       and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
       and (r.kind <> 'whole_animal_procurement' or r.payment_method is null);
    if v_record.amount > v_balance then raise exception 'supplier payment exceeds outstanding balance' using errcode = 'P0001', hint = 'supplier_overpayment'; end if;
  end if;

  update public.daily_records set status = 'confirmed', confirmed_by = v_actor, confirmed_at = now(), updated_at = now() where id = v_record.id;
  insert into public.daily_record_audit_log (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values (v_record.id, v_company, v_actor, 'confirmed', v_record.status, 'confirmed',
    jsonb_build_object('amount', v_record.amount, 'currency', v_record.currency, 'kind', v_record.kind,
      'liability_effect', case when v_record.kind in ('supplier_payable', 'whole_animal_procurement') and v_record.payment_method is null then v_record.amount when v_record.kind = 'supplier_payment' then -v_record.amount else 0 end));
  return v_record.id;
end;
$fn$;

revoke all on function public.confirm_daily_record(uuid) from public, anon;
grant execute on function public.confirm_daily_record(uuid) to authenticated, service_role;
