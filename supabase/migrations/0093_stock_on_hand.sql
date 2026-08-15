-- How many are left, which somebody asked on the live number:
--   "Bibilia ndogo ninazo ngapi?"  ->  "siwezi kuangalia idadi ya bidhaa"
--
-- The refusal was honest and correct: there was nothing to count with. A stock
-- purchase recorded only a total, so goods came in as money and left as
-- quantities, and the two could never be subtracted. 0093's parser change fixes
-- the incoming half; this fixes the arithmetic.
--
-- A COUNT IS THE ANCHOR, NOT A GUESS. Nobody knows what was on the shelf the day
-- Risip started, and inventing an opening balance would produce a confident
-- number that is wrong forever. So:
--
--   on hand = last physical count + bought since that count - sold since it
--
-- With no count on record the figure is still shown, but from the first record
-- Risip ever saw, and it is labelled as such. `has_count` says which of the two
-- the caller is looking at, so a report can never present the second as the
-- first.
--
-- COUNTING AGAIN IS THE CORRECTION. Stock is lost, broken, taken and miscounted;
-- every real shop reconciles by counting, not by adjusting entries. A new count
-- supersedes the old one and the arithmetic restarts from it. Counts are
-- append-only, so the history of what was counted when survives.
--
-- CONFIRMED ONLY, on both sides, exactly as every other total here.
--
-- WHAT IT STILL WILL NOT DO. It reports on hand only for products whose
-- purchases carry quantities. A purchase recorded as a bare total contributes
-- money to the books and nothing to the count, and coverage says so rather than
-- letting a shortfall look like theft.
--
-- ROLLBACK
--   drop function public.company_stock_on_hand();
--   drop function public.record_stock_count(text, numeric, text, text);
--   drop table public.stock_counts;

create table if not exists public.stock_counts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_key text not null,
  product_name text not null,
  quantity    numeric(14,3) not null check (quantity >= 0),
  unit        text,
  counted_at  timestamptz not null default clock_timestamp(),
  counted_by  uuid not null references public.profiles(id) on delete restrict,
  note        text,
  created_at  timestamptz not null default clock_timestamp()
);

create index if not exists stock_counts_lookup
  on public.stock_counts (company_id, product_key, counted_at desc, created_at desc);

alter table public.stock_counts enable row level security;
revoke all on table public.stock_counts from public, anon, authenticated;

drop policy if exists stock_counts_select on public.stock_counts;
create policy stock_counts_select on public.stock_counts
  for select to authenticated
  using (company_id = private.auth_company_id());
grant select on public.stock_counts to authenticated;

/** Records a physical count. Never an adjustment — a count states what is there. */
create or replace function public.record_stock_count(
  p_name text,
  p_quantity numeric,
  p_unit text default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := private.product_key(p_name);
  v_id uuid;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may record a stock count'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode = 'P0001', hint = 'no_product';
  end if;
  -- Zero is a real count: the shelf is empty. Negative is not.
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode = 'P0001', hint = 'invalid_quantity';
  end if;

  insert into stock_counts (company_id, product_key, product_name, quantity, unit, counted_by, note)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 3),
          nullif(btrim(p_unit), ''), v_actor, nullif(btrim(p_note), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name), 'quantity', round(p_quantity, 3));
end $$;

revoke execute on function public.record_stock_count(text, numeric, text, text) from public, anon;
grant execute on function public.record_stock_count(text, numeric, text, text) to authenticated;

create or replace function public.company_stock_on_hand()
returns table (
  product_key     text,
  product_name    text,
  unit            text,
  measured        boolean,
  /** The last physical count, and when it was taken. Null when never counted. */
  counted_qty     numeric,
  counted_at      timestamptz,
  has_count       boolean,
  bought_since    numeric,
  sold_since      numeric,
  on_hand         numeric,
  /**
   * True when at least one purchase of this product was recorded as a bare
   * total, so goods came in that the count could never see. Without this a
   * paperwork gap would read as a missing item.
   */
  incomplete_purchases boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with company as (select private.auth_company_id() as id),
  last_count as (
    select distinct on (product_key)
      product_key, product_name, quantity, unit, counted_at
    from stock_counts
    where company_id = (select id from company)
    order by product_key, counted_at desc, created_at desc
  ),
  -- Every confirmed movement, with its sign and the product it belongs to.
  movement as (
    select
      private.product_key(l.description) as product_key,
      (array_agg(l.description order by r.occurred_at desc))[1] as product_name,
      (array_agg(nullif(btrim(coalesce(l.unit,'')),'') order by r.occurred_at desc)
         filter (where nullif(btrim(coalesce(l.unit,'')),'') is not null))[1] as unit,
      bool_or(l.quantity <> round(l.quantity) or nullif(btrim(coalesce(l.unit,'')),'') is not null) as measured,
      coalesce(sum(l.quantity) filter (
        where r.kind = 'stock_purchase'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as bought_since,
      coalesce(sum(l.quantity) filter (
        where r.kind = 'sale'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind in ('sale', 'stock_purchase')
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  ),
  -- Stock purchases that named no product at all cannot be attributed, so they
  -- are counted once for the whole company and reported as a caveat.
  bare_purchases as (
    select count(*) > 0 as any_bare
    from daily_records r
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind = 'stock_purchase'
      and not exists (select 1 from daily_record_lines l where l.daily_record_id = r.id)
  )
  select
    coalesce(m.product_key, lc.product_key)                  as product_key,
    coalesce(m.product_name, lc.product_name)                as product_name,
    coalesce(lc.unit, m.unit)                                as unit,
    coalesce(m.measured, lc.unit is not null, false)         as measured,
    lc.quantity                                              as counted_qty,
    lc.counted_at,
    (lc.product_key is not null)                             as has_count,
    coalesce(m.bought_since, 0)                              as bought_since,
    coalesce(m.sold_since, 0)                                as sold_since,
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0) - coalesce(m.sold_since, 0) as on_hand,
    (select any_bare from bare_purchases)                    as incomplete_purchases
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where (select id from company) is not null
  order by coalesce(m.product_name, lc.product_name);
$$;

revoke execute on function public.company_stock_on_hand() from public, anon;
grant execute on function public.company_stock_on_hand() to authenticated;
