-- Tidying the product list without touching the books.
--
-- Production shows the problem exactly: "nguvu ya sala" and "- nguvu ya sala"
-- are two products because of ONE leading dash. 8 sold at 12,000 and 7 sold at
-- 9,000, split across two rows, and the second has no buying price — which is
-- why coverage sits at 96% instead of 100%.
--
-- THERE IS NO DELETE HERE, on purpose and with the owner's agreement.
-- "st rita wa kashia" carries TSh 202,500 of confirmed sales. Deleting it would
-- change August's revenue silently, which is the one thing this codebase refuses
-- to do anywhere. Two operations cover every real reason somebody wants a
-- product gone:
--
--   MERGE   two names are one thing            -> the sales are re-labelled
--   ARCHIVE I do not sell this any more        -> it leaves the list, nothing else
--
-- MERGE MOVES NO MONEY. It rewrites the description on sale lines and nothing
-- else: quantity, unit_amount, line_total and the record amount are all
-- untouched. Revenue before and after is identical to the shilling — only the
-- grouping changes. That is checked in the tests rather than asserted here.
--
-- WHEN IT REFUSES. If BOTH products already have buying prices, merging would
-- have to invent a combined price history, and past COGS would move. It refuses
-- and says so. Nobody's profit changes because they tidied a name.
--
-- ARCHIVE HIDES, IT DOES NOT EXCLUDE. Archived products keep counting in profit
-- and in every report, because their past sales really happened. The flag only
-- controls whether the row appears in the catalogue.
--
-- ROLLBACK
--   drop function public.unarchive_product(text);
--   drop function public.archive_product(text, text);
--   drop function public.merge_products(text, text, text);
--   drop table public.product_events;
--   drop table public.product_archives;

create table if not exists public.product_archives (
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_key text not null,
  archived_at timestamptz not null default clock_timestamp(),
  archived_by uuid not null references public.profiles(id) on delete restrict,
  reason      text,
  primary key (company_id, product_key)
);

alter table public.product_archives enable row level security;
revoke all on table public.product_archives from public, anon, authenticated;

drop policy if exists product_archives_select on public.product_archives;
create policy product_archives_select on public.product_archives
  for select to authenticated
  using (company_id = private.auth_company_id());
grant select on public.product_archives to authenticated;

-- Who tidied what, and when. A merge re-labels real records, so it leaves a
-- trail even though it moves no money.
create table if not exists public.product_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  actor_id     uuid not null references public.profiles(id) on delete restrict,
  action       text not null check (action in ('merge', 'archive', 'unarchive')),
  product_key  text not null,
  target_key   text,
  reason       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default clock_timestamp()
);

create index if not exists product_events_company_idx
  on public.product_events (company_id, created_at desc);

alter table public.product_events enable row level security;
revoke all on table public.product_events from public, anon, authenticated;

drop policy if exists product_events_select on public.product_events;
create policy product_events_select on public.product_events
  for select to authenticated
  using (company_id = private.auth_company_id()
         and private.auth_role() in ('owner', 'accountant'));
grant select on public.product_events to authenticated;

/**
 * Folds one product name into another.
 *
 * A reason is optional. Requiring twenty considered words before somebody may
 * fix a stray dash is the kind of friction that leaves the dash there forever;
 * the event row already records who did it, when, and how many lines moved.
 */
