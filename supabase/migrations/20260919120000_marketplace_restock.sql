-- Cross-shop restocking over WhatsApp: consent, discovery, orders, contacts.
-- Mirrors what is deployed on production. Applied there via the admin-console
-- repository before this migration existed; recorded here so a rebuilt
-- database reproduces it. Idempotent throughout.

-- ============================================================================
-- marketplace_restock.sql
-- ============================================================================
-- "Nimeishiwa Sabuni" -> find shops that have it -> place an order -> exchange
-- contacts.
--
-- Run supabase/marketplace_preflight.sql first. This migration only touches
-- columns that preflight verifies, and it creates its own tables for
-- everything it cannot verify. It is safe to apply on its own: nothing here
-- alters an existing table.
--
-- The bridge that mirrors a marketplace order into the legacy `shop_orders`
-- table lives in marketplace_shop_order_bridge.sql and is applied separately,
-- once preflight has reported shop_orders' real NOT NULL columns.
--
-- Three decisions are baked in here. They are reversible; see the notes.
--   1. Opt-in is mutual. A shop that does not share its own stock cannot see
--      anyone else's. Default is off for every company.
--   2. Stock counts have an age. Counts older than max_stock_age_days are
--      excluded from search, and every result carries counted_at so the buyer
--      can judge it.
--   3. Contacts are exchanged both ways on order placement. The buyer needs
--      to reach the supplier; the supplier needs to deliver.
-- ============================================================================

create extension if not exists pg_trgm;

-- ============================================================================
-- PART A  Consent
-- ============================================================================
-- Nothing in this feature reads across a tenant boundary unless the company
-- that owns the data has a row here with opt_in = true. Absence means no.

