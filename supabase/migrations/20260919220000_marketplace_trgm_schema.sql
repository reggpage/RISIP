-- ============================================================================
-- Fix: similarity() is in the extensions schema, not public
-- ============================================================================
-- marketplace_search_stock raised
--   42883: function similarity(text, text) does not exist
-- for every search, which surfaced to the trader as "Sijaweza kutafuta maduka
-- kwa sasa".
--
-- pg_trgm IS installed. Supabase puts extensions in the `extensions` schema,
-- and these functions pin `search_path = pg_catalog, public` — correct for a
-- security definer, and it excludes exactly the schema the operator lives in.
--
-- The CREATE INDEX using gin_trgm_ops succeeded because DDL ran with the
-- session's own search_path, which does include extensions. Only the function
-- BODY, with its pinned path, could not resolve the call. That is why this
-- survived a clean install and only failed when a shop actually searched.
--
-- Qualifying the call is preferred over adding `extensions` to the search
-- path: a security definer with a wider path is a bigger surface, and the
-- qualification says plainly where the operator comes from.

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
        else round(extensions.similarity(i.normalized_name, v_norm)::numeric, 3)
      end as match_confidence
    from public.marketplace_product_index i
    join public.company_marketplace_settings s
      on s.company_id = i.company_id and s.opt_in
    join public.companies c on c.id = i.company_id
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
        or extensions.similarity(i.normalized_name, v_norm) >= 0.35
      )
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

revoke all on function public.marketplace_search_stock(uuid, text, integer) from public, anon;
grant execute on function public.marketplace_search_stock(uuid, text, integer) to authenticated;
grant execute on function public.marketplace_search_stock(uuid, text, integer) to service_role;
