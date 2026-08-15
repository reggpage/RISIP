-- Counting stock, and asking what is left, from WhatsApp.
--
-- The webhook runs as service_role and has no auth.uid(), so it cannot call the
-- auth-scoped functions. These take the company the webhook already resolved
-- from the linked identity, and re-check the role themselves rather than
-- trusting the caller.

create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null)
returns table (
  product_name text,
  unit text,
  measured boolean,
  on_hand numeric,
  has_count boolean,
  counted_at timestamptz,
  bought_since numeric,
  sold_since numeric,
  incomplete_purchases boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with last_count as (
    select distinct on (product_key)
      product_key, product_name, quantity, unit, counted_at
    from stock_counts
    where company_id = p_company_id
    order by product_key, counted_at desc, created_at desc
  ),
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
    where r.company_id = p_company_id
      and r.status = 'confirmed'
      and r.kind in ('sale', 'stock_purchase')
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  ),
  bare as (
    select count(*) > 0 as any_bare
    from daily_records r
    where r.company_id = p_company_id
      and r.status = 'confirmed'
      and r.kind = 'stock_purchase'
      and not exists (select 1 from daily_record_lines l where l.daily_record_id = r.id)
  )
  select
    coalesce(m.product_name, lc.product_name),
    coalesce(lc.unit, m.unit),
    coalesce(m.measured, lc.unit is not null, false),
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0) - coalesce(m.sold_since, 0),
    (lc.product_key is not null),
    lc.counted_at,
    coalesce(m.bought_since, 0),
    coalesce(m.sold_since, 0),
    (select any_bare from bare)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where p_product is null
     or private.product_key(coalesce(m.product_key, lc.product_key)) = private.product_key(p_product)
  order by coalesce(m.product_name, lc.product_name)
  limit 30;
$$;

revoke execute on function public.wa_stock_on_hand(uuid, text) from public, anon, authenticated;

create or replace function public.wa_record_stock_count(
  p_phone text, p_name text, p_quantity numeric, p_unit text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_key text := private.product_key(p_name);
  v_previous numeric; v_id uuid;
begin
  select i.profile_id, p.active_company_id, m.role
    into v_profile, v_company, v_role
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode='P0001', hint='not_linked';
  end if;
  if v_role not in ('owner','accountant') then
    raise exception 'only an owner or accountant may record a stock count'
      using errcode='P0001', hint='not_authorized';
  end if;
  if v_key is null or length(v_key) < 2 then
    raise exception 'which product is this count for?' using errcode='P0001', hint='no_product';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'a count cannot be negative' using errcode='P0001', hint='invalid_quantity';
  end if;

  -- What Risip believed before the count, so the reply can name the difference.
  select on_hand into v_previous
    from public.wa_stock_on_hand(v_company, p_name) limit 1;

  insert into stock_counts (company_id, product_key, product_name, quantity, unit, counted_by)
  values (v_company, v_key, btrim(p_name), round(p_quantity, 3), nullif(btrim(p_unit),''), v_profile)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'product', btrim(p_name),
    'quantity', round(p_quantity, 3), 'previous', v_previous);
end $$;

revoke execute on function public.wa_record_stock_count(text, text, numeric, text) from public, anon, authenticated;

