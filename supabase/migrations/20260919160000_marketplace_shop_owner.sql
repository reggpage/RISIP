-- ============================================================================
-- Marketplace: the shop owner's own controls
-- ============================================================================
-- Joining the restock marketplace was platform-operator-only
-- (platform_admin_set_marketplace_optin). That is the wrong owner for the
-- decision: publishing your stock to other shops is the trader's choice about
-- their own business, not an operations task.
--
-- These are the tenant-facing equivalents. The company is derived from the
-- caller, never passed in, and only an owner may change it: an accountant or
-- a worker can see the setting but must not hand another shop the catalogue.

-- Which company the caller is acting for, and whether they may change its
-- settings. active_company_id is authoritative because a trader may belong to
-- more than one business; company_id is the fallback for older rows.
create or replace function private.marketplace_my_company(p_require_owner boolean default false)
returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_role public.user_role;
begin
  select coalesce(p.active_company_id, p.company_id), p.role
    into v_company, v_role
  from public.profiles p
  where p.id = auth.uid() and p.deactivated_at is null;

  if v_company is null then
    raise exception 'no active business for this account'
      using errcode = 'P0002', hint = 'no_active_company';
  end if;

  -- Membership is re-checked rather than trusted from the profile: a
  -- deactivated member keeps their profile row.
  if not exists (select 1 from public.company_members m
                 where m.company_id = v_company and m.profile_id = auth.uid()
                   and m.deactivated_at is null) then
    raise exception 'not an active member of this business'
      using errcode = 'P0001', hint = 'not_company_member';
  end if;

  if p_require_owner and v_role <> 'owner' then
    raise exception 'only the business owner can change this'
      using errcode = 'P0001', hint = 'owner_only';
  end if;

  return v_company;
end $$;

-- ── Read: am I in, and what is shared ─────────────────────────────────────
create or replace function public.marketplace_my_settings()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; s public.company_marketplace_settings;
begin
  v_company := private.marketplace_my_company(false);
  select * into s from public.company_marketplace_settings where company_id = v_company;

  return jsonb_build_object(
    'companyId', v_company,
    'optIn', coalesce(s.opt_in, false),
    'sharePrices', coalesce(s.share_prices, false),
    'maxStockAgeDays', coalesce(s.max_stock_age_days, 14),
    'optedInAt', s.opted_in_at,
    'indexedProducts', (select count(*)::int from public.marketplace_product_index i
                         where i.company_id = v_company),
    -- What the shop could offer if it joined: products with a recent count.
    -- Shown before joining so the decision is concrete rather than abstract.
    'countedProducts', (select count(distinct sc.product_key)::int
                        from public.stock_counts sc
                        where sc.company_id = v_company
                          and sc.counted_at >= now() - interval '14 days'),
    'ordersIncoming', (select count(*)::int from public.marketplace_order_requests o
                        where o.supplier_company_id = v_company and o.status = 'placed'),
    'ordersOutgoing', (select count(*)::int from public.marketplace_order_requests o
                        where o.buyer_company_id = v_company and o.status = 'placed')
  );
end $$;

-- ── Write: join or leave ──────────────────────────────────────────────────
create or replace function public.marketplace_set_my_optin(
  p_opt_in             boolean,
  p_share_prices       boolean default false,
  p_max_stock_age_days integer default 14
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_indexed integer := 0;
begin
  v_company := private.marketplace_my_company(true);

  if p_opt_in is null then
    raise exception 'opt_in is required' using errcode = '22023';
  end if;
  if coalesce(p_max_stock_age_days, 14) not between 1 and 90 then
    raise exception 'stock age must be between 1 and 90 days' using errcode = '22023';
  end if;

  insert into public.company_marketplace_settings
    (company_id, opt_in, share_prices, max_stock_age_days, opted_in_at, updated_by, updated_at)
  values (v_company, p_opt_in, coalesce(p_share_prices, false),
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

  -- Joining indexes the shop immediately; leaving removes it from discovery at
  -- once rather than at the next scheduled reindex. Leaving must be instant:
  -- it is a withdrawal of consent.
  if p_opt_in then
    v_indexed := public.marketplace_reindex_company(v_company);
  else
    delete from public.marketplace_product_index where company_id = v_company;
  end if;

  return jsonb_build_object(
    'companyId', v_company,
    'optIn', p_opt_in,
    'sharePrices', coalesce(p_share_prices, false),
    'maxStockAgeDays', coalesce(p_max_stock_age_days, 14),
    'indexedProducts', v_indexed
  );
end $$;

-- ── Orders, for the company the caller is acting for ──────────────────────
-- Thin wrappers so the app never has to pass a company id it could get wrong.
create or replace function public.marketplace_my_incoming_orders(p_status text default null)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  return public.marketplace_incoming_orders(private.marketplace_my_company(false), p_status);
end $$;

create or replace function public.marketplace_my_outgoing_orders(p_status text default null)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  return public.marketplace_my_orders(private.marketplace_my_company(false), p_status);
end $$;

-- Accept, decline or mark delivered from the app, with the same rules the
-- WhatsApp reply path uses: only the supplier may accept, only the buyer may
-- cancel. Enforced inside marketplace_update_order_status.
create or replace function public.marketplace_answer_order(
  p_order_id uuid,
  p_status   text,
  p_reason   text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid;
begin
  v_company := private.marketplace_my_company(false);
  if p_status not in ('accepted', 'rejected', 'delivered', 'cancelled') then
    raise exception 'unknown order status' using errcode = '22023';
  end if;
  return public.marketplace_update_order_status(p_order_id, p_status, p_reason, v_company);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.marketplace_my_settings()',
    'public.marketplace_set_my_optin(boolean, boolean, integer)',
    'public.marketplace_my_incoming_orders(text)',
    'public.marketplace_my_outgoing_orders(text)',
    'public.marketplace_answer_order(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================================
-- The open pick-list, with its rows
-- ============================================================================
-- propose_restock_order must show the trader exactly what they are about to
-- commit to — which shop, which product, how much — before anything is
-- written. That draft needs the rows, not just the selection id.
create or replace function public.marketplace_open_selection(
  p_buyer_company_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare s public.marketplace_pending_selections;
begin
  perform private.marketplace_require_actor(p_buyer_company_id);
  select * into s from public.marketplace_pending_selections
  where buyer_company_id = p_buyer_company_id
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;
  if s.id is null then return null; end if;
  return jsonb_build_object(
    'selectionId', s.id,
    'query', s.query_text,
    'options', coalesce(s.options->'options', '[]'::jsonb)
  );
end $$;

revoke all on function public.marketplace_open_selection(uuid) from public, anon;
grant execute on function public.marketplace_open_selection(uuid) to authenticated;
grant execute on function public.marketplace_open_selection(uuid) to service_role;
