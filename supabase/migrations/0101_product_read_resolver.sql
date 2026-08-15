-- Product names are exact on every write, but forgiving on reads.
--
-- A typo or an ordinary Swahili noun-class/plural variant must not create or
-- merge ledger rows. It is safe, however, to resolve a read against the current
-- company's catalogue and either answer with the matched canonical name or ask
-- when two candidates are too close.
--
-- Match order:
--   1. exact canonical key
--   2. one trailing vowel added/removed (atlas <-> atlasi)
--   3. common ki/vi, m/mi, ji/ma and bare/ma noun-class variants
--   4. pg_trgm similarity >= 0.45, scoped to company_product_catalog
--
-- This migration does not alter set_product_cost, wa_set_stock_count,
-- wa_set_selling_price or any other write RPC.

create extension if not exists pg_trgm with schema extensions;

-- 0091's catalogue combined sales and costs but not physical stock counts. A
-- product that had only been counted could therefore be read exactly by
-- wa_stock_on_hand yet remain invisible to the resolver. Include the latest
-- count as another name source; quantities and ledger history remain untouched.
create or replace function public.company_product_catalog(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_include_archived boolean default false
)
returns table (
  product_key text,
  product_name text,
  unit text,
  quantity_sold numeric,
  revenue numeric,
  sale_lines integer,
  last_sold_at timestamptz,
  measured boolean,
  unit_cost numeric,
  cost_effective_from timestamptz,
  avg_unit_price numeric,
  estimated_margin numeric,
  archived boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with company as (
    select private.auth_company_id() as id
  ),
  sold as (
    select
      private.product_key(l.description) as product_key,
      l.description,
      l.quantity,
      l.line_total,
      nullif(btrim(coalesce(l.unit, '')), '') as unit,
      r.occurred_at
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
    where r.company_id = (select id from company)
      and r.kind = 'sale'
      and r.status = 'confirmed'
      and (p_from is null or r.occurred_at >= p_from)
      and (p_to is null or r.occurred_at < p_to)
      and private.product_key(l.description) is not null
  ),
  totals as (
    select
      s.product_key,
      sum(s.quantity) as quantity_sold,
      sum(s.line_total) as revenue,
      count(*)::int as sale_lines,
      max(s.occurred_at) as last_sold_at,
      bool_or(s.quantity <> round(s.quantity) or s.unit is not null) as measured,
      (array_agg(s.description order by s.occurred_at desc))[1] as product_name,
      (array_agg(s.unit order by s.occurred_at desc)
        filter (where s.unit is not null))[1] as sold_unit
    from sold s
    group by s.product_key
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      c.unit, c.unit_cost, c.effective_from, c.product_name
    from product_costs c
    where c.company_id = (select id from company)
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  latest_stock as (
    select distinct on (private.product_key(s.product_key))
      private.product_key(s.product_key) as product_key,
      s.product_name, s.unit
    from stock_counts s
    where s.company_id = (select id from company)
      and private.product_key(s.product_key) is not null
    order by private.product_key(s.product_key), s.counted_at desc, s.created_at desc
  ),
  keys as (
    select product_key from totals
    union
    select product_key from latest_cost
    union
    select product_key from latest_stock
  ),
  merged as (
    select
      k.product_key,
      coalesce(t.product_name, ls.product_name, lc.product_name) as product_name,
      coalesce(ls.unit, lc.unit, t.sold_unit) as unit,
      coalesce(t.quantity_sold, 0) as quantity_sold,
      coalesce(t.revenue, 0) as revenue,
      coalesce(t.sale_lines, 0) as sale_lines,
      t.last_sold_at,
      coalesce(t.measured, ls.unit is not null, lc.unit is not null, false) as measured,
      lc.unit_cost,
      lc.effective_from as cost_effective_from,
      case when coalesce(t.quantity_sold, 0) > 0
        then round(t.revenue / t.quantity_sold, 2) end as avg_unit_price,
      case when lc.unit_cost is not null and coalesce(t.quantity_sold, 0) > 0
        then round(t.revenue - (lc.unit_cost * t.quantity_sold), 2) end as estimated_margin
    from keys k
    left join totals t on t.product_key = k.product_key
    left join latest_cost lc on lc.product_key = k.product_key
    left join latest_stock ls on ls.product_key = k.product_key
    where (select id from company) is not null
  )
  select m.*, (a.product_key is not null) as archived
  from merged m
  left join product_archives a
    on a.company_id = (select id from company)
   and private.product_key(a.product_key) = m.product_key
  where p_include_archived or a.product_key is null
  order by coalesce(m.revenue, 0) desc, m.product_name;
$$;

revoke execute on function public.company_product_catalog(timestamptz, timestamptz, boolean)
  from public, anon;
grant execute on function public.company_product_catalog(timestamptz, timestamptz, boolean)
  to authenticated;

create or replace function private.resolve_company_product_read(p_name text)
returns table (
  product_key text,
  product_name text,
  match_kind text,
  match_score numeric,
  ambiguous boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with input as (
    select private.product_key(p_name) as wanted
  ),
  variants as (
    select wanted as variant, 0 as rule_rank, 'exact'::text as match_kind
      from input where wanted is not null
    union
    select left(wanted, length(wanted) - 1), 1, 'trailing_vowel'
      from input where right(wanted, 1) ~ '^[aeiou]$' and length(wanted) > 2
    union
    select wanted || vowel, 1, 'trailing_vowel'
      from input cross join (values ('a'), ('e'), ('i'), ('o'), ('u')) as vowels(vowel)
     where wanted is not null
    union
    select 'vi' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ki%' and length(wanted) > 3
    union
    select 'ki' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'vi%' and length(wanted) > 3
    union
    select 'mi' || substring(wanted from 2), 2, 'noun_class'
      from input where wanted like 'm%' and wanted not like 'mi%' and length(wanted) > 2
    union
    select 'm' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'mi%' and length(wanted) > 3
    union
    select 'ma' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ji%' and length(wanted) > 3
    union
    select 'ji' || substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ma%' and length(wanted) > 3
    union
    select 'ma' || wanted, 2, 'noun_class'
      from input where wanted is not null and wanted not like 'ma%' and length(wanted) > 2
    union
    select substring(wanted from 3), 2, 'noun_class'
      from input where wanted like 'ma%' and length(wanted) > 4
  ),
  catalog as materialized (
    select c.product_key, c.product_name
      from public.company_product_catalog(null, null, false) c
     where c.product_key is not null
  ),
  candidates as (
    select c.product_key, c.product_name, v.match_kind, v.rule_rank,
           case v.rule_rank when 0 then 1.0 when 1 then 0.95 else 0.90 end::numeric as score
      from catalog c
      join variants v on v.variant = c.product_key
    union all
    select c.product_key, c.product_name, 'trigram', 3,
           extensions.similarity(c.product_key, i.wanted)::numeric
      from catalog c cross join input i
     where i.wanted is not null
       and extensions.similarity(c.product_key, i.wanted) >= 0.45
  ),
  one_rule_per_product as (
    select product_key, product_name, match_kind, rule_rank, score
      from (
        select c.*,
               row_number() over (
                 partition by c.product_key
                 order by c.rule_rank, c.score desc, c.product_key
               ) as product_rule
          from candidates c
      ) ranked_rules
     where product_rule = 1
  ),
  ranked as (
    select c.*,
           row_number() over (order by c.rule_rank, c.score desc, c.product_key) as result_rank
      from one_rule_per_product c
  ),
  decision as (
    select coalesce(
      exists (
        select 1
          from ranked first_match
          join ranked second_match on second_match.result_rank = 2
         where first_match.result_rank = 1
           and second_match.rule_rank = first_match.rule_rank
           and (
             first_match.rule_rank < 3
             or first_match.score - second_match.score <= 0.05
           )
      ), false
    ) as is_ambiguous
  )
  select r.product_key, r.product_name, r.match_kind, round(r.score, 4), d.is_ambiguous
    from ranked r cross join decision d
   where r.result_rank <= case when d.is_ambiguous then 3 else 1 end
   order by r.result_rank;
$$;

revoke all on function private.resolve_company_product_read(text)
  from public, anon, authenticated;

create or replace function public.wa_resolve_company_product_read(
  p_profile_id uuid,
  p_company_id uuid,
  p_name text
)
returns table (
  product_key text,
  product_name text,
  match_kind text,
  match_score numeric,
  ambiguous boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid;
  v_key text := private.product_key(p_name);
begin
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id
     and p.deactivated_at is null;

  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_key is null or length(v_key) < 2 or length(v_key) > 100 then
    return;
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return query select * from private.resolve_company_product_read(v_key);
end;
$$;

revoke all on function public.wa_resolve_company_product_read(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.wa_resolve_company_product_read(uuid, uuid, text)
  to service_role;
