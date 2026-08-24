-- RISIP BUCHA, PHASE 1 (continued) — every function that reads or writes a
-- record kind, updated in one migration so that no existing kind changes
-- meaning the moment four new ones appear.
--
-- The audit enumerated 21 functions touching daily records. Most filter on an
-- explicit kind and are therefore correct by construction when new kinds
-- appear — company_product_catalog, company_product_names, wa_product_pricing
-- and wa_next_cost_prompt all say `kind = 'sale'` or `kind = 'stock_purchase'`
-- and so ignore a spoilage without being told to.
--
-- Four do NOT survive untouched, and all four are here:
--
--   create_daily_record_draft   held its own hardcoded whitelist of five kinds
--   wa_stock_on_hand            counted only purchases in and sales out
--   company_stock_on_hand       the same arithmetic, for the web app
--   daily_profit_estimate       would have reported profit blind to losses
--
-- The two draft functions gain parameters, which in Postgres creates an
-- OVERLOAD rather than a replacement, so the previous signatures are dropped
-- in the same migration. Every caller supplies named arguments that are a
-- subset of the new signature, and the added parameters default to null.

-- ── writing ────────────────────────────────────────────────────────────────

drop function if exists public.create_daily_record_draft(text, numeric, text, text, timestamptz, uuid, text, text, jsonb);

