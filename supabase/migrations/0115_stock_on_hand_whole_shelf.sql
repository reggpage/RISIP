-- The shelf was being cut off at thirty products, silently.
--
-- MEASURED FAILURE, the owner's own WhatsApp thread:
--
--   "punch ziko ngapi?"  → "punch: zimebaki 0."      ← counted, at zero
--   "nini kimeisha?"     → "Birika, daftari, Dumu la maji"
--                          ← punch is not in the list
--
-- Asked about ONE product, wa_stock_on_hand answered correctly. Asked for the
-- whole shelf, it returned thirty rows and stopped, so anything past the
-- thirtieth name alphabetically did not exist as far as "what has run out?" was
-- concerned. This shop has fifty-nine products. Sodaa was missing for the same
-- reason, and the "31 bado hazijahesabiwa" footnote was wrong too: it counted
-- products that HAVE been counted but fell off the end of the list.
--
-- A shopkeeper cannot see what is missing from an answer. They have to already
-- suspect a product is out and ask for it by name — which is exactly what
-- happened, and exactly the work Risip is supposed to be doing for them.
--
-- The limit is raised, not removed, so a runaway catalogue cannot return an
-- unbounded set. Five hundred is far above any single shop's catalogue and far
-- below anything that would hurt. The REPLY still has its own budget — see
-- stockListReply in whatsappStock.ts, which trims to fit a WhatsApp message and
-- says plainly how many of how many it is showing. That is the right place for
-- presentation to be trimmed: there, it is visible; here, it was not.

create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null::text)
returns table(
  product_name text, unit text, measured boolean, on_hand numeric, has_count boolean,
  counted_at timestamptz, bought_since numeric, sold_since numeric, incomplete_purchases boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
  limit 500;
$function$;

grant execute on function public.wa_stock_on_hand(uuid, text) to service_role;
