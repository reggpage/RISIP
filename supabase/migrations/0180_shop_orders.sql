-- B2B inter-shop ordering ("Agizo la bidhaa").
--
-- A shop that is out of stock asks the WhatsApp assistant for a product; the
-- assistant finds OTHER Risip shops that have opted in as suppliers and quote
-- the wholesale price + how many they have on hand. The buyer places an order
-- on WhatsApp, gets the supplier's mobile-money number ("lipa namba") to pay
-- peer-to-peer, and the order is verified only after the buyer confirms the
-- goods were delivered.
--
-- Tenant isolation:
--   * Reads/writes between two DIFFERENT companies only ever run inside
--     `security definer` functions. `wa_*` take an explicit company id and are
--     granted to service_role only (the webhook); `my_*` derive the company
--     from auth.uid() via the private.* helpers and are granted to
--     authenticated only (the web app).
--   * RLS on the tables keys off `private.auth_company_id()` so a web page
--     belonging to either party of an order can read the shared rows, and
--     nobody else can. No direct INSERT/UPDATE policies: writes only flow
--     through the RPCs below.
--
-- Supplier discovery is opt-in only (company_suppliers.active). A shop that has
-- not registered never appears in a foreign search, so B2B discovery cannot
-- leak an unrelated tenant's catalogue.
--
-- ROLLBACK
--   drop function private.shop_owner_of(uuid);
--   drop function public.set_company_supplier(boolean);
--   drop function public.my_supplier_status();
--   drop function public.my_shop_order_action(uuid, text, text);
--   drop function public.my_shop_orders();
--   drop function public.wa_shop_order_book(uuid);
--   drop function public.wa_shop_order_action(uuid, uuid, text, text);
--   drop function public.wa_place_shop_order(uuid, uuid, jsonb, text, boolean);
--   drop function public.wa_search_suppliers(text, uuid, integer);
--   drop function public.wa_supplier_product_pricing(uuid, text[]);
--   drop table public.shop_order_events;
--   drop table public.shop_order_lines;
--   drop table public.shop_orders;
--   drop table public.company_suppliers;
--   drop sequence public.shop_order_no_seq;
--   restore whatsapp_conversations awaiting constraint to the 0139 values.

create sequence if not exists public.shop_order_no_seq;

create table if not exists public.company_suppliers (
  company_id uuid primary key references public.companies(id) on delete cascade,
  active boolean not null default true,
  opted_in_at timestamptz not null default clock_timestamp(),
  opted_in_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  buyer_company_id uuid not null references public.companies(id) on delete restrict,
  supplier_company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'placed' check (status in (
    'placed', 'accepted', 'rejected', 'delivered', 'verified', 'cancelled'
  )),
  currency text not null default 'TZS',
  total_wholesale numeric(14,2) not null default 0 check (total_wholesale >= 0),
  note text,
  supplier_phone_e164 text,
  placed_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  delivered_at timestamptz,
  verified_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint shop_orders_swap check (buyer_company_id <> supplier_company_id)
);