create table if not exists public.company_marketplace_settings (
  company_id         uuid primary key references public.companies(id) on delete cascade,
  opt_in             boolean not null default false,
  -- Stock visibility is the minimum. Price visibility is a second, separate
  -- consent: a shop may be willing to say "I have soap" without publishing
  -- what it pays for it.
  share_prices       boolean not null default false,
  max_stock_age_days integer not null default 14 check (max_stock_age_days between 1 and 90),
  -- Whose contact card is handed to a buyer. Null falls back to the company's
  -- oldest active owner/admin member.
  contact_profile_id uuid references public.profiles(id) on delete set null,
  opted_in_at        timestamptz,
  updated_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

alter table public.company_marketplace_settings enable row level security;
revoke all on table public.company_marketplace_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.company_marketplace_settings to service_role;

-- ============================================================================
-- PART B  Cross-shop product identity
-- ============================================================================
-- product_key is scoped per company: shop A's 'sabuni' and shop B's 'sabuni'
-- are unrelated rows, and either may mean a different physical product. There
-- is no global catalogue, so matching is a ranked guess and the UI must always
-- show the supplier's own product name so a human can catch a bad match.
--
-- Confidence ladder, highest first:
--   1.00  shared barcode          - the only exact identity RISIP has
--   0.95  identical normalized name
--   0.85  supplier name starts with the query
--   ~sim  trigram similarity, floor 0.35

create or replace function private.marketplace_normalize(p_text text)
returns text
language sql immutable
set search_path = pg_catalog, public
as $$
  -- Lowercase, punctuation to space, collapse runs of space. Size and pack
  -- tokens ("500g", "1kg", "dazani") are deliberately KEPT: dropping them
  -- would merge Sabuni 500g with Sabuni 1kg, which is a wrong order.
  select nullif(btrim(regexp_replace(
           regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g')), '');
$$;

-- A denormalized search index. Product names are spread across product_units,
-- product_costs and product_selling_prices; resolving them per query would
-- make a trigram index impossible. This table is rebuilt per company.
create table if not exists public.marketplace_product_index (
  company_id      uuid not null references public.companies(id) on delete cascade,
  product_key     text not null,
  product_name    text not null,
  normalized_name text not null,
  barcodes        text[] not null default '{}',
  indexed_at      timestamptz not null default now(),
  primary key (company_id, product_key)
);

create index if not exists marketplace_product_index_trgm
  on public.marketplace_product_index using gin (normalized_name gin_trgm_ops);
create index if not exists marketplace_product_index_barcodes
  on public.marketplace_product_index using gin (barcodes);

alter table public.marketplace_product_index enable row level security;
revoke all on table public.marketplace_product_index from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_product_index to service_role;

create or replace function public.marketplace_reindex_company(p_company_id uuid)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  delete from public.marketplace_product_index where company_id = p_company_id;

  insert into public.marketplace_product_index
    (company_id, product_key, product_name, normalized_name, barcodes)
  select p_company_id,
         pu.product_key,
         pu.resolved_name,
         private.marketplace_normalize(pu.resolved_name),
         coalesce((select array_agg(distinct b.barcode)
                   from public.product_barcodes b
                   where b.company_id = p_company_id
                     and b.product_key = pu.product_key), '{}')
  from (
    select distinct u.product_key,
           coalesce(
             max(u.product_name),
             (select c.product_name from public.product_costs c
               where c.company_id = p_company_id and c.product_key = u.product_key
               order by c.effective_from desc nulls last limit 1),
             (select sp.product_name from public.product_selling_prices sp
               where sp.company_id = p_company_id and sp.product_key = u.product_key
               order by sp.effective_from desc nulls last limit 1)
           ) as resolved_name
    from public.product_units u
    where u.company_id = p_company_id
    group by u.product_key
  ) pu
  -- An archived product is not for sale and must not appear in search.
  where pu.resolved_name is not null
    and private.marketplace_normalize(pu.resolved_name) is not null
    and not exists (select 1 from public.product_archives pa
                    where pa.company_id = p_company_id
                      and pa.product_key = pu.product_key);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.marketplace_reindex_all()
returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_total integer := 0;
begin
  -- Only opted-in companies are indexed. Opting out and reindexing removes a
  -- company from discovery entirely.
  for v_company in
    select s.company_id from public.company_marketplace_settings s where s.opt_in
  loop
    v_total := v_total + public.marketplace_reindex_company(v_company);
  end loop;
  return v_total;
end $$;

-- ============================================================================
-- PART C  Conversation state and orders
-- ============================================================================
-- WhatsApp is stateless per message. "2 x 50" only means something against the
-- numbered list the shop owner was just shown, so the list is persisted.

create table if not exists public.marketplace_pending_selections (
  id             uuid primary key default gen_random_uuid(),
  buyer_company_id uuid not null references public.companies(id) on delete cascade,
  buyer_profile_id uuid references public.profiles(id) on delete set null,
  query_text     text not null,
  options        jsonb not null,
  created_at     timestamptz not null default now(),
  -- A stale pick-list is worse than none: stock moves. 30 minutes.
  expires_at     timestamptz not null default now() + interval '30 minutes',
  consumed_at    timestamptz
);

create index if not exists marketplace_pending_active_idx
  on public.marketplace_pending_selections (buyer_company_id, created_at desc)
  where consumed_at is null;

-- The marketplace order itself. This is the source of truth for a cross-shop
-- restock: it carries the matched product key on BOTH sides plus the stock
-- snapshot the buyer acted on, which a generic shop_orders line cannot hold.
create table if not exists public.marketplace_order_requests (
  id                  uuid primary key default gen_random_uuid(),
  shop_order_id       uuid,
  buyer_company_id    uuid not null references public.companies(id) on delete cascade,
  supplier_company_id uuid not null references public.companies(id) on delete cascade,
  buyer_profile_id    uuid references public.profiles(id) on delete set null,
  query_text          text not null,
  buyer_product_key   text,
  supplier_product_key text not null,
  product_name        text not null,
  match_confidence    numeric(4,3) not null,
  match_basis         text not null check (match_basis in ('barcode','exact_name','prefix_name','fuzzy_name')),
  quantity            numeric not null check (quantity > 0),
  unit                text,
  unit_price          numeric,
  currency            text,
  -- What the buyer was shown at the moment they chose. Kept for disputes:
  -- "you said you had 40" is answerable.
  stock_snapshot_qty  numeric,
  stock_counted_at    timestamptz,
  status              text not null default 'placed'
                        check (status in ('placed','accepted','rejected','delivered','cancelled')),
  status_reason       text,
  placed_at           timestamptz not null default now(),
  accepted_at         timestamptz,
  rejected_at         timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  check (buyer_company_id <> supplier_company_id)
);

create index if not exists marketplace_orders_supplier_idx
  on public.marketplace_order_requests (supplier_company_id, placed_at desc);
create index if not exists marketplace_orders_buyer_idx
  on public.marketplace_order_requests (buyer_company_id, placed_at desc);

do $$ declare t text; begin
  foreach t in array array['marketplace_pending_selections','marketplace_order_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- ============================================================================
-- PART D  Who may act
-- ============================================================================
-- These functions are granted to service_role (the WhatsApp worker, which has
-- no end-user JWT and so no auth.uid()) and to authenticated (the web app,
-- which does). anon is revoked everywhere, so a null auth.uid() inside these
-- functions can only mean the trusted worker.

create or replace function private.marketplace_require_actor(
  p_company_id uuid,
  p_profile_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_uid uuid := auth.uid(); v_profile uuid;
begin
  if p_company_id is null then
    raise exception 'company_id is required' using errcode = '22023';
  end if;

  if v_uid is null then
    return p_profile_id;  -- service_role: the worker names the acting member
  end if;

  select cm.profile_id into v_profile
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.profile_id = v_uid
    and cm.deactivated_at is null;

  if v_profile is null then
    raise exception 'not an active member of this company'
      using errcode = 'P0001', hint = 'not_company_member';
  end if;
  return v_profile;
end $$;

-- Opt-in is mutual: a shop that does not publish its own stock does not get to
-- browse anyone else's. Drop this call from marketplace_search_stock if you
-- decide discovery should be open to non-sharing shops.
create or replace function private.marketplace_require_optin(p_company_id uuid)
returns public.company_marketplace_settings
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare s public.company_marketplace_settings;
begin
  select * into s from public.company_marketplace_settings where company_id = p_company_id;
  if s.company_id is null or not s.opt_in then
    raise exception 'company has not joined the restock marketplace'
      using errcode = 'P0001', hint = 'marketplace_not_opted_in';
  end if;
  return s;
end $$;

-- ============================================================================
-- PART E  Search
-- ============================================================================

create or replace function public.marketplace_search_stock(
  p_buyer_company_id uuid,
  p_query            text,
  p_limit            integer default 5
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_norm  text := private.marketplace_normalize(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 10));
  v_buyer_barcodes text[];
  v_buyer_key text;
  v_rows jsonb;
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  perform private.marketplace_require_optin(p_buyer_company_id);

  if v_norm is null then
    raise exception 'a product name is required' using errcode = '22023';
  end if;

  -- The buyer's own matching product, if they stock it. Gives us barcodes for
  -- an exact cross-shop match and records what they were trying to replace.
  select i.product_key, i.barcodes into v_buyer_key, v_buyer_barcodes
  from public.marketplace_product_index i
  where i.company_id = p_buyer_company_id
    and (i.normalized_name = v_norm or i.normalized_name like v_norm || '%')
  order by (i.normalized_name = v_norm) desc
  limit 1;
  v_buyer_barcodes := coalesce(v_buyer_barcodes, '{}');

  select coalesce(jsonb_agg(to_jsonb(m) order by m.match_confidence desc, m.quantity desc), '[]'::jsonb)
    into v_rows
  from (
    select
      i.company_id                        as supplier_company_id,
      c.name                              as supplier_name,
      i.product_key                       as supplier_product_key,
      i.product_name,
      sc.quantity,
      sc.unit,
      sc.counted_at                       as stock_counted_at,
      -- Age is always returned. A nine-day-old count is a real answer, but the
      -- buyer has to be told it is nine days old.
      extract(day from (now() - sc.counted_at))::int as stock_age_days,
      case when s.share_prices then sp.wholesale_price end  as unit_price,
      case when s.share_prices then sp.wholesale_min_qty end as min_quantity,
      case when s.share_prices then sp.currency end          as currency,
      case
        when i.barcodes && v_buyer_barcodes then 'barcode'
        when i.normalized_name = v_norm     then 'exact_name'
        when i.normalized_name like v_norm || '%' then 'prefix_name'
        else 'fuzzy_name'
      end as match_basis,
      case
        when i.barcodes && v_buyer_barcodes then 1.000
        when i.normalized_name = v_norm     then 0.950
        when i.normalized_name like v_norm || '%' then 0.850
        else round(similarity(i.normalized_name, v_norm)::numeric, 3)
      end as match_confidence
    from public.marketplace_product_index i
    join public.company_marketplace_settings s
      on s.company_id = i.company_id and s.opt_in
    join public.companies c on c.id = i.company_id
    -- Latest count per product. stock_counts is a periodic count, not a live
    -- balance, which is exactly why counted_at travels with every row.
    join lateral (
      select sc2.quantity, sc2.unit, sc2.counted_at
      from public.stock_counts sc2
      where sc2.company_id = i.company_id
        and sc2.product_key = i.product_key
      order by sc2.counted_at desc nulls last
      limit 1
    ) sc on true
    left join lateral (
      select sp2.wholesale_price, sp2.wholesale_min_qty, sp2.currency
      from public.product_selling_prices sp2
      where sp2.company_id = i.company_id
        and sp2.product_key = i.product_key
      order by sp2.effective_from desc nulls last
      limit 1
    ) sp on true
    where i.company_id <> p_buyer_company_id
      and sc.quantity > 0
      and sc.counted_at >= now() - make_interval(days => s.max_stock_age_days)
      and (
        i.barcodes && v_buyer_barcodes
        or i.normalized_name = v_norm
        or i.normalized_name like v_norm || '%'
        or similarity(i.normalized_name, v_norm) >= 0.35
      )
    -- Rank BEFORE the limit. Ordering only in the outer jsonb_agg would take
    -- an arbitrary v_limit rows and then sort those, dropping better matches.
    order by match_confidence desc, sc.quantity desc
    limit v_limit
  ) m;

  return jsonb_build_object(
    'query', p_query,
    'normalized', v_norm,
    'buyerProductKey', v_buyer_key,
    'options', v_rows
  );
end $$;

-- Search, then remember what was shown so a numeric reply can be resolved.
create or replace function public.marketplace_create_selection(
  p_buyer_company_id uuid,
  p_query            text,
  p_buyer_profile_id uuid default null,
  p_limit            integer default 5
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid;
  v_search  jsonb;
  v_id      uuid;
  v_empty   boolean;
begin
  v_profile := private.marketplace_require_actor(p_buyer_company_id, p_buyer_profile_id);
  v_search  := public.marketplace_search_stock(p_buyer_company_id, p_query, p_limit);

  v_empty := jsonb_array_length(v_search->'options') = 0;

  -- One open pick-list per shop. A new request supersedes the last.
  update public.marketplace_pending_selections
     set consumed_at = now()
   where buyer_company_id = p_buyer_company_id and consumed_at is null;

  -- A search that found nothing is still recorded, and immediately consumed so
  -- it can never be ordered against. Without the row, searchesNoResult in the
  -- admin console would always read zero and the "which products do shops ask
  -- for that nobody stocks" signal would be invisible.
  insert into public.marketplace_pending_selections
    (buyer_company_id, buyer_profile_id, query_text, options, consumed_at)
  values (p_buyer_company_id, v_profile, p_query,
          jsonb_build_object('buyerProductKey', v_search->'buyerProductKey',
                             'options', v_search->'options'),
          case when v_empty then now() end)
  returning id into v_id;

  return jsonb_build_object(
    'selectionId', case when v_empty then null else v_id end,
    'query', p_query,
    'buyerProductKey', v_search->'buyerProductKey',
    'options', v_search->'options',
    'expiresInMinutes', 30
  );
end $$;

-- ============================================================================
-- PART F  Placing the order
-- ============================================================================

-- Replaced by marketplace_shop_order_bridge.sql once preflight has reported
-- shop_orders' real NOT NULL columns. Until then a marketplace order is fully
-- functional through marketplace_order_requests; it simply does not also
-- appear in the legacy shop_orders screens.
create or replace function private.marketplace_link_shop_order(
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  return null;
end $$;

create or replace function public.marketplace_place_order(
  p_selection_id  uuid,
  p_option_index  integer,
  p_quantity      numeric,
  p_buyer_profile_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_sel      public.marketplace_pending_selections;
  v_opt      jsonb;
  v_profile  uuid;
  v_request  public.marketplace_order_requests;
  v_shop_order uuid;
  v_buyer_card jsonb;
  v_supplier_card jsonb;
begin
  select * into v_sel from public.marketplace_pending_selections where id = p_selection_id;
  if v_sel.id is null then
    raise exception 'that list has expired, please ask again'
      using errcode = 'P0002', hint = 'selection_not_found';
  end if;
  if v_sel.consumed_at is not null or v_sel.expires_at < now() then
    raise exception 'that list has expired, please ask again'
      using errcode = 'P0001', hint = 'selection_expired';
  end if;

  v_profile := private.marketplace_require_actor(v_sel.buyer_company_id, p_buyer_profile_id);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = '22023';
  end if;

  -- Options are presented to the shop owner as 1..n.
  v_opt := (v_sel.options->'options') -> (p_option_index - 1);
  if v_opt is null then
    raise exception 'pick a number from the list' using errcode = '22023', hint = 'bad_option_index';
  end if;

  -- The supplier's consent is re-checked at placement, not just at search:
  -- a shop may have opted out between the list and the reply.
  perform private.marketplace_require_optin((v_opt->>'supplier_company_id')::uuid);

  insert into public.marketplace_order_requests (
    buyer_company_id, supplier_company_id, buyer_profile_id, query_text,
    buyer_product_key, supplier_product_key, product_name,
    match_confidence, match_basis, quantity, unit, unit_price, currency,
    stock_snapshot_qty, stock_counted_at
  ) values (
    v_sel.buyer_company_id,
    (v_opt->>'supplier_company_id')::uuid,
    v_profile,
    v_sel.query_text,
    nullif(v_sel.options->>'buyerProductKey', ''),
    v_opt->>'supplier_product_key',
    v_opt->>'product_name',
    (v_opt->>'match_confidence')::numeric,
    v_opt->>'match_basis',
    p_quantity,
    v_opt->>'unit',
    nullif(v_opt->>'unit_price', '')::numeric,
    nullif(v_opt->>'currency', ''),
    nullif(v_opt->>'quantity', '')::numeric,
    nullif(v_opt->>'stock_counted_at', '')::timestamptz
  ) returning * into v_request;

  update public.marketplace_pending_selections set consumed_at = now() where id = p_selection_id;

  v_shop_order := private.marketplace_link_shop_order(v_request.id);
  if v_shop_order is not null then
    update public.marketplace_order_requests set shop_order_id = v_shop_order where id = v_request.id;
  end if;

  -- Tell both shops on WhatsApp, through the RISIP account. Each side gets the
  -- other's contact card; the supplier's message is the one that asks for a
  -- 1 / 0 confirmation.
  v_buyer_card    := public.marketplace_order_contacts(v_request.id, v_request.buyer_company_id);
  v_supplier_card := public.marketplace_order_contacts(v_request.id, v_request.supplier_company_id);

  perform private.marketplace_enqueue(
    v_request.id, v_request.buyer_company_id, 'order_placed_buyer',
    jsonb_build_object('productName', v_request.product_name,
                       'quantity', v_request.quantity, 'unit', v_request.unit,
                       'matchBasis', v_request.match_basis,
                       'shopOrderId', v_shop_order,
                       'contact', v_buyer_card));

  perform private.marketplace_enqueue(
    v_request.id, v_request.supplier_company_id, 'order_new_supplier',
    jsonb_build_object('productName', v_request.product_name,
                       'quantity', v_request.quantity, 'unit', v_request.unit,
                       'supplierProductKey', v_request.supplier_product_key,
                       'shopOrderId', v_shop_order,
                       'awaitingConfirmation', true,
                       'contact', v_supplier_card));

  return jsonb_build_object(
    'orderId', v_request.id,
    'shopOrderId', v_shop_order,
    'status', v_request.status,
    'productName', v_request.product_name,
    'quantity', v_request.quantity,
    'unit', v_request.unit,
    -- marketplace_order_contacts returns the card the ASKER receives, so the
    -- buyer's call yields the supplier's details and vice versa.
    'supplierContact', v_buyer_card,
    'buyerContact',    v_supplier_card
  );
end $$;

-- ============================================================================
-- PART G  Contact exchange
-- ============================================================================
-- p_for_company_id is the company ASKING. It receives the other side's card.
-- Contact details are released only because both companies opted in and a real
-- order links them; there is no way to read a contact without an order id.

create or replace function public.marketplace_order_contacts(
  p_order_id        uuid,
  p_for_company_id  uuid
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  o public.marketplace_order_requests;
  v_other uuid;
  v_card  jsonb;
begin
  select * into o from public.marketplace_order_requests where id = p_order_id;
  if o.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if p_for_company_id = o.buyer_company_id then
    v_other := o.supplier_company_id;
  elsif p_for_company_id = o.supplier_company_id then
    v_other := o.buyer_company_id;
  else
    raise exception 'not a party to this order' using errcode = 'P0001', hint = 'not_order_party';
  end if;

  select jsonb_build_object(
    'companyId',   c.id,
    'companyName', c.name,
    'contactName', p.full_name,
    'phone',       p.phone,
    -- Verified, un-revoked, not opted out: the number that can actually
    -- receive a WhatsApp message today.
    'whatsapp',    (select w.phone_e164 from public.whatsapp_identities w
                     where w.company_id = c.id
                       and w.verified_at is not null
                       and w.revoked_at is null
                       and w.opted_out_at is null
                     order by (w.profile_id = p.id) desc, w.verified_at desc
                     limit 1)
  ) into v_card
  from public.companies c
  left join public.company_marketplace_settings s on s.company_id = c.id
  left join lateral (
    select pr.id, pr.full_name, pr.phone
    from public.profiles pr
    where pr.id = coalesce(
      s.contact_profile_id,
      -- public.user_role is (owner, accountant, worker). There is no 'admin'
      -- label; comparing the enum against one raises invalid_text_representation.
      (select cm.profile_id from public.company_members cm
        where cm.company_id = c.id and cm.deactivated_at is null
        order by (cm.role = 'owner') desc, cm.joined_at
        limit 1))
  ) p on true
  where c.id = v_other;

  return coalesce(v_card, jsonb_build_object('companyId', v_other, 'contactName', null));
end $$;

-- ============================================================================
-- PART H  The other shop's side
-- ============================================================================

create or replace function public.marketplace_incoming_orders(
  p_supplier_company_id uuid,
  p_status              text default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  perform private.marketplace_require_actor(p_supplier_company_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'orderId', o.id, 'status', o.status,
             'productName', o.product_name, 'quantity', o.quantity, 'unit', o.unit,
             'unitPrice', o.unit_price, 'currency', o.currency,
             'matchConfidence', o.match_confidence, 'matchBasis', o.match_basis,
             'buyerCompanyId', o.buyer_company_id, 'buyerName', b.name,
             'placedAt', o.placed_at) order by o.placed_at desc)
    from public.marketplace_order_requests o
    join public.companies b on b.id = o.buyer_company_id
    where o.supplier_company_id = p_supplier_company_id
      and (p_status is null or o.status = p_status)
  ), '[]'::jsonb);
end $$;

create or replace function public.marketplace_my_orders(
  p_buyer_company_id uuid,
  p_status           text default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'orderId', o.id, 'status', o.status,
             'productName', o.product_name, 'quantity', o.quantity, 'unit', o.unit,
             'unitPrice', o.unit_price, 'currency', o.currency,
             'supplierCompanyId', o.supplier_company_id, 'supplierName', s.name,
             'placedAt', o.placed_at) order by o.placed_at desc)
    from public.marketplace_order_requests o
    join public.companies s on s.id = o.supplier_company_id
    where o.buyer_company_id = p_buyer_company_id
      and (p_status is null or o.status = p_status)
  ), '[]'::jsonb);
end $$;

create or replace function public.marketplace_update_order_status(
  p_order_id uuid,
  p_status   text,
  p_reason   text default null,
  p_actor_company_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare o public.marketplace_order_requests; v_actor uuid;
begin
  select * into o from public.marketplace_order_requests where id = p_order_id;
  if o.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;

  -- The supplier accepts, rejects or delivers. Only the buyer may cancel.
  v_actor := coalesce(p_actor_company_id,
                      case when p_status = 'cancelled' then o.buyer_company_id
                           else o.supplier_company_id end);
  if p_status = 'cancelled' and v_actor <> o.buyer_company_id then
    raise exception 'only the buyer may cancel' using errcode = 'P0001', hint = 'not_buyer';
  end if;
  if p_status in ('accepted','rejected','delivered') and v_actor <> o.supplier_company_id then
    raise exception 'only the supplier may set that status' using errcode = 'P0001', hint = 'not_supplier';
  end if;
  perform private.marketplace_require_actor(v_actor);

  update public.marketplace_order_requests
     set status = p_status,
         status_reason = left(btrim(coalesce(p_reason, '')), 500),
         accepted_at  = case when p_status = 'accepted'  then now() else accepted_at  end,
         rejected_at  = case when p_status = 'rejected'  then now() else rejected_at  end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_order_id
   returning * into o;

  -- The counterparty hears about it on WhatsApp: the buyer when the supplier
  -- accepts, rejects or delivers; the supplier when the buyer cancels.
  perform private.marketplace_enqueue(
    o.id,
    case when p_status = 'cancelled' then o.supplier_company_id else o.buyer_company_id end,
    'order_' || p_status,
    jsonb_build_object('productName', o.product_name, 'quantity', o.quantity,
                       'unit', o.unit, 'reason', o.status_reason,
                       'shopOrderId', o.shop_order_id));

  return jsonb_build_object('orderId', o.id, 'status', o.status);
end $$;

-- ============================================================================
-- PART I  WhatsApp delivery and supplier confirmation
-- ============================================================================
-- SUPERSEDED by marketplace_notifications.sql, which drops the table and the
-- two functions below and moves marketplace sends onto RISIP's existing
-- whatsapp_notification_deliveries. This queue was a second delivery path,
-- built without sight of the edge functions; apply both files in order and the
-- end state is correct. Kept here so the history reads honestly.
--
-- Both shops are told on WhatsApp through the RISIP account, and the supplier
-- confirms by replying there. Rows are queued here rather than sent inline so
-- a provider outage cannot roll back an order that was legitimately placed.
--
-- Modelled on the existing ops_alert_deliveries / ops_claim_alerts pattern:
-- claim with FOR UPDATE SKIP LOCKED, back off, cap attempts.

create table if not exists public.marketplace_outbound_messages (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.marketplace_order_requests(id) on delete cascade,
  to_company_id uuid not null references public.companies(id) on delete cascade,
  to_profile_id uuid references public.profiles(id) on delete set null,
  -- Resolved at enqueue time: the number that was reachable when the event
  -- happened, not whatever the identity table says at send time.
  to_phone_e164 text,
  kind          text not null check (kind in (
                  'order_placed_buyer', 'order_new_supplier',
                  'order_accepted', 'order_rejected',
                  'order_delivered', 'order_cancelled')),
  payload       jsonb not null,
  status        text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts      integer not null default 0,
  available_at  timestamptz not null default now(),
  sent_at       timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

create index if not exists marketplace_outbound_pending_idx
  on public.marketplace_outbound_messages (available_at)
  where status in ('pending', 'failed', 'sending');

alter table public.marketplace_outbound_messages enable row level security;
revoke all on table public.marketplace_outbound_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_outbound_messages to service_role;

-- Queue one message, resolving the destination WhatsApp number now.
create or replace function private.marketplace_enqueue(
  p_order_id uuid,
  p_to_company_id uuid,
  p_kind text,
  p_payload jsonb
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_profile uuid; v_phone text; v_id uuid;
begin
  select cm.profile_id into v_profile
  from public.company_members cm
  left join public.company_marketplace_settings s on s.company_id = cm.company_id
  where cm.company_id = p_to_company_id
    and cm.deactivated_at is null
  order by (cm.profile_id = s.contact_profile_id) desc, (cm.role = 'owner') desc, cm.joined_at
  limit 1;

  select w.phone_e164 into v_phone
  from public.whatsapp_identities w
  where w.company_id = p_to_company_id
    and w.verified_at is not null
    and w.revoked_at is null
    and w.opted_out_at is null
  order by (w.profile_id = v_profile) desc, w.verified_at desc
  limit 1;

  insert into public.marketplace_outbound_messages
    (order_id, to_company_id, to_profile_id, to_phone_e164, kind, payload)
  values (p_order_id, p_to_company_id, v_profile, v_phone, p_kind, p_payload)
  returning id into v_id;
  return v_id;
end $$;

-- The worker claims a batch, sends each through the RISIP WhatsApp account,
-- then reports back with marketplace_mark_outbound.
create or replace function public.marketplace_claim_outbound()
returns setof public.marketplace_outbound_messages
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.marketplace_outbound_messages
     set status = 'sending', attempts = attempts + 1,
         available_at = now() + interval '2 minutes'
   where id in (
     select id from public.marketplace_outbound_messages
      where status in ('pending', 'failed', 'sending')
        and available_at <= now()
        and attempts < 6
        and to_phone_e164 is not null
      order by created_at
      for update skip locked
      limit 20)
  returning *;
$$;

create or replace function public.marketplace_mark_outbound(
  p_id uuid, p_status text, p_error text default null
) returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.marketplace_outbound_messages
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         last_error = left(p_error, 500)
   where id = p_id;
$$;

-- ── The supplier's reply ───────────────────────────────────────────────────
-- A supplier answering "1" on WhatsApp is not addressing an order id, so the
-- reply resolves against their oldest un-answered order. Returned to the
-- worker so it can name the product in the confirmation prompt.
create or replace function public.marketplace_pending_confirmation(
  p_supplier_company_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare o public.marketplace_order_requests; v_buyer text;
begin
  perform private.marketplace_require_actor(p_supplier_company_id);
  select * into o from public.marketplace_order_requests
   where supplier_company_id = p_supplier_company_id and status = 'placed'
   order by placed_at
   limit 1;
  if o.id is null then return null; end if;
  select name into v_buyer from public.companies where id = o.buyer_company_id;
  return jsonb_build_object(
    'orderId', o.id, 'productName', o.product_name,
    'quantity', o.quantity, 'unit', o.unit,
    'buyerName', v_buyer, 'placedAt', o.placed_at,
    'pendingCount', (select count(*)::int from public.marketplace_order_requests
                      where supplier_company_id = p_supplier_company_id and status = 'placed'));
end $$;

create or replace function public.marketplace_confirm_by_reply(
  p_supplier_company_id uuid,
  p_accept              boolean,
  p_reason              text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare o public.marketplace_order_requests;
begin
  perform private.marketplace_require_actor(p_supplier_company_id);

  -- Lock the row: two replies arriving together must not both decide it.
  select * into o from public.marketplace_order_requests
   where supplier_company_id = p_supplier_company_id and status = 'placed'
   order by placed_at
   limit 1
   for update;

  if o.id is null then
    raise exception 'no order is waiting for your confirmation'
      using errcode = 'P0002', hint = 'no_pending_order';
  end if;

  return public.marketplace_update_order_status(
    o.id, case when p_accept then 'accepted' else 'rejected' end,
    p_reason, p_supplier_company_id);
end $$;

-- ============================================================================
-- PART J  Platform admin oversight
-- ============================================================================

create or replace function public.platform_admin_marketplace(p_days integer default 30)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'metrics', jsonb_build_object(
      'optedInCompanies', (select count(*)::int from public.company_marketplace_settings where opt_in),
      'totalCompanies',   (select count(*)::int from public.companies),
      'indexedProducts',  (select count(*)::int from public.marketplace_product_index),
      'searches',         (select count(*)::int from public.marketplace_pending_selections where created_at >= v_start),
      'searchesNoResult', (select count(*)::int from public.marketplace_pending_selections
                            where created_at >= v_start and jsonb_array_length(options->'options') = 0),
      'ordersPlaced',     (select count(*)::int from public.marketplace_order_requests where placed_at >= v_start),
      'ordersAccepted',   (select count(*)::int from public.marketplace_order_requests where accepted_at >= v_start),
      'ordersRejected',   (select count(*)::int from public.marketplace_order_requests where rejected_at >= v_start),
      'ordersDelivered',  (select count(*)::int from public.marketplace_order_requests where delivered_at >= v_start),
      -- A low-confidence order is a wrong-product risk. This is the number to
      -- watch when tuning the match thresholds.
      'fuzzyOrders',      (select count(*)::int from public.marketplace_order_requests
                            where placed_at >= v_start and match_basis = 'fuzzy_name'),
      'unlinkedOrders',   (select count(*)::int from public.marketplace_order_requests
                            where placed_at >= v_start and shop_order_id is null)
    ),
    'matchBasis', coalesce((select jsonb_agg(jsonb_build_object('basis', x.match_basis, 'count', x.count)
                                             order by x.count desc)
                            from (select match_basis, count(*) as count
                                  from public.marketplace_order_requests
                                  where placed_at >= v_start group by match_basis) x), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
                             'companyId', c.id, 'companyName', c.name,
                             'optIn', coalesce(s.opt_in, false),
                             'sharePrices', coalesce(s.share_prices, false),
                             'maxStockAgeDays', s.max_stock_age_days,
                             'indexedProducts', (select count(*)::int from public.marketplace_product_index i
                                                  where i.company_id = c.id),
                             'ordersSold', (select count(*)::int from public.marketplace_order_requests o
                                             where o.supplier_company_id = c.id and o.placed_at >= v_start),
                             'ordersBought', (select count(*)::int from public.marketplace_order_requests o
                                               where o.buyer_company_id = c.id and o.placed_at >= v_start),
                             'optedInAt', s.opted_in_at) order by c.name)
                          from public.companies c
                          left join public.company_marketplace_settings s on s.company_id = c.id), '[]'::jsonb),
    'recentOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'productName', r.product_name, 'quantity', r.quantity, 'unit', r.unit,
               'status', r.status, 'matchBasis', r.match_basis, 'matchConfidence', r.match_confidence,
               'buyerName', r.buyer_name, 'supplierName', r.supplier_name,
               'stockAgeDays', r.stock_age_days, 'placedAt', r.placed_at))
      from (
        select o.id, o.product_name, o.quantity, o.unit, o.status, o.match_basis,
               o.match_confidence, b.name as buyer_name, s.name as supplier_name,
               extract(day from (o.placed_at - o.stock_counted_at))::int as stock_age_days,
               o.placed_at
        from public.marketplace_order_requests o
        join public.companies b on b.id = o.buyer_company_id
        join public.companies s on s.id = o.supplier_company_id
        where o.placed_at >= v_start
        order by o.placed_at desc
        limit 50
      ) r), '[]'::jsonb)
  );
end $$;

create or replace function public.platform_admin_set_marketplace_optin(
  p_company_id          uuid,
  p_opt_in              boolean,
  p_share_prices        boolean,
  p_max_stock_age_days  integer,
  p_reason              text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_role public.platform_admin_role; v_before jsonb; v_after jsonb;
begin
  v_role := private.require_platform_admin('write_company');
  if p_opt_in is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'opt_in and reason are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object('optIn', opt_in, 'sharePrices', share_prices,
                            'maxStockAgeDays', max_stock_age_days)
    into v_before
  from public.company_marketplace_settings where company_id = p_company_id;
  v_before := coalesce(v_before, jsonb_build_object('optIn', false, 'sharePrices', false,
                                                    'maxStockAgeDays', 14));

  insert into public.company_marketplace_settings
    (company_id, opt_in, share_prices, max_stock_age_days, opted_in_at, updated_by, updated_at)
  values (p_company_id, p_opt_in, coalesce(p_share_prices, false),
          coalesce(p_max_stock_age_days, 14),
          case when p_opt_in then now() end, auth.uid(), now())
  on conflict (company_id) do update set
    opt_in             = excluded.opt_in,
    share_prices       = excluded.share_prices,
    max_stock_age_days = excluded.max_stock_age_days,
    opted_in_at        = case when excluded.opt_in and not public.company_marketplace_settings.opt_in
                              then now() else public.company_marketplace_settings.opted_in_at end,
    updated_by         = excluded.updated_by,
    updated_at         = excluded.updated_at;

  -- Opting in indexes the shop; opting out removes it from discovery at once.
  if p_opt_in then
    perform public.marketplace_reindex_company(p_company_id);
  else
    delete from public.marketplace_product_index where company_id = p_company_id;
  end if;

  v_after := jsonb_build_object('optIn', p_opt_in, 'sharePrices', coalesce(p_share_prices, false),
                                'maxStockAgeDays', coalesce(p_max_stock_age_days, 14));
  perform private.platform_admin_audit(v_role, 'set_marketplace_optin', 'company',
                                       p_company_id, p_reason, v_before, v_after);
  return v_after;
end $$;

-- ============================================================================
-- PART K  Grants
-- ============================================================================
-- anon is revoked from everything. A null auth.uid() inside these functions
-- therefore means service_role, which is what marketplace_require_actor relies
-- on to let the WhatsApp worker name the acting member.

do $$
declare f text;
begin
  foreach f in array array[
    'public.marketplace_search_stock(uuid, text, integer)',
    'public.marketplace_create_selection(uuid, text, uuid, integer)',
    'public.marketplace_place_order(uuid, integer, numeric, uuid)',
    'public.marketplace_order_contacts(uuid, uuid)',
    'public.marketplace_incoming_orders(uuid, text)',
    'public.marketplace_my_orders(uuid, text)',
    'public.marketplace_update_order_status(uuid, text, text, uuid)',
    'public.marketplace_pending_confirmation(uuid)',
    'public.marketplace_confirm_by_reply(uuid, boolean, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  -- Reindexing and the outbound queue are worker maintenance, never a user
  -- action: a shop owner must not be able to claim or re-address another
  -- shop's pending WhatsApp messages.
  foreach f in array array[
    'public.marketplace_reindex_company(uuid)',
    'public.marketplace_reindex_all()',
    'public.marketplace_claim_outbound()',
    'public.marketplace_mark_outbound(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  foreach f in array array[
    'public.platform_admin_marketplace(integer)',
    'public.platform_admin_set_marketplace_optin(uuid, boolean, boolean, integer, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================================
-- Housekeeping
-- ============================================================================
-- marketplace_product_index goes stale as shops add products and archive
-- others. Schedule a rebuild; hourly is ample for a stock count that is taken
-- at most daily.
--
--   select cron.schedule('marketplace-reindex', '7 * * * *',
--                        $cron$select public.marketplace_reindex_all()$cron$);
--
-- Expired pick-lists are worth pruning:
--
--   delete from public.marketplace_pending_selections
--    where created_at < now() - interval '7 days';

-- ============================================================================
-- marketplace_shop_order_bridge.sql
-- ============================================================================
-- Mirrors a marketplace order into the legacy `shop_orders` table so it also
-- appears in the screens that already read shop_orders (including the admin
-- console's Shop orders page).
--
-- Apply AFTER marketplace_restock.sql. This file replaces the stub
-- private.marketplace_link_shop_order().
--
-- The admin-console repository can see these shop_orders columns, because the
-- platform_admin_shop_orders RPC reads them:
--
--   id, order_no, status, buyer_company_id, supplier_company_id,
--   total_wholesale, currency,
--   placed_at, accepted_at, delivered_at, verified_at, rejected_at, cancelled_at
--
-- It cannot see any others. The guard below refuses to install if shop_orders
-- has a NOT NULL column without a default that this function does not supply,
-- and names the columns, so a wrong assumption fails at install time rather
-- than at the first order.
-- ============================================================================

-- ── Guard: will the insert below actually satisfy the table? ───────────────
do $guard$
declare
  -- 'id' is deliberately absent: the insert does not supply it, so if the
  -- column turns out to be NOT NULL without a default the guard should say so
  -- rather than let the first order fail.
  v_supplied text[] := array[
    'order_no', 'status', 'buyer_company_id', 'supplier_company_id',
    'total_wholesale', 'currency', 'placed_at'
  ];
  v_missing text;
begin
  if to_regclass('public.shop_orders') is null then
    raise exception 'shop_orders does not exist. Skip this file; marketplace_order_requests is sufficient.';
  end if;

  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
    into v_missing
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = to_regclass('public.shop_orders')
    and a.attnum > 0
    and not a.attisdropped
    and a.attnotnull
    and d.adbin is null
    and not (a.attname = any(v_supplied));

  if v_missing is not null then
    raise exception using
      errcode = 'P0001',
      message = 'shop_orders requires columns this bridge does not supply: ' || v_missing,
      hint    = 'Add them to the insert in private.marketplace_link_shop_order, then re-run this file.';
  end if;
end $guard$;

-- ── Does order_no need to be generated, and as what type? ──────────────────
-- Generated only when the column is NOT NULL and has no default. Text gets
-- 'MK-000123'; an integer or bigint gets the bare number.
create or replace function private.marketplace_next_order_no()
returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_has_default boolean;
  v_type text;
  v_next bigint;
begin
  select (d.adbin is not null), format_type(a.atttypid, null)
    into v_has_default, v_type
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = to_regclass('public.shop_orders') and a.attname = 'order_no';

  if v_has_default then
    return null;  -- let the table's own default or sequence do it
  end if;

  -- Serialize against concurrent placement so two orders cannot take the same
  -- number. Advisory lock, not a table lock: it costs nothing between orders.
  perform pg_advisory_xact_lock(hashtext('risip_marketplace_order_no'));

  if v_type in ('integer', 'bigint', 'smallint', 'numeric') then
    select coalesce(max(order_no::bigint), 0) + 1 into v_next from public.shop_orders;
    return v_next::text;
  end if;

  select coalesce(max(nullif(regexp_replace(order_no, '\D', '', 'g'), '')::bigint), 0) + 1
    into v_next from public.shop_orders;
  return 'MK-' || lpad(v_next::text, 6, '0');
end $$;

-- ── The bridge ────────────────────────────────────────────────────────────
create or replace function private.marketplace_link_shop_order(
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  o public.marketplace_order_requests;
  v_order_no text;
  v_total numeric;
  v_id uuid;
begin
  select * into o from public.marketplace_order_requests where id = p_request_id;
  if o.id is null then
    raise exception 'marketplace order not found' using errcode = 'P0002';
  end if;

  -- unit_price is null whenever the supplier shares stock but not prices, so
  -- the mirrored order carries a zero total rather than a wrong one. The real
  -- figure is agreed between the two shops on the contact exchange.
  v_total := round(coalesce(o.unit_price, 0) * o.quantity, 2);
  v_order_no := private.marketplace_next_order_no();

  if v_order_no is null then
    insert into public.shop_orders
      (buyer_company_id, supplier_company_id, status, total_wholesale, currency, placed_at)
    values (o.buyer_company_id, o.supplier_company_id, 'placed', v_total,
            coalesce(o.currency, 'TZS'), o.placed_at)
    returning id into v_id;
  else
    insert into public.shop_orders
      (order_no, buyer_company_id, supplier_company_id, status, total_wholesale, currency, placed_at)
    values (v_order_no, o.buyer_company_id, o.supplier_company_id, 'placed', v_total,
            coalesce(o.currency, 'TZS'), o.placed_at)
    returning id into v_id;
  end if;

  return v_id;
end $$;

revoke all on function private.marketplace_next_order_no() from public, anon, authenticated;
revoke all on function private.marketplace_link_shop_order(uuid) from public, anon, authenticated;

-- ── Keep the mirror in step with the marketplace order ────────────────────
-- Status changes flow one way: marketplace_order_requests is the source of
-- truth, shop_orders is the mirror the older screens read.
create or replace function private.marketplace_sync_shop_order()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if new.shop_order_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  update public.shop_orders
     set status       = new.status,
         accepted_at  = case when new.status = 'accepted'  then now() else accepted_at  end,
         rejected_at  = case when new.status = 'rejected'  then now() else rejected_at  end,
         delivered_at = case when new.status = 'delivered' then now() else delivered_at end,
         cancelled_at = case when new.status = 'cancelled' then now() else cancelled_at end
   where id = new.shop_order_id;
  return new;
end $$;

drop trigger if exists marketplace_sync_shop_order_trg on public.marketplace_order_requests;
create trigger marketplace_sync_shop_order_trg
  after update of status on public.marketplace_order_requests
  for each row execute function private.marketplace_sync_shop_order();

-- ── Backfill any orders placed while the stub was in place ────────────────
do $backfill$
declare r record; v_id uuid;
begin
  for r in select id from public.marketplace_order_requests
            where shop_order_id is null and status = 'placed'
            order by placed_at
  loop
    v_id := private.marketplace_link_shop_order(r.id);
    update public.marketplace_order_requests set shop_order_id = v_id where id = r.id;
  end loop;
end $backfill$;

-- ============================================================================
-- marketplace_notifications.sql
-- ============================================================================
-- Moves marketplace WhatsApp sends off their own queue and onto RISIP's
-- existing whatsapp_notification_deliveries.
--
-- Why: marketplace_outbound_messages (added in marketplace_restock.sql) was a
-- second delivery path. The codebase already argues against that in
-- _shared/whatsappNotifications.ts: "a second delivery path for money would be
-- a second delivery path to keep correct." It was built without sight of the
-- edge functions; this file corrects it. One table, one completion RPC, one
-- retry policy, one place the proactive opt-out is honoured.
--
-- Apply AFTER marketplace_restock.sql.
--
-- What this does NOT do, and cannot:
--   * Send anything. Every marketplace notification is business-initiated
--     (proactive), so Meta requires an APPROVED TEMPLATE. The account has
--     risip_bili, risip_daily_summary, risip_debt_reminder, risip_login_link
--     and risip_start_onboarding; none fits an order. Rows queue correctly and
--     wait.
--   * Teach the sender the new template. notificationTemplateParameters() in
--     the RISIP repo's _shared/whatsappNotifications.ts maps parameters to
--     ordered template values and must learn the new template there.
--
-- The existing claim_whatsapp_notification_deliveries is deliberately NOT
-- modified. It drives daily summaries, debt reminders and billing; rewriting
-- ~150 lines of live money-path SQL to insert one block is risk with no
-- payoff, since the sender needs a code change regardless.
-- ============================================================================

-- ── 1. Let the shared table carry marketplace rows ────────────────────────
-- Widening a CHECK only permits more; it cannot invalidate an existing row.

alter table public.whatsapp_notification_deliveries
  drop constraint if exists whatsapp_notification_deliveries_notification_kind_check;
alter table public.whatsapp_notification_deliveries
  add constraint whatsapp_notification_deliveries_notification_kind_check
  check (notification_kind = any (array[
    'daily_summary', 'debt_reminder', 'close_reminder',
    'billing_due', 'billing_overdue', 'billing_suspended',
    -- Marketplace. 'marketplace_' prefix keeps them out of the billing_
    -- branch in isPlainTextNotification().
    'marketplace_order_new', 'marketplace_order_accepted',
    'marketplace_order_rejected', 'marketplace_order_delivered',
    'marketplace_order_cancelled'
  ]));

-- The existing model is generate-and-send: rows are born 'sending'. Marketplace
-- rows are born from a shop owner's action instead, so they need a state that
-- means "waiting for the next drain".
alter table public.whatsapp_notification_deliveries
  drop constraint if exists whatsapp_notification_deliveries_status_check;
alter table public.whatsapp_notification_deliveries
  add constraint whatsapp_notification_deliveries_status_check
  check (status = any (array['queued', 'sending', 'sent', 'failed', 'unknown', 'skipped']));

-- attempt_count is CHECKed between 1 and 3, so a queued row starts at 1 and
-- has two retries left, matching every other kind.

-- ── 2. Enqueue into the shared table ──────────────────────────────────────
create or replace function private.marketplace_enqueue(
  p_order_id uuid,
  p_to_company_id uuid,
  p_kind text,
  p_payload jsonb
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_identity uuid; v_phone text; v_lang text; v_id uuid; v_kind text;
begin
  -- Map the marketplace event onto a notification_kind.
  v_kind := case p_kind
    when 'order_new_supplier'  then 'marketplace_order_new'
    when 'order_accepted'      then 'marketplace_order_accepted'
    when 'order_rejected'      then 'marketplace_order_rejected'
    when 'order_delivered'     then 'marketplace_order_delivered'
    when 'order_cancelled'     then 'marketplace_order_cancelled'
    -- The buyer's own confirmation is a reply inside the 24h service window
    -- and is sent synchronously by the webhook, not queued here.
    when 'order_placed_buyer'  then null
    else null
  end;
  if v_kind is null then return null; end if;

  -- A shop with no reachable, opted-in identity is simply not messaged. The
  -- order still exists and is visible in-app; proactive consent is not
  -- something this feature may assume.
  select i.id, i.phone_e164,
         case when coalesce(i.lang, p.lang, 'en') = 'sw' then 'sw' else 'en' end
    into v_identity, v_phone, v_lang
  from public.whatsapp_identities i
  join public.profiles p on p.id = i.profile_id and p.deactivated_at is null
  where i.company_id = p_to_company_id
    and i.verified_at is not null
    and i.revoked_at is null
    and i.opted_out_at is null
    and i.proactive_notifications_opted_out_at is null
  order by i.verified_at desc
  limit 1;

  if v_identity is null then return null; end if;

  insert into public.whatsapp_notification_deliveries
    (identity_id, company_id, notification_kind, business_date, subject_key,
     phone_e164_snapshot, language_snapshot, template_name, parameters,
     status, attempt_count, next_attempt_at)
  values (
    v_identity, p_to_company_id, v_kind, current_date, p_order_id::text,
    v_phone, v_lang,
    -- Two templates, not five: the supplier's "a shop wants to buy from you"
    -- and a status update. One template cannot carry five different bodies,
    -- and each extra template is another Meta approval to wait on.
    case when v_kind = 'marketplace_order_new'
         then 'risip_marketplace_order_new'
         else 'risip_marketplace_order_update' end,
    p_payload || jsonb_build_object('order_id', p_order_id, 'event', p_kind),
    'queued', 1, now())
  -- One notification per order per kind; a retried status change is not a
  -- second message.
  on conflict (identity_id, notification_kind, business_date, subject_key)
    do nothing
  returning id into v_id;

  return v_id;
end $$;

-- ── 3. Claim marketplace rows ─────────────────────────────────────────────
-- Separate from claim_whatsapp_notification_deliveries on purpose: that
-- function is the money path. This one only ever touches marketplace_ kinds.
create or replace function public.claim_marketplace_notifications(
  p_limit integer default 20
) returns table (
  delivery_id uuid, phone_e164 text, lang text,
  notification_kind text, template_name text, parameters jsonb
)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Delivery limit must be between 1 and 200';
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_marketplace_notifications'));

  return query
  with claimed as (
    update public.whatsapp_notification_deliveries d
       set status = 'sending',
           attempt_count = case when d.status = 'failed'
                                then d.attempt_count + 1 else d.attempt_count end,
           next_attempt_at = null,
           updated_at = now()
     where d.id in (
       select f.id from public.whatsapp_notification_deliveries f
        where f.notification_kind like 'marketplace\_%'
          and (f.status = 'queued'
               or (f.status = 'failed' and f.attempt_count < 3
                   and f.next_attempt_at <= now()))
        order by f.created_at
        limit p_limit
        for update skip locked)
    returning d.*)
  select c.id, c.phone_e164_snapshot, c.language_snapshot,
         c.notification_kind, c.template_name, c.parameters
  from claimed c;
end $$;

revoke all on function public.claim_marketplace_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_marketplace_notifications(integer) to service_role;

-- Completion reuses the existing complete_whatsapp_notification_delivery.
-- There is no marketplace variant, and there should not be one.

-- ── 4. Retire the duplicate queue ─────────────────────────────────────────
drop function if exists public.marketplace_claim_outbound();
drop function if exists public.marketplace_mark_outbound(uuid, text, text);
drop table if exists public.marketplace_outbound_messages;

-- ── 5. Admin console counts move to the shared table ──────────────────────
create or replace function public.platform_admin_marketplace(p_days integer default 30)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 30), 730));
  v_start timestamptz := now() - make_interval(days => v_days);
begin
  perform private.require_platform_admin('read');
  return jsonb_build_object(
    'days', v_days,
    'metrics', jsonb_build_object(
      'optedInCompanies', (select count(*)::int from public.company_marketplace_settings where opt_in),
      'totalCompanies',   (select count(*)::int from public.companies),
      'indexedProducts',  (select count(*)::int from public.marketplace_product_index),
      'searches',         (select count(*)::int from public.marketplace_pending_selections where created_at >= v_start),
      'searchesNoResult', (select count(*)::int from public.marketplace_pending_selections
                            where created_at >= v_start and jsonb_array_length(options->'options') = 0),
      'ordersPlaced',     (select count(*)::int from public.marketplace_order_requests where placed_at >= v_start),
      'ordersAccepted',   (select count(*)::int from public.marketplace_order_requests where accepted_at >= v_start),
      'ordersRejected',   (select count(*)::int from public.marketplace_order_requests where rejected_at >= v_start),
      'ordersDelivered',  (select count(*)::int from public.marketplace_order_requests where delivered_at >= v_start),
      'fuzzyOrders',      (select count(*)::int from public.marketplace_order_requests
                            where placed_at >= v_start and match_basis = 'fuzzy_name'),
      'unlinkedOrders',   (select count(*)::int from public.marketplace_order_requests
                            where placed_at >= v_start and shop_order_id is null),
      -- Queued but unsent is the number that matters until the Meta template
      -- is approved: every marketplace notification is proactive and blocked
      -- on it. A climbing figure is the template, not a bug.
      'notifyQueued',     (select count(*)::int from public.whatsapp_notification_deliveries
                            where notification_kind like 'marketplace\_%' and status = 'queued'),
      'notifySent',       (select count(*)::int from public.whatsapp_notification_deliveries
                            where notification_kind like 'marketplace\_%' and status = 'sent'
                              and created_at >= v_start),
      'notifyFailed',     (select count(*)::int from public.whatsapp_notification_deliveries
                            where notification_kind like 'marketplace\_%' and status in ('failed','unknown')
                              and created_at >= v_start)
    ),
    'matchBasis', coalesce((select jsonb_agg(jsonb_build_object('basis', x.match_basis, 'count', x.count)
                                             order by x.count desc)
                            from (select match_basis, count(*) as count
                                  from public.marketplace_order_requests
                                  where placed_at >= v_start group by match_basis) x), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
                             'companyId', c.id, 'companyName', c.name,
                             'optIn', coalesce(s.opt_in, false),
                             'sharePrices', coalesce(s.share_prices, false),
                             'maxStockAgeDays', s.max_stock_age_days,
                             'indexedProducts', (select count(*)::int from public.marketplace_product_index i
                                                  where i.company_id = c.id),
                             'ordersSold', (select count(*)::int from public.marketplace_order_requests o
                                             where o.supplier_company_id = c.id and o.placed_at >= v_start),
                             'ordersBought', (select count(*)::int from public.marketplace_order_requests o
                                               where o.buyer_company_id = c.id and o.placed_at >= v_start),
                             'optedInAt', s.opted_in_at) order by c.name)
                          from public.companies c
                          left join public.company_marketplace_settings s on s.company_id = c.id), '[]'::jsonb),
    'recentOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'productName', r.product_name, 'quantity', r.quantity, 'unit', r.unit,
               'status', r.status, 'matchBasis', r.match_basis, 'matchConfidence', r.match_confidence,
               'buyerName', r.buyer_name, 'supplierName', r.supplier_name,
               'stockAgeDays', r.stock_age_days, 'placedAt', r.placed_at))
      from (
        select o.id, o.product_name, o.quantity, o.unit, o.status, o.match_basis,
               o.match_confidence, b.name as buyer_name, s.name as supplier_name,
               extract(day from (o.placed_at - o.stock_counted_at))::int as stock_age_days,
               o.placed_at
        from public.marketplace_order_requests o
        join public.companies b on b.id = o.buyer_company_id
        join public.companies s on s.id = o.supplier_company_id
        where o.placed_at >= v_start
        order by o.placed_at desc
        limit 50
      ) r), '[]'::jsonb)
  );
end $$;

revoke all on function public.platform_admin_marketplace(integer) from public, anon;
grant execute on function public.platform_admin_marketplace(integer) to authenticated;
grant execute on function public.platform_admin_marketplace(integer) to service_role;

-- ============================================================================
-- The open pick-list for a shop
-- ============================================================================
-- The WhatsApp worker must never take a selection id from the model: a
-- model-supplied id would let a crafted message order against another shop's
-- list. The server looks up what it last showed THIS company instead.
create or replace function public.marketplace_last_selection(
  p_buyer_company_id uuid
) returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  select id into v_id
  from public.marketplace_pending_selections
  where buyer_company_id = p_buyer_company_id
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;
  return v_id;
end $$;

revoke all on function public.marketplace_last_selection(uuid) from public, anon;
grant execute on function public.marketplace_last_selection(uuid) to authenticated;
grant execute on function public.marketplace_last_selection(uuid) to service_role;