create or replace function public.create_daily_record_draft(
  p_kind text,
  p_amount numeric,
  p_party_name text default null,
  p_description text default null,
  p_occurred_at timestamptz default now(),
  p_project_id uuid default null,
  p_source text default 'app',
  p_source_message_id text default null,
  p_lines jsonb default '[]'::jsonb,
  p_payment_method text default null,
  p_loss_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_id uuid;
  v_existing uuid;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_source text := lower(btrim(coalesce(p_source, 'app')));
  v_source_message_id text := nullif(btrim(p_source_message_id), '');
  v_party_name text := nullif(btrim(p_party_name), '');
  v_description text := nullif(btrim(p_description), '');
  v_payment_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_loss_reason text := nullif(btrim(coalesce(p_loss_reason, '')), '');
  v_amount numeric(14,2);
  v_currency text;
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_line record;
  v_line_description text;
  v_quantity numeric;
  v_unit_amount numeric;
  v_line_total numeric(14,2);
  v_line_sum numeric(14,2) := 0;
  -- Goods can leave the shelf with no price attached. A spoiled kilo of a
  -- product whose buying cost was never recorded is still a real inventory
  -- event, and refusing it would leave stock permanently overstated. Zero
  -- money is allowed there, and only there.
  v_valueless_ok boolean;
begin
  if v_actor is null or v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_kind not in (
    'sale', 'expense', 'debt_issued', 'customer_payment', 'stock_purchase',
    'stock_loss', 'owner_use', 'supplier_payable', 'supplier_payment'
  ) then
    raise exception 'unsupported daily record kind' using errcode = 'P0001', hint = 'invalid_kind';
  end if;
  if v_source not in ('app', 'whatsapp', 'other') then
    raise exception 'unsupported daily record source' using errcode = 'P0001', hint = 'invalid_source';
  end if;

  v_valueless_ok := v_kind in ('stock_loss', 'owner_use');

  -- "Deni" is not a way of paying. Credit already has its own kind, and
  -- admitting it here would let one fact be recorded two incompatible ways.
  if v_payment_method = 'deni' then
    raise exception 'credit is recorded as debt_issued, not as a payment method'
      using errcode = 'P0001', hint = 'deni_is_not_a_payment_method';
  end if;
  if v_payment_method is not null and v_payment_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unsupported payment method' using errcode = 'P0001', hint = 'invalid_payment_method';
  end if;
  if v_loss_reason is not null and v_kind <> 'stock_loss' then
    raise exception 'a loss reason belongs to a stock loss' using errcode = 'P0001', hint = 'loss_reason_not_applicable';
  end if;

  if p_amount is null then
    raise exception 'amount is required' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  if p_amount < 0 or (p_amount = 0 and not v_valueless_ok) then
    raise exception 'amount must be greater than zero' using errcode = 'P0001', hint = 'invalid_amount';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount < 0 or (v_amount = 0 and not v_valueless_ok) then
    raise exception 'amount must be greater than zero' using errcode = 'P0001', hint = 'invalid_amount';
  end if;

  if v_party_name is not null and length(v_party_name) > 200 then
    raise exception 'party name is too long' using errcode = 'P0001', hint = 'invalid_party_name';
  end if;
  if v_description is not null and length(v_description) > 2000 then
    raise exception 'description is too long' using errcode = 'P0001', hint = 'invalid_description';
  end if;
  if v_source_message_id is not null and length(v_source_message_id) > 256 then
    raise exception 'source message id is too long' using errcode = 'P0001', hint = 'invalid_source_message_id';
  end if;
  if p_project_id is not null then
    if not exists (
      select 1 from public.projects p
       where p.id = p_project_id and p.company_id = v_company
    ) then
      raise exception 'project is not in the active company' using errcode = 'P0001', hint = 'wrong_company';
    end if;
    if v_role = 'worker' and not private.auth_can_see_project(p_project_id) then
      raise exception 'you cannot create a record for this project' using errcode = 'P0001', hint = 'project_not_visible';
    end if;
  end if;
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'lines must be a JSON array' using errcode = 'P0001', hint = 'invalid_lines';
  end if;

  for v_line in
    select value, ordinality
      from jsonb_array_elements(v_lines) with ordinality as items(value, ordinality)
  loop
    if jsonb_typeof(v_line.value) <> 'object' then
      raise exception 'each line must be a JSON object' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line_description := nullif(btrim(v_line.value->>'description'), '');
    if v_line_description is null or length(v_line_description) > 300 then
      raise exception 'each line needs a description' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    if coalesce(v_line.value->>'quantity', '') !~ '^([0-9]+)([.][0-9]+)?$'
       or coalesce(v_line.value->>'unit_amount', '') !~ '^([0-9]+)([.][0-9]+)?$' then
      raise exception 'each line needs numeric quantity and unit_amount' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    if length(btrim(coalesce(v_line.value->>'unit', ''))) > 20 then
      raise exception 'a unit label is too long' using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_quantity := (v_line.value->>'quantity')::numeric;
    v_unit_amount := (v_line.value->>'unit_amount')::numeric;
    if v_quantity <= 0 or v_unit_amount < 0 then
      raise exception 'line quantity must be positive and unit amount cannot be negative'
        using errcode = 'P0001', hint = 'invalid_lines';
    end if;
    v_line_total := round(v_quantity * v_unit_amount, 2);
    v_line_sum := v_line_sum + v_line_total;
  end loop;
  -- Unchanged, and the reason is unchanged: the arithmetic in a record must add
  -- up before the record exists, wherever the numbers came from. This is the
  -- guard that stops a model's total being taken on trust.
  if jsonb_array_length(v_lines) > 0 and abs(v_line_sum - v_amount) > 0.01 then
    raise exception 'line totals must equal the record amount' using errcode = 'P0001', hint = 'line_total_mismatch';
  end if;

  select c.currency into v_currency from public.companies c where c.id = v_company;
  if v_currency is null then
    raise exception 'active company not found' using errcode = 'P0001', hint = 'company_not_found';
  end if;

  insert into public.daily_records
    (company_id, project_id, recorded_by, source, source_message_id, kind, status,
     amount, currency, party_name, description, occurred_at, payment_method, loss_reason)
  values
    (v_company, p_project_id, v_actor, v_source, v_source_message_id, v_kind,
     'pending_confirmation', v_amount, v_currency, v_party_name, v_description,
     coalesce(p_occurred_at, now()), v_payment_method, v_loss_reason)
  on conflict (company_id, source_message_id)
    where source_message_id is not null
  do nothing
  returning id into v_id;

  -- Webhook idempotency, untouched: a redelivered WhatsApp message returns the
  -- record it already created rather than creating a second one.
  if v_id is null then
    select dr.id into v_existing
      from public.daily_records dr
     where dr.company_id = v_company and dr.source_message_id = v_source_message_id;
    if v_existing is null then
      raise exception 'daily record could not be created' using errcode = 'P0001', hint = 'create_failed';
    end if;
    return v_existing;
  end if;

  for v_line in
    select value, ordinality
      from jsonb_array_elements(v_lines) with ordinality as items(value, ordinality)
  loop
    v_quantity := (v_line.value->>'quantity')::numeric;
    v_unit_amount := (v_line.value->>'unit_amount')::numeric;
    insert into public.daily_record_lines
      (daily_record_id, line_number, description, quantity, unit_amount, line_total, unit)
    values
      (v_id, v_line.ordinality::integer, btrim(v_line.value->>'description'),
       v_quantity, v_unit_amount, round(v_quantity * v_unit_amount, 2),
       nullif(btrim(coalesce(v_line.value->>'unit', '')), ''));
  end loop;

  insert into public.daily_record_audit_log
    (daily_record_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_id, v_company, v_actor, 'created', null, 'pending_confirmation',
     jsonb_build_object(
       'kind', v_kind, 'amount', v_amount, 'currency', v_currency, 'source', v_source,
       'source_message_id', v_source_message_id, 'line_count', jsonb_array_length(v_lines),
       'payment_method', v_payment_method, 'loss_reason', v_loss_reason
     ));

  return v_id;
end;
$fn$;

revoke all on function public.create_daily_record_draft(text, numeric, text, text, timestamptz, uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.create_daily_record_draft(text, numeric, text, text, timestamptz, uuid, text, text, jsonb, text, text) to authenticated;

drop function if exists public.wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamptz, text, jsonb);

create or replace function public.wa_create_daily_record_draft(
  p_profile_id uuid,
  p_company_id uuid,
  p_kind text,
  p_amount numeric,
  p_party_name text default null,
  p_description text default null,
  p_occurred_at timestamptz default now(),
  p_source_message_id text default null,
  p_lines jsonb default '[]'::jsonb,
  p_payment_method text default null,
  p_loss_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_active_company uuid;
begin
  -- Tenancy, unchanged: the phone's profile must still be active in the very
  -- company the caller names.
  select p.active_company_id into v_active_company
    from public.profiles p
    join public.company_members m
      on m.profile_id = p.id
     and m.company_id = p.active_company_id
     and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_active_company is null or v_active_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;

  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.create_daily_record_draft(
    p_kind, p_amount, p_party_name, p_description, p_occurred_at, null,
    'whatsapp', p_source_message_id, p_lines, p_payment_method, p_loss_reason
  );
end;
$fn$;

revoke all on function public.wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamptz, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.wa_create_daily_record_draft(uuid, uuid, text, numeric, text, text, timestamptz, text, jsonb, text, text) to service_role;

-- ── reading: stock ─────────────────────────────────────────────────────────
--
-- Goods leave the shelf three ways now, not one. Counting only sales would
-- report a shelf that still holds meat the shop threw away this morning —
-- which is exactly the number a butcher would use to decide nobody is
-- stealing. Losses and owner use are reported as their own column rather than
-- folded into sold_since, so a shop can always see WHY the shelf emptied.

drop function if exists public.wa_stock_on_hand(uuid, text);

create or replace function public.wa_stock_on_hand(p_company_id uuid, p_product text default null::text)
returns table(
  product_name text, unit text, measured boolean, on_hand numeric, has_count boolean,
  counted_at timestamptz, bought_since numeric, sold_since numeric,
  lost_since numeric, taken_since numeric, incomplete_purchases boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
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
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'stock_loss'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'owner_use'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = p_company_id
      and r.status = 'confirmed'
      and r.kind in ('sale', 'stock_purchase', 'stock_loss', 'owner_use')
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
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0)
      - coalesce(m.sold_since, 0) - coalesce(m.lost_since, 0) - coalesce(m.taken_since, 0),
    lc.product_key is not null,
    lc.counted_at,
    coalesce(m.bought_since, 0),
    coalesce(m.sold_since, 0),
    coalesce(m.lost_since, 0),
    coalesce(m.taken_since, 0),
    (select any_bare from bare)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where p_product is null
     or private.product_key(coalesce(m.product_key, lc.product_key)) = private.product_key(p_product)
  order by coalesce(m.product_name, lc.product_name)
  limit 500;
$fn$;

grant execute on function public.wa_stock_on_hand(uuid, text) to service_role;

drop function if exists public.company_stock_on_hand();

create or replace function public.company_stock_on_hand()
returns table(
  product_key text, product_name text, unit text, measured boolean,
  counted_qty numeric, counted_at timestamptz, has_count boolean,
  bought_since numeric, sold_since numeric, lost_since numeric, taken_since numeric,
  on_hand numeric, incomplete_purchases boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
  with company as (select private.auth_company_id() as id),
  last_count as (
    select distinct on (product_key)
      product_key, product_name, quantity, unit, counted_at
    from public.stock_counts
    where company_id = (select id from company)
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
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as sold_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'stock_loss'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as lost_since,
      coalesce(sum(coalesce(l.stock_base_quantity, l.quantity)) filter (
        where r.kind = 'owner_use'
          and (lc.counted_at is null or r.occurred_at > lc.counted_at)), 0) as taken_since
    from public.daily_record_lines l
    join public.daily_records r on r.id = l.daily_record_id
    left join last_count lc on lc.product_key = private.product_key(l.description)
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind in ('sale', 'stock_purchase', 'stock_loss', 'owner_use')
      and private.product_key(l.description) is not null
    group by private.product_key(l.description)
  ),
  bare_purchases as (
    select count(*) > 0 as any_bare
    from public.daily_records r
    where r.company_id = (select id from company)
      and r.status = 'confirmed'
      and r.kind = 'stock_purchase'
      and not exists (select 1 from public.daily_record_lines l where l.daily_record_id = r.id)
  )
  select
    coalesce(m.product_key, lc.product_key),
    coalesce(m.product_name, lc.product_name),
    coalesce(lc.unit, m.unit),
    coalesce(m.measured, lc.unit is not null, false),
    lc.quantity,
    lc.counted_at,
    lc.product_key is not null,
    coalesce(m.bought_since, 0),
    coalesce(m.sold_since, 0),
    coalesce(m.lost_since, 0),
    coalesce(m.taken_since, 0),
    coalesce(lc.quantity, 0) + coalesce(m.bought_since, 0)
      - coalesce(m.sold_since, 0) - coalesce(m.lost_since, 0) - coalesce(m.taken_since, 0),
    (select any_bare from bare_purchases)
  from movement m
  full join last_count lc on lc.product_key = m.product_key
  where (select id from company) is not null
  order by coalesce(m.product_name, lc.product_name);
$fn$;

revoke all on function public.company_stock_on_hand() from public, anon;
grant execute on function public.company_stock_on_hand() to authenticated;

-- ── reading: profit ────────────────────────────────────────────────────────
--
-- Spoiled goods never become cost of goods sold, because they were never sold.
-- Left out of the estimate entirely, a butcher who threw away 40,000 of meat
-- would be shown the profit of a butcher who had not. It is reported on its own
-- line AND subtracted, because both facts matter and neither is the other.
--
-- No historical figure moves: stock_loss did not exist until this migration, so
-- there are no rows of that kind behind any previously reported number.
--
-- Owner use is deliberately NOT subtracted here. It is goods leaving for the
-- household, not a loss to the business, and how a shop accounts for that is a
-- decision the shop has to make — reported separately rather than assumed.

create or replace function public.daily_profit_estimate(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_company uuid := private.auth_company_id();
  v_sales numeric := 0; v_expenses numeric := 0; v_stock numeric := 0;
  v_losses numeric := 0; v_owner_use numeric := 0;
  v_cogs numeric := 0; v_costed numeric := 0; v_uncosted int := 0; v_missing text[];
begin
  if v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;

  select coalesce(sum(amount) filter (where kind = 'sale'), 0),
         coalesce(sum(amount) filter (where kind = 'expense'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_purchase'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_loss'), 0),
         coalesce(sum(amount) filter (where kind = 'owner_use'), 0)
    into v_sales, v_expenses, v_stock, v_losses, v_owner_use
    from daily_records
   where company_id = v_company and status = 'confirmed'
     and occurred_at >= p_from and occurred_at < p_to;

  with sale_lines as (
    select l.description, l.quantity, l.line_total, d.occurred_at
      from daily_records d
      join daily_record_lines l on l.daily_record_id = d.id
     where d.company_id = v_company and d.status = 'confirmed' and d.kind = 'sale'
       and d.occurred_at >= p_from and d.occurred_at < p_to
  ), costed as (
    select sl.*,
           (select pc.unit_cost from product_costs pc
             where pc.company_id = v_company
               and pc.product_key = lower(btrim(sl.description))
               and pc.effective_from <= sl.occurred_at
             order by pc.effective_from desc, pc.created_at desc
             limit 1) as unit_cost
      from sale_lines sl
  )
  select coalesce(sum(case when unit_cost is not null then quantity * unit_cost end), 0),
         coalesce(sum(case when unit_cost is not null then line_total end), 0),
         count(*) filter (where unit_cost is null),
         coalesce(array_agg(distinct description) filter (where unit_cost is null), '{}')
    into v_cogs, v_costed, v_uncosted, v_missing
    from costed;

  return jsonb_build_object(
    'sales', v_sales,
    'expenses', v_expenses,
    'stock_purchases', v_stock,
    'stock_losses', v_losses,
    'owner_use', v_owner_use,
    'cogs', round(v_cogs, 2),
    'costed_sales', v_costed,
    'coverage', case when v_sales > 0 then round(v_costed / v_sales, 4) else 0 end,
    'uncosted_lines', v_uncosted,
    'products_missing_cost', to_jsonb(v_missing),
    'estimated_profit', round(v_sales - v_cogs - v_expenses - v_losses, 2));
end;
$fn$;

revoke all on function public.daily_profit_estimate(timestamptz, timestamptz) from public, anon;
grant execute on function public.daily_profit_estimate(timestamptz, timestamptz) to authenticated;