create or replace function public.merge_products(
  p_from_key text,
  p_into_key text,
  p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_from text := lower(btrim(coalesce(p_from_key, '')));
  v_into text := lower(btrim(coalesce(p_into_key, '')));
  v_into_name text;
  v_lines int := 0;
  v_costs_moved int := 0;
  v_from_has_cost boolean;
  v_into_has_cost boolean;
  v_revenue_before numeric;
  v_revenue_after numeric;
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may merge products'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_from = '' or v_into = '' then
    raise exception 'both products are needed' using errcode = 'P0001', hint = 'no_product';
  end if;
  if v_from = v_into then
    raise exception 'that is the same product' using errcode = 'P0001', hint = 'same_product';
  end if;

  -- The spelling to keep: the one most recently used on a sale of the target,
  -- falling back to its buying-price name for a product never sold.
  select l.description into v_into_name
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where r.company_id = v_company
     and lower(btrim(l.description)) = v_into
   order by r.occurred_at desc
   limit 1;
  if v_into_name is null then
    select c.product_name into v_into_name
      from product_costs c
     where c.company_id = v_company and c.product_key = v_into
     order by c.effective_from desc, c.created_at desc
     limit 1;
  end if;
  if v_into_name is null then
    raise exception 'the product to keep was not found'
      using errcode = 'P0001', hint = 'target_not_found';
  end if;

  select exists (select 1 from product_costs where company_id = v_company and product_key = v_from),
         exists (select 1 from product_costs where company_id = v_company and product_key = v_into)
    into v_from_has_cost, v_into_has_cost;

  -- Merging two price histories would move past COGS. Nobody's profit changes
  -- because they tidied a name.
  if v_from_has_cost and v_into_has_cost then
    raise exception 'both products already have buying prices; keep one price before merging'
      using errcode = 'P0001', hint = 'both_have_costs';
  end if;

  -- Revenue is compared before and after so a merge that moved money would fail
  -- loudly here rather than quietly in a report next month.
  select coalesce(sum(l.line_total), 0) into v_revenue_before
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where r.company_id = v_company
     and lower(btrim(l.description)) in (v_from, v_into);

  update daily_record_lines l
     set description = v_into_name
    from daily_records r
   where r.id = l.daily_record_id
     and r.company_id = v_company
     and lower(btrim(l.description)) = v_from;
  get diagnostics v_lines = row_count;

  if v_from_has_cost then
    update product_costs
       set product_key = v_into, product_name = v_into_name
     where company_id = v_company and product_key = v_from;
    get diagnostics v_costs_moved = row_count;
  end if;

  delete from product_cost_prompts where company_id = v_company and product_key = v_from;
  delete from product_archives     where company_id = v_company and product_key = v_from;

  select coalesce(sum(l.line_total), 0) into v_revenue_after
    from daily_record_lines l
    join daily_records r on r.id = l.daily_record_id
   where r.company_id = v_company
     and lower(btrim(l.description)) = v_into;

  if v_revenue_before <> v_revenue_after then
    raise exception 'a merge must not change revenue (% became %)', v_revenue_before, v_revenue_after
      using errcode = 'P0001', hint = 'revenue_moved';
  end if;

  insert into product_events (company_id, actor_id, action, product_key, target_key, reason, metadata)
  values (v_company, v_actor, 'merge', v_from, v_into, nullif(btrim(p_reason), ''),
          jsonb_build_object('lines_moved', v_lines, 'costs_moved', v_costs_moved,
                             'kept_name', v_into_name, 'revenue', v_revenue_after));

  return jsonb_build_object('merged_into', v_into_name, 'lines_moved', v_lines,
                            'costs_moved', v_costs_moved, 'revenue', v_revenue_after);
end $$;

revoke execute on function public.merge_products(text, text, text) from public, anon;
grant execute on function public.merge_products(text, text, text) to authenticated;

/** Takes a product out of the list. Its past sales keep counting everywhere. */
create or replace function public.archive_product(p_key text, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_key, '')));
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may archive a product'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_key = '' then
    raise exception 'which product?' using errcode = 'P0001', hint = 'no_product';
  end if;

  insert into product_archives (company_id, product_key, archived_by, reason)
  values (v_company, v_key, v_actor, nullif(btrim(p_reason), ''))
  on conflict (company_id, product_key)
    do update set archived_at = clock_timestamp(), archived_by = v_actor,
                  reason = nullif(btrim(p_reason), '');

  insert into product_events (company_id, actor_id, action, product_key, reason)
  values (v_company, v_actor, 'archive', v_key, nullif(btrim(p_reason), ''));

  return jsonb_build_object('archived', true, 'product_key', v_key);
end $$;

revoke execute on function public.archive_product(text, text) from public, anon;
grant execute on function public.archive_product(text, text) to authenticated;

create or replace function public.unarchive_product(p_key text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_key, '')));
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may restore a product'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  delete from product_archives where company_id = v_company and product_key = v_key;
  insert into product_events (company_id, actor_id, action, product_key)
  values (v_company, v_actor, 'unarchive', v_key);
  return jsonb_build_object('archived', false, 'product_key', v_key);
end $$;

revoke execute on function public.unarchive_product(text) from public, anon;
grant execute on function public.unarchive_product(text) to authenticated;
