-- ============================================================================
-- Fix: index what a shop actually holds, not only what has unit rows
-- ============================================================================
-- marketplace_reindex_company built the searchable index from product_units.
-- That table defines UNITS OF MEASURE for a product; it is not the catalogue.
--
-- MEASURED on St. Ritha bookshop: 4 product_units rows, all four of them units
-- of the same product (mafuta), so exactly one product was indexed. The shop
-- meanwhile had stock counts for stapler, whiteboard marker, vest, Velvet
-- napkin, Super bass earphone and a dozen more — every one of them named,
-- counted, and completely invisible to the marketplace.
--
-- A shop that has counted a product HOLDS that product. stock_counts carries
-- product_name, so there is a name to match on, and it is the most honest
-- signal of what is really on the shelf. product_costs and
-- product_selling_prices are included for the same reason: a shop that priced
-- something is selling it.
--
-- Name preference, best first: the unit row, then the selling price, then the
-- cost, then the most recent stock count. The unit row wins because it is the
-- one a person deliberately set up.

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
         n.product_key,
         n.product_name,
         private.marketplace_normalize(n.product_name),
         coalesce((select array_agg(distinct b.barcode)
                   from public.product_barcodes b
                   where b.company_id = p_company_id
                     and b.product_key = n.product_key), '{}')
  from (
    -- One row per product_key, carrying the best name available for it.
    select k.product_key,
           (array_agg(k.product_name order by k.rank, k.seen_at desc nulls last)
            filter (where k.product_name is not null))[1] as product_name
    from (
      select u.product_key, u.product_name, 1 as rank, null::timestamptz as seen_at
        from public.product_units u
       where u.company_id = p_company_id
      union all
      select sp.product_key, sp.product_name, 2, sp.effective_from
        from public.product_selling_prices sp
       where sp.company_id = p_company_id
      union all
      select c.product_key, c.product_name, 3, c.effective_from
        from public.product_costs c
       where c.company_id = p_company_id
      union all
      -- The shelf itself. Most of a small shop's catalogue only ever appears
      -- here, because counting is the one step nobody skips.
      select sc.product_key, sc.product_name, 4, sc.counted_at
        from public.stock_counts sc
       where sc.company_id = p_company_id
    ) k
    group by k.product_key
  ) n
  where n.product_name is not null
    and private.marketplace_normalize(n.product_name) is not null
    -- An archived product is not for sale and must not appear in search.
    and not exists (select 1 from public.product_archives pa
                    where pa.company_id = p_company_id
                      and pa.product_key = n.product_key);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.marketplace_reindex_company(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_reindex_company(uuid) to service_role;

-- Rebuild every joined shop against the corrected rule.
select public.marketplace_reindex_all() as products_indexed;
