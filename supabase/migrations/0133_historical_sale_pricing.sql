-- Historical WhatsApp sales are priced as they occurred, never at today's
-- catalogue price. Null p_priced_at deliberately preserves current pricing.

create or replace function public.wa_product_pricing(
  p_company_id uuid,
  p_product_keys text[],
  p_priced_at timestamptz
)
returns table (
  product_key text,
  retail_price numeric,
  wholesale_price numeric,
  wholesale_min_qty numeric,
  unit_cost numeric,
  avg_unit_price numeric,
  sold_quantity numeric
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with wanted as (
    select distinct private.product_key(k) as product_key
      from unnest(coalesce(p_product_keys, '{}'::text[])) as k
     where private.product_key(k) is not null
  ),
  latest_price as (
    select distinct on (private.product_key(s.product_key))
      private.product_key(s.product_key) as product_key,
      s.retail_price, s.wholesale_price, s.wholesale_min_qty
    from public.product_selling_prices s
    where s.company_id = p_company_id
      and s.sale_unit_key is null
      and (p_priced_at is null or s.effective_from <= p_priced_at)
    order by private.product_key(s.product_key), s.effective_from desc, s.created_at desc
  ),
  latest_cost as (
    select distinct on (private.product_key(c.product_key))
      private.product_key(c.product_key) as product_key,
      coalesce(c.base_unit_cost, c.unit_cost) as unit_cost
    from public.product_costs c
    where c.company_id = p_company_id
      and (p_priced_at is null or c.effective_from <= p_priced_at)
    order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  achieved as (
    select private.product_key(l.description) as product_key,
      sum(coalesce(l.stock_base_quantity, l.quantity)) as sold_quantity,
      case when sum(coalesce(l.stock_base_quantity, l.quantity)) > 0
        then round(sum(l.line_total) / sum(coalesce(l.stock_base_quantity, l.quantity)), 2) end as avg_unit_price
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    where r.company_id = p_company_id and r.kind = 'sale' and r.status = 'confirmed'
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  )
  select w.product_key, p.retail_price, p.wholesale_price, p.wholesale_min_qty,
    c.unit_cost, a.avg_unit_price, coalesce(a.sold_quantity, 0)
  from wanted w
  left join latest_price p on p.product_key = w.product_key
  left join latest_cost c on c.product_key = w.product_key
  left join achieved a on a.product_key = w.product_key;
$$;

create or replace function public.wa_product_pricing(p_company_id uuid, p_product_keys text[])
returns table (
  product_key text, retail_price numeric, wholesale_price numeric,
  wholesale_min_qty numeric, unit_cost numeric, avg_unit_price numeric,
  sold_quantity numeric
)
language sql stable security definer
set search_path = pg_catalog, public
as $$ select * from public.wa_product_pricing(p_company_id, p_product_keys, null::timestamptz) $$;

create or replace function public.wa_price_sale_unit(
  p_company_id uuid,
  p_product text,
  p_unit text,
  p_quantity numeric,
  p_priced_at timestamptz
)
returns table(
  product_key text, product_name text, unit_name text, base_unit text,
  base_quantity numeric, unit_price numeric, wholesale_price numeric,
  wholesale_min_qty numeric, price_source text, total numeric
)
language sql stable security definer
set search_path = pg_catalog, public
as $fn$
  with wanted as (
    select private.product_key(p_product) as key, private.product_key(p_unit) as unit_key
  ),
  base as (
    select u.unit_name, u.unit_key from public.product_units u, wanted w
    where u.company_id = p_company_id and u.product_key = w.key and u.is_base limit 1
  ),
  measure as (
    select u.product_key, u.product_name, u.unit_name, u.unit_key, u.base_quantity
    from public.product_units u, wanted w
    where u.company_id = p_company_id and u.product_key = w.key
      and u.unit_key = w.unit_key and u.can_sell limit 1
  ),
  priced as (
    select distinct on (s.sale_unit_key) s.sale_unit_key, s.retail_price,
      s.wholesale_price, s.wholesale_min_qty
    from public.product_selling_prices s, wanted w
    where s.company_id = p_company_id and s.product_key = w.key
      and s.sale_unit_key is not null
      and (p_priced_at is null or s.effective_from <= p_priced_at)
    order by s.sale_unit_key, s.effective_from desc, s.created_at desc
  ),
  own_price as (
    select p.retail_price, p.wholesale_price, p.wholesale_min_qty
    from priced p, measure m where p.sale_unit_key = m.unit_key
  ),
  base_price as (
    select p.retail_price from priced p, base b where p.sale_unit_key = b.unit_key
  )
  select m.product_key, m.product_name, m.unit_name, b.unit_name,
    round(m.base_quantity * p_quantity, 6),
    coalesce((select retail_price from own_price),
             round((select retail_price from base_price) * m.base_quantity, 2)),
    (select wholesale_price from own_price),
    (select wholesale_min_qty from own_price),
    case when (select retail_price from own_price) is not null then 'unit' else 'derived' end,
    round(coalesce((select retail_price from own_price),
                   (select retail_price from base_price) * m.base_quantity) * p_quantity, 2)
  from measure m cross join base b
  where p_quantity > 0;
$fn$;

-- Mixed sale/expense messages keep one validated occurrence time per child.
create or replace function public.wa_create_daily_record_batch_drafts(
  p_profile_id uuid, p_company_id uuid, p_source_message_id text, p_records jsonb
)
returns uuid[]
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_company uuid; v_item record; v_source text := nullif(btrim(p_source_message_id), '');
  v_id uuid; v_ids uuid[] := '{}'::uuid[]; v_occurred_at timestamptz;
begin
  select p.active_company_id into v_active_company
  from public.profiles p join public.company_members m
    on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
  where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company' using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_source is null or length(v_source) > 240 then
    raise exception 'a valid source message id is required' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) < 2 or jsonb_array_length(p_records) > 10 then
    raise exception 'a batch must contain between 2 and 10 records' using errcode = 'P0001', hint = 'invalid_batch';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  for v_item in select value, ordinality from jsonb_array_elements(p_records) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_item.value) <> 'object' then
      raise exception 'each batch record must be an object' using errcode = 'P0001', hint = 'invalid_batch';
    end if;
    v_occurred_at := coalesce(nullif(btrim(v_item.value->>'occurred_at'), '')::timestamptz, clock_timestamp());
    v_id := public.create_daily_record_draft(
      v_item.value->>'kind', (v_item.value->>'amount')::numeric,
      nullif(btrim(v_item.value->>'party_name'), ''), nullif(btrim(v_item.value->>'description'), ''),
      v_occurred_at, null, 'whatsapp', v_source || '#' || v_item.ordinality::text,
      coalesce(v_item.value->'lines', '[]'::jsonb)
    );
    v_ids := array_append(v_ids, v_id);
  end loop;
  return v_ids;
end;
$$;

revoke all on function public.wa_product_pricing(uuid, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.wa_product_pricing(uuid, text[], timestamptz) to service_role;
revoke all on function public.wa_product_pricing(uuid, text[]) from public, anon, authenticated;
grant execute on function public.wa_product_pricing(uuid, text[]) to service_role;
revoke all on function public.wa_price_sale_unit(uuid, text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.wa_price_sale_unit(uuid, text, text, numeric, timestamptz) to service_role;
revoke all on function public.wa_create_daily_record_batch_drafts(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_create_daily_record_batch_drafts(uuid, uuid, text, jsonb) to service_role;