create table if not exists public.shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_key text not null,
  product_name text not null,
  unit text,
  quantity numeric(14,3) not null check (quantity > 0),
  wholesale_unit_price numeric(14,2) not null check (wholesale_unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.shop_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  event text not null,
  actor_company_id uuid not null references public.companies(id) on delete restrict,
  note text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists shop_orders_buyer_idx
  on public.shop_orders (buyer_company_id, placed_at desc);
create index if not exists shop_orders_supplier_idx
  on public.shop_orders (supplier_company_id, placed_at desc);
create index if not exists shop_order_lines_order_idx
  on public.shop_order_lines (order_id);
create index if not exists shop_order_events_order_idx
  on public.shop_order_events (order_id);

alter table public.company_suppliers enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_lines enable row level security;
alter table public.shop_order_events enable row level security;

revoke all on table public.company_suppliers from public, anon, authenticated;
revoke all on table public.shop_orders from public, anon, authenticated;
revoke all on table public.shop_order_lines from public, anon, authenticated;
revoke all on table public.shop_order_events from public, anon, authenticated;

-- A row is visible to a party of the order and nobody else. Lines and events
-- follow their order's visibility.
create policy shop_orders_select_party on public.shop_orders
  for select to authenticated
  using (buyer_company_id = private.auth_company_id()
      or supplier_company_id = private.auth_company_id());
grant select on public.shop_orders to authenticated;

create policy shop_order_lines_select_order on public.shop_order_lines
  for select to authenticated
  using (exists (
    select 1 from public.shop_orders o
    where o.id = shop_order_lines.order_id
      and (o.buyer_company_id = private.auth_company_id()
        or o.supplier_company_id = private.auth_company_id())
  ));
grant select on public.shop_order_lines to authenticated;

create policy shop_order_events_select_order on public.shop_order_events
  for select to authenticated
  using (exists (
    select 1 from public.shop_orders o
    where o.id = shop_order_events.order_id
      and (o.buyer_company_id = private.auth_company_id()
        or o.supplier_company_id = private.auth_company_id())
  ));
grant select on public.shop_order_events to authenticated;

create policy company_suppliers_select_own on public.company_suppliers
  for select to authenticated
  using (company_id = private.auth_company_id());
grant select on public.company_suppliers to authenticated;

-- The WhatsApp assistant parks a shop-order confirmation under its own awaiting
-- slot, so a shop-order decision can never collide with a daily-record draft
-- parked in the payment_source slot. The options.kind discriminates placement
-- vs action; the awaiting value is shared.
alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check
  check (awaiting in (
    'language', 'project', 'payment_source', 'business', 'product_cost',
    'product_analytics', 'logout_confirm', 'account_delete_confirm', 'shop_order'
  ));

-- ── Shared: who answers for a company (used for notifications) ───────────────
create or replace function private.shop_owner_of(p_company_id uuid)
returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p.id
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p_company_id
     and m.role::text = 'owner'
     and m.deactivated_at is null
   order by m.joined_at, p.created_at
   limit 1;
$$;

-- ── Resolve lines against the SUPPLIER's own catalogue ───────────────────────
-- The price comes from the supplier's product_selling_prices, never from the
-- buyer's message or the AI. Units come from the supplier's own stated unit.
create or replace function public.wa_supplier_product_pricing(
  p_supplier_company_id uuid,
  p_product_keys text[]
)
returns table (
  product_key text,
  product_name text,
  unit text,
  retail_price numeric,
  wholesale_price numeric,
  wholesale_min_qty numeric,
  on_hand numeric,
  has_count boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with wanted as (
    select distinct private.product_key(k) as product_key
      from unnest(coalesce(p_product_keys, '{}'::text[])) as k
     where k is not null and btrim(k) <> ''
  ),
  latest_price as (
    select distinct on (p.key)
      p.key as product_key,
      (array_agg(s.product_name order by s.effective_from desc, s.created_at desc))[1] as product_name,
      (array_agg(s.retail_price order by s.effective_from desc, s.created_at desc))[1] as retail_price,
      (array_agg(s.wholesale_price order by s.effective_from desc, s.created_at desc))[1] as wholesale_price,
      (array_agg(s.wholesale_min_qty order by s.effective_from desc, s.created_at desc))[1] as wholesale_min_qty
    from wanted p
    join product_selling_prices s
      on s.company_id = p_supplier_company_id
     and private.product_key(s.product_key) = p.product_key
    order by p.key, s.effective_from desc, s.created_at desc
  )
  select
    w.product_key,
    p.product_name,
    private.product_unit(p_supplier_company_id, w.product_key) as unit,
    p.retail_price,
    p.wholesale_price,
    p.wholesale_min_qty,
    coalesce(h.on_hand, 0) as on_hand,
    coalesce(h.has_count, false) as has_count
  from wanted w
  left join latest_price p on p.product_key = w.product_key
  left join lateral wa_stock_on_hand(p_supplier_company_id, w.product_key) h on true;
$$;

-- ── Search suppliers for a product, cross-tenant ─────────────────────────────
-- Only opted-in companies appear. Matching is done on the canonical product key
-- AND the supplier's own product name, so "unga" finds "Unga Dola 1kg" but the
-- wholesale price is still resolved from the supplier's own catalogue. The AI
-- compares the returned rows; the app never ranks one supplier over another.
create or replace function public.wa_search_suppliers(
  p_term text,
  p_exclude_company_id uuid default null,
  p_limit integer default 10
)
returns table (
  supplier_company_id uuid,
  company_name text,
  hq_location text,
  product_key text,
  product_name text,
  unit text,
  wholesale_price numeric,
  wholesale_min_qty numeric,
  on_hand numeric,
  has_count boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with tokens as (
    select distinct btrim(t) as token
      from regexp_split_to_table(btrim(coalesce(p_term, '')), '[\s|]+') as t
     where length(btrim(t)) >= 2
  ),
  candidates as (
    select distinct on (private.product_key(s.product_key), s.company_id)
      s.company_id,
      private.product_key(s.product_key) as product_key,
      (array_agg(s.product_name order by s.effective_from desc, s.created_at desc))[1] as product_name,
      (array_agg(s.wholesale_price order by s.effective_from desc, s.created_at desc))[1] as wholesale_price,
      (array_agg(s.wholesale_min_qty order by s.effective_from desc, s.created_at desc))[1] as wholesale_min_qty
    from product_selling_prices s
    where s.wholesale_price is not null
      and exists (
        select 1 from tokens tk
        where position(lower(tk.token) in lower(private.product_key(s.product_key))) > 0
           or position(lower(tk.token) in lower(s.product_name)) > 0
      )
    order by private.product_key(s.product_key), s.company_id, s.effective_from desc, s.created_at desc
  )
  select
    c.id as supplier_company_id,
    c.name as company_name,
    c.hq_location,
    k.product_key,
    k.product_name,
    private.product_unit(c.id, k.product_key) as unit,
    k.wholesale_price,
    k.wholesale_min_qty,
    coalesce(h.on_hand, 0) as on_hand,
    coalesce(h.has_count, false) as has_count
  from candidates k
  join public.companies c on c.id = k.company_id
  join public.company_suppliers cs on cs.company_id = c.id and cs.active
  left join lateral wa_stock_on_hand(c.id, k.product_key) h on true
  where c.id is distinct from p_exclude_company_id
  order by c.name, k.product_key
  limit greatest(1, least(p_limit, 25));
$$;

revoke all on function public.wa_supplier_product_pricing(uuid, text[]) from public, anon, authenticated;
grant execute on function public.wa_supplier_product_pricing(uuid, text[]) to service_role;
revoke all on function public.wa_search_suppliers(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.wa_search_suppliers(text, uuid, integer) to service_role;

-- ── Place an order (with prepare/dry-run) ───────────────────────────────────
-- p_lines: jsonb array [{"product_key": "...", "quantity": 3}] — product keys
-- (as returned by wa_search_suppliers / the assistant), not free text, so the
-- wholesale price is always the supplier's own. When p_dry_run is true nothing
-- is inserted; the caller sees the exact body a real placement would create.
-- Prices are re-read from the DB again at real placement, so a stale proposal
-- can never be the authority.
create or replace function public.wa_place_shop_order(
  p_buyer_company_id uuid,
  p_supplier_company_id uuid,
  p_lines jsonb,
  p_note text default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_supplier_active boolean;
  v_total numeric(14,2) := 0;
  v_order_no text;
  v_order_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_item jsonb;
  v_row record;
  v_qty numeric(14,3);
  v_price numeric(14,2);
  v_line_total numeric(14,2);
  v_phone text;
  v_note_owner uuid;
  v_proposal jsonb;
begin
  select coalesce((select cs.active from public.company_suppliers cs
                   where cs.company_id = p_supplier_company_id), false)
    into v_supplier_active;
  if not v_supplier_active then
    raise exception 'Supplier is not available for ordering'
      using errcode = 'P0001', hint = 'supplier_not_active';
  end if;
  if p_buyer_company_id = p_supplier_company_id then
    raise exception 'Cannot order from yourself' using errcode = 'P0001', hint = 'same_company';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Order lines are required' using errcode = 'P0001', hint = 'lines_required';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'Too many order lines' using errcode = 'P0001', hint = 'too_many_lines';
  end if;

  -- Rebuild clean lines: only product_key + a bounded quantity survive; the
  -- price is resolved by the supplier's own product_selling_prices.
  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := round(coalesce((v_item->>'quantity')::numeric, 0), 3);
    if v_qty <= 0 or v_qty > 1000000 then
      raise exception 'Order quantity must be between 0 and 1000000'
        using errcode = 'P0001', hint = 'bad_quantity';
    end if;
    select w.product_key, w.product_name, w.unit, w.wholesale_price, w.on_hand, w.has_count
      into v_row
      from public.wa_supplier_product_pricing(
        p_supplier_company_id, array[coalesce(v_item->>'product_key', '')]
      ) w
      where w.wholesale_price is not null
      limit 1;
    if v_row is null then
      raise exception 'Product % is not in the supplier''s wholesale catalogue'
        using errcode = 'P0001', hint = 'product_unpriced_or_unknown';
    end if;
    if v_row.has_count and v_qty > v_row.on_hand then
      raise exception 'Only % of % are on hand at the supplier'
        using errcode = 'P0001', hint = 'stock_insufficient';
    end if;
    v_price := round(v_row.wholesale_price, 2);
    v_line_total := round(v_qty * v_price, 2);
    v_total := v_total + v_line_total;
    v_lines := v_lines || jsonb_build_object(
      'product_key', v_row.product_key,
      'product_name', v_row.product_name,
      'unit', v_row.unit,
      'quantity', v_qty,
      'wholesale_unit_price', v_price,
      'line_total', v_line_total
    );
  end loop;

  -- The number the buyer pays ("lipa namba"): the supplier owner's registered
  -- phone, falling back to their WhatsApp-linked number.
  select coalesce(
      (select p.phone from public.profiles p
        join public.company_members m on m.profile_id = p.id
       where m.company_id = p_supplier_company_id
         and m.role::text = 'owner' and m.deactivated_at is null
         and nullif(btrim(coalesce(p.phone, '')), '') is not null
       order by m.joined_at, p.created_at limit 1),
      (select i.phone_e164 from public.whatsapp_identities i
        join public.profiles p on p.id = i.profile_id
        join public.company_members m2 on m2.profile_id = p.id
       where m2.company_id = p_supplier_company_id
         and m2.role::text = 'owner' and m2.deactivated_at is null
         and i.revoked_at is null and i.opted_out_at is null
       order by m2.joined_at, p.created_at, i.verified_at desc limit 1)
    ) into v_phone;

  v_proposal := jsonb_build_object(
    'buyer_company_id', p_buyer_company_id,
    'supplier_company_id', p_supplier_company_id,
    'status', 'placed',
    'currency', 'TZS',
    'total_wholesale', v_total,
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'supplier_phone_e164', v_phone,
    'lines', v_lines
  );

  if p_dry_run then
    return jsonb_build_object('dry_run', true) || v_proposal;
  end if;

  v_order_no := 'AGZ-' || to_char(nextval('public.shop_order_no_seq'), 'FM0000');
  insert into public.shop_orders
    (order_no, buyer_company_id, supplier_company_id, status, currency,
     total_wholesale, note, supplier_phone_e164, placed_at)
  values
    (v_order_no, p_buyer_company_id, p_supplier_company_id, 'placed', 'TZS',
     v_total, v_proposal->>'note', v_phone, clock_timestamp())
  returning id into v_order_id;

  insert into public.shop_order_lines
    (order_id, product_key, product_name, unit, quantity, wholesale_unit_price, line_total)
  select v_order_id, l->>'product_key', l->>'product_name', nullif(l->>'unit', ''),
         (l->>'quantity')::numeric, (l->>'wholesale_unit_price')::numeric, (l->>'line_total')::numeric
    from jsonb_array_elements(v_lines) as l;

  insert into public.shop_order_events (order_id, event, actor_company_id, note)
  values (v_order_id, 'placed', p_buyer_company_id,
          'Agizo limewekwa WhatsApp – supplier anathibitisha.');

  -- Web bell for the supplier's owner, who must now fulfil the order.
  if private.shop_owner_of(p_supplier_company_id) is not null then
    insert into public.app_notifications
      (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      p_supplier_company_id,
      private.shop_owner_of(p_supplier_company_id),
      null,
      'shop_order',
      'Agizo jipya la bidhaa',
      'Uma milki mpya (' || v_order_no || ') – jumla TSh ' || to_char(v_total, 'FM999G999G999') || '.',
      jsonb_build_object('order_id', v_order_id, 'order_no', v_order_no, 'direction', 'incoming')
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'supplier_phone_e164', v_phone,
    'total_wholesale', v_total,
    'currency', 'TZS'
  ) || v_proposal;
end;
$$;

revoke all on function public.wa_place_shop_order(uuid, uuid, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.wa_place_shop_order(uuid, uuid, jsonb, text, boolean)
  to service_role;

-- ── Transition an order (accept / reject / deliver / verify / cancel) ──────
-- Each step checks actor side + current status and writes an event + a web-bell
-- notification for the counterparty's owner.
create or replace function public.wa_shop_order_action(
  p_order_id uuid,
  p_actor_company_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.shop_orders;
  v_is_buyer boolean;
  v_is_supplier boolean;
  v_counterparty uuid;
  v_title text;
  v_body text;
begin
  select * into v_order from public.shop_orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0001', hint = 'order_not_found';
  end if;
  v_is_buyer := v_order.buyer_company_id = p_actor_company_id;
  v_is_supplier := v_order.supplier_company_id = p_actor_company_id;
  if not (v_is_buyer or v_is_supplier) then
    raise exception 'Only a party to the order may update it'
      using errcode = 'P0001', hint = 'not_party';
  end if;

  case p_action
    when 'accept' then
      if not v_is_supplier or v_order.status <> 'placed' then
        raise exception 'Only the supplier may accept a placed order'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'accepted', accepted_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.buyer_company_id; v_title := 'Agizo limekubaliwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imekubaliwa na muuzaji.';
    when 'reject' then
      if not v_is_supplier or v_order.status <> 'placed' then
        raise exception 'Only the supplier may reject a placed order'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'rejected', rejected_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.buyer_company_id; v_title := 'Agizo limekataliwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imekataliwa na muuzaji.';
    when 'deliver' then
      if not v_is_supplier or v_order.status <> 'accepted' then
        raise exception 'Only the supplier may mark an accepted order as delivered'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'delivered', delivered_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.buyer_company_id; v_title := 'Agizo limetolewa';
      v_body := 'Uma milki ' || v_order.order_no || ' imetolewa. Thibitisha ukijua zimewasili.';
    when 'verify' then
      if not v_is_buyer or v_order.status <> 'delivered' then
        raise exception 'Only the buyer may verify a delivered order'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'verified', verified_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := v_order.supplier_company_id; v_title := 'Agizo limethibitishwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imethibitishwa na mnunuzi.';
    when 'cancel' then
      if v_order.status not in ('placed', 'accepted') then
        raise exception 'Only a placed or accepted order may be cancelled'
          using errcode = 'P0001', hint = 'bad_transition';
      end if;
      update public.shop_orders set status = 'cancelled', cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
       where id = p_order_id;
      v_counterparty := case when v_is_buyer then v_order.supplier_company_id else v_order.buyer_company_id end;
      v_title := 'Agizo limeghairiwa';
      v_body := 'Uma milki ' || v_order.order_no || ' imeghairiwa.';
    else
      raise exception 'Unknown order action' using errcode = 'P0001', hint = 'unknown_action';
  end case;

  insert into public.shop_order_events (order_id, event, actor_company_id, note)
  values (p_order_id, p_action, p_actor_company_id, nullif(btrim(coalesce(p_note, '')), ''));

  if v_counterparty is not null and private.shop_owner_of(v_counterparty) is not null then
    insert into public.app_notifications
      (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      v_counterparty,
      private.shop_owner_of(v_counterparty),
      null,
      'shop_order',
      v_title,
      v_body,
      jsonb_build_object('order_id', p_order_id, 'order_no', v_order.order_no, 'direction',
                         case when v_is_buyer then 'incoming' else 'outgoing' end)
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', case p_action
        when 'accept' then 'accepted' when 'reject' then 'rejected'
        when 'deliver' then 'delivered' when 'verify' then 'verified'
        else 'cancelled' end,
    'order_no', v_order.order_no
  );
end;
$$;

revoke all on function public.wa_shop_order_action(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.wa_shop_order_action(uuid, uuid, text, text)
  to service_role;

-- ── The order book for one company (webhook side) ───────────────────────────
-- Incoming = orders this shop must fulfil; outgoing = orders this shop placed.
-- Includes per-status counts so the assistant can answer "how many orders have
-- I placed / confirmed".
create or replace function public.wa_shop_order_book(p_company_id uuid)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'outgoing', coalesce((select jsonb_agg(x order by x.placed_at desc) from (
      select o.id, o.order_no, o.status, o.total_wholesale, o.currency, o.placed_at,
             c.name as counterparty_name,
             coalesce((select jsonb_agg(jsonb_build_object(
                        'product_name', l.product_name, 'quantity', l.quantity,
                        'unit', l.unit, 'wholesale_unit_price', l.wholesale_unit_price,
                        'line_total', l.line_total))
                        from public.shop_order_lines l where l.order_id = o.id), '[]'::jsonb) as lines
        from public.shop_orders o
        join public.companies c on c.id = o.supplier_company_id
       where o.buyer_company_id = p_company_id) x), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(y order by y.placed_at desc) from (
      select o.id, o.order_no, o.status, o.total_wholesale, o.currency, o.placed_at,
             c.name as counterparty_name,
             coalesce((select jsonb_agg(jsonb_build_object(
                        'product_name', l.product_name, 'quantity', l.quantity,
                        'unit', l.unit, 'wholesale_unit_price', l.wholesale_unit_price,
                        'line_total', l.line_total))
                        from public.shop_order_lines l where l.order_id = o.id), '[]'::jsonb) as lines
        from public.shop_orders o
        join public.companies c on c.id = o.buyer_company_id
       where o.supplier_company_id = p_company_id) y), '[]'::jsonb),
    'counts', jsonb_build_object(
      'placed', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'placed'),
      'accepted', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'accepted'),
      'delivered', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'delivered'),
      'verified', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'verified'),
      'rejected', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'rejected'),
      'cancelled', (select count(*)::int from public.shop_orders o where (o.buyer_company_id = p_company_id or o.supplier_company_id = p_company_id) and o.status = 'cancelled')
    )
  );
$$;

revoke all on function public.wa_shop_order_book(uuid) from public, anon, authenticated;
grant execute on function public.wa_shop_order_book(uuid) to service_role;

-- ── Authenticated (web) mirrors ─────────────────────────────────────────────
-- These derive the actor company from auth.uid() and are the ONLY web path.
create or replace function public.my_shop_orders()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.wa_shop_order_book(private.auth_company_id());
$$;

revoke all on function public.my_shop_orders() from public, anon;
grant execute on function public.my_shop_orders() to authenticated;

create or replace function public.my_shop_order_action(p_order_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'Only an owner or accountant may manage orders'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return public.wa_shop_order_action(p_order_id, private.auth_company_id(), p_action, p_note);
end;
$$;

revoke all on function public.my_shop_order_action(uuid, text, text) from public, anon;
grant execute on function public.my_shop_order_action(uuid, text, text) to authenticated;

create or replace function public.my_supplier_status()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'is_supplier', coalesce((select cs.active from public.company_suppliers cs where cs.company_id = private.auth_company_id()), false),
    'opted_in_at', (select cs.opted_in_at from public.company_suppliers cs where cs.company_id = private.auth_company_id())
  );
$$;

revoke all on function public.my_supplier_status() from public, anon;
grant execute on function public.my_supplier_status() to authenticated;

-- Owner-only: register/unregister this shop as a B2B supplier. Opt-in is an
-- audited, persistent choice, so unregistering flips the flag rather than
-- deleting the row.
create or replace function public.set_company_supplier(p_active boolean)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_profile uuid := auth.uid();
  v_row public.company_suppliers;
begin
  if v_profile is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() <> 'owner' then
    raise exception 'Only the owner may register this shop as a supplier'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  insert into public.company_suppliers (company_id, active, opted_in_by)
  values (v_company, p_active, v_profile)
  on conflict (company_id)
  do update set active = excluded.active,
                opted_in_by = coalesce(public.company_suppliers.opted_in_by, excluded.opted_in_by),
                updated_at = clock_timestamp()
  returning * into v_row;
  return jsonb_build_object('is_supplier', v_row.active);
end;
$$;

revoke all on function public.set_company_supplier(boolean) from public, anon;
grant execute on function public.set_company_supplier(boolean) to authenticated;