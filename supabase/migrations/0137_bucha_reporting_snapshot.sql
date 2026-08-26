-- RISIP BUCHA, PHASE 9 — one server-side reporting snapshot.
--
-- Reports are derived from confirmed daily_records only. Voiding a record
-- therefore removes its effect without erasing its audit trail. This is a
-- reporting read model, not a second mutable accounting ledger.

create or replace function public.bucha_reporting_snapshot(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_company uuid := private.auth_company_id();
  v_role public.user_role := private.auth_role();
  v_from timestamptz := coalesce(
    p_from,
    date_trunc('day', now() at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam'
  );
  v_to timestamptz := coalesce(p_to, now());
  v_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_expenses numeric := 0;
  v_customer_payments numeric := 0;
  v_cash_stock_purchases numeric := 0;
  v_stock_purchases numeric := 0;
  v_supplier_payments numeric := 0;
  v_whole_animal_cash numeric := 0;
  v_method_breakdown jsonb := '{}'::jsonb;
  v_receivables jsonb := '[]'::jsonb;
  v_supplier_payables jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_losses jsonb := '{}'::jsonb;
  v_owner_use jsonb := '{}'::jsonb;
  v_animals jsonb := '{}'::jsonb;
  v_profit jsonb := '{}'::jsonb;
begin
  if v_company is null or v_role is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company reporting'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if v_to <= v_from then
    raise exception 'report range is invalid' using errcode = 'P0001', hint = 'invalid_range';
  end if;

  select coalesce(sum(case when r.kind in ('sale', 'debt_issued') then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind = 'sale' then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind = 'expense' then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind = 'customer_payment' then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind = 'stock_purchase' then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind in ('stock_purchase', 'supplier_payable') then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind = 'supplier_payment' then r.amount else 0 end), 0),
         coalesce(sum(case when r.kind = 'whole_animal_procurement' and r.payment_method is not null then r.amount else 0 end), 0)
    into v_sales, v_cash_sales, v_expenses, v_customer_payments, v_cash_stock_purchases,
         v_stock_purchases, v_supplier_payments, v_whole_animal_cash
    from public.daily_records r
   where r.company_id = v_company and r.status = 'confirmed'
     and r.occurred_at >= v_from and r.occurred_at < v_to;

  select coalesce(jsonb_object_agg(method, total), '{}'::jsonb)
    into v_method_breakdown
    from (
      select case
        when r.kind = 'debt_issued' then 'credit'
        when r.payment_method = 'cash' then 'cash'
        when r.payment_method = 'mobile_money' then 'mobile_money'
        when r.payment_method = 'bank' then 'bank'
        when r.payment_method = 'other' then 'other'
        else 'unstated'
      end as method, sum(r.amount) as total
        from public.daily_records r
       where r.company_id = v_company and r.status = 'confirmed'
         and r.kind in ('sale', 'debt_issued')
         and r.occurred_at >= v_from and r.occurred_at < v_to
       group by 1
    ) methods;

  -- Customer receivables and supplier payables are current balances, not just
  -- activity in the selected report window. Names are normalized by the same
  -- private.product_key helper used by the existing debt architecture.
  select coalesce(jsonb_agg(jsonb_build_object(
    'party_name', party_name, 'issued', issued, 'paid', paid, 'outstanding', outstanding
  ) order by outstanding desc, party_name), '[]'::jsonb)
    into v_receivables
    from (
      select max(btrim(r.party_name)) as party_name,
             sum(case when r.kind = 'debt_issued' then r.amount else 0 end) as issued,
             sum(case when r.kind = 'customer_payment' then r.amount else 0 end) as paid,
             sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) as outstanding
        from public.daily_records r
       where r.company_id = v_company and r.status = 'confirmed'
         and r.party_name is not null
         and r.kind in ('debt_issued', 'customer_payment')
       group by private.product_key(r.party_name)
      having sum(case when r.kind = 'debt_issued' then r.amount else -r.amount end) > 0
    ) balances;

  select coalesce(jsonb_agg(jsonb_build_object(
    'supplier_name', supplier_name, 'payable', payable, 'payments', payments,
    'outstanding', outstanding
  ) order by outstanding desc, supplier_name), '[]'::jsonb)
    into v_supplier_payables
    from (
      select max(btrim(r.party_name)) as supplier_name,
             sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else 0 end) as payable,
             sum(case when r.kind = 'supplier_payment' then r.amount else 0 end) as payments,
             sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else -r.amount end) as outstanding
        from public.daily_records r
       where r.company_id = v_company and r.status = 'confirmed'
         and r.party_name is not null
         and r.kind in ('supplier_payable', 'supplier_payment', 'whole_animal_procurement')
         and (r.kind <> 'whole_animal_procurement' or r.payment_method is null)
       group by private.product_key(r.party_name)
      having sum(case when r.kind in ('supplier_payable', 'whole_animal_procurement') then r.amount else -r.amount end) > 0
    ) balances;

  select coalesce(jsonb_agg(to_jsonb(stock_row) order by stock_row.product_name), '[]'::jsonb)
    into v_stock
    from public.wa_stock_on_hand(v_company, null) stock_row;

  select jsonb_build_object(
    'amount', coalesce(sum(r.amount), 0),
    'unvalued_events', count(*) filter (where r.amount = 0),
    'quantity', coalesce(sum(l.quantity), 0),
    'valuation_complete', count(*) filter (where r.amount = 0) = 0
  ) into v_losses
    from public.daily_records r
    left join public.daily_record_lines l on l.daily_record_id = r.id
   where r.company_id = v_company and r.status = 'confirmed' and r.kind = 'stock_loss'
     and r.occurred_at >= v_from and r.occurred_at < v_to;

  select jsonb_build_object(
    'amount', coalesce(sum(r.amount), 0),
    'quantity', coalesce(sum(l.quantity), 0),
    'events', count(distinct r.id)
  ) into v_owner_use
    from public.daily_records r
    left join public.daily_record_lines l on l.daily_record_id = r.id
   where r.company_id = v_company and r.status = 'confirmed' and r.kind = 'owner_use'
     and r.occurred_at >= v_from and r.occurred_at < v_to;

  select jsonb_build_object(
    'count', count(*),
    'total', coalesce(sum(r.amount), 0),
    'pending_breakdown', count(*) filter (where not exists (
      select 1 from public.whole_animal_breakdowns b
      join public.daily_records br on br.id = b.daily_record_id
      where b.source_procurement_daily_record_id = r.id and br.status <> 'voided'
    )),
    'breakdown_outputs', coalesce((select sum(o.base_quantity)
      from public.whole_animal_breakdown_outputs o
      join public.whole_animal_breakdowns b on b.daily_record_id = o.breakdown_daily_record_id
      join public.daily_records br on br.id = b.daily_record_id
      where b.company_id = v_company and br.status = 'confirmed'
        and br.occurred_at >= v_from and br.occurred_at < v_to), 0),
    'pending', coalesce((select jsonb_agg(jsonb_build_object(
      'daily_record_id', r2.id, 'animal_type', p.animal_type,
      'animal_count', p.animal_count, 'purchase_total', r2.amount,
      'occurred_at', r2.occurred_at
    ) order by r2.occurred_at desc)
      from public.daily_records r2
      join public.whole_animal_procurements p on p.daily_record_id = r2.id
     where r2.company_id = v_company and r2.status = 'confirmed'
       and r2.occurred_at >= v_from and r2.occurred_at < v_to
       and not exists (
         select 1 from public.whole_animal_breakdowns b2
         join public.daily_records br2 on br2.id = b2.daily_record_id
         where b2.source_procurement_daily_record_id = r2.id and br2.status <> 'voided'
       )), '[]'::jsonb)
  ) into v_animals
    from public.daily_records r
   where r.company_id = v_company and r.status = 'confirmed'
     and r.kind = 'whole_animal_procurement'
     and r.occurred_at >= v_from and r.occurred_at < v_to;

  -- This is the established historical-cost function, now corrected in this
  -- migration to value both cash sales and credit sales (debt_issued).
  v_profit := public.daily_profit_estimate(v_from, v_to);

  return jsonb_build_object(
    'timezone', 'Africa/Dar_es_Salaam',
    'from', v_from, 'to', v_to,
    'sales', jsonb_build_object('total', v_sales, 'cash_sales', v_cash_sales,
      'credit_sales', coalesce((v_method_breakdown->>'credit')::numeric, 0),
      'by_payment_method', v_method_breakdown),
    'expenses', v_expenses,
    'customer_payments', v_customer_payments,
    'stock_purchases', v_stock_purchases,
    'supplier_payments', v_supplier_payments,
    'whole_animal_cash_purchases', v_whole_animal_cash,
    'cash_movement', v_cash_sales + v_customer_payments - v_expenses
      - v_cash_stock_purchases
      - v_supplier_payments - v_whole_animal_cash,
    'profit', v_profit,
    'customer_receivables', v_receivables,
    'supplier_payables', v_supplier_payables,
    'stock', v_stock,
    'stock_loss', v_losses,
    'owner_use', v_owner_use,
    'whole_animals', v_animals
  );
end;
$fn$;

revoke all on function public.bucha_reporting_snapshot(timestamptz, timestamptz) from public, anon;
grant execute on function public.bucha_reporting_snapshot(timestamptz, timestamptz) to authenticated;

-- Service-role wrapper for the already linked WhatsApp identity. It sets the
-- same JWT subject used by the existing Phase 8 wrappers, then delegates to
-- the role-checked company snapshot.
create or replace function public.wa_bucha_reporting_snapshot(
  p_profile_id uuid,
  p_company_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_role public.user_role;
  v_company uuid;
begin
  select p.active_company_id, m.role into v_company, v_role
    from public.profiles p
    join public.company_members m on m.profile_id = p.id
      and m.company_id = p.active_company_id and m.deactivated_at is null
   where p.id = p_profile_id and p.deactivated_at is null;
  if v_company is null or v_company <> p_company_id then
    raise exception 'WhatsApp identity is not active in this company'
      using errcode = 'P0001', hint = 'wrong_company';
  end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant can read company reporting'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  return public.bucha_reporting_snapshot(p_from, p_to);
end;
$fn$;

revoke all on function public.wa_bucha_reporting_snapshot(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.wa_bucha_reporting_snapshot(uuid, uuid, timestamptz, timestamptz)
  to service_role;

-- Phase 9 corrects the existing profit function's sales scope. The rest of its
-- historical cost and incomplete-valuation contract remains unchanged.
create or replace function public.daily_profit_estimate(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_company uuid := private.auth_company_id();
  v_sales numeric := 0; v_expenses numeric := 0; v_stock numeric := 0;
  v_losses numeric := 0; v_owner_use numeric := 0;
  v_unvalued_losses int := 0;
  v_cogs numeric := 0; v_costed numeric := 0; v_uncosted int := 0; v_missing text[];
begin
  if v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  select coalesce(sum(amount) filter (where kind in ('sale', 'debt_issued')), 0),
         coalesce(sum(amount) filter (where kind = 'expense'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_purchase'), 0),
         coalesce(sum(amount) filter (where kind = 'stock_loss'), 0),
         coalesce(sum(amount) filter (where kind = 'owner_use'), 0),
         count(*) filter (where kind = 'stock_loss' and amount = 0)
    into v_sales, v_expenses, v_stock, v_losses, v_owner_use, v_unvalued_losses
    from daily_records
   where company_id = v_company and status = 'confirmed'
     and occurred_at >= p_from and occurred_at < p_to;

  with sale_lines as (
    select l.description, l.quantity, l.line_total, d.occurred_at
      from daily_records d join daily_record_lines l on l.daily_record_id = d.id
     where d.company_id = v_company and d.status = 'confirmed'
       and d.kind in ('sale', 'debt_issued')
       and d.occurred_at >= p_from and d.occurred_at < p_to
  ), costed as (
    select sl.*, (select pc.unit_cost from product_costs pc
       where pc.company_id = v_company
         and private.product_key(pc.product_key) = private.product_key(sl.description)
         and pc.effective_from <= sl.occurred_at
       order by pc.effective_from desc, pc.created_at desc limit 1) as unit_cost
      from sale_lines sl
  )
  select coalesce(sum(case when unit_cost is not null then quantity * unit_cost end), 0),
         coalesce(sum(case when unit_cost is not null then line_total end), 0),
         count(*) filter (where unit_cost is null),
         coalesce(array_agg(distinct description) filter (where unit_cost is null), '{}')
    into v_cogs, v_costed, v_uncosted, v_missing
    from costed;

  return jsonb_build_object(
    'sales', v_sales, 'expenses', v_expenses, 'stock_purchases', v_stock,
    'stock_losses', v_losses, 'unvalued_stock_losses', v_unvalued_losses,
    'stock_loss_valuation_complete', v_unvalued_losses = 0, 'owner_use', v_owner_use,
    'cogs', round(v_cogs, 2), 'costed_sales', v_costed,
    'coverage', case when v_sales > 0 then round(v_costed / v_sales, 4) else 0 end,
    'uncosted_lines', v_uncosted, 'products_missing_cost', to_jsonb(v_missing),
    'estimated_profit', round(v_sales - v_cogs - v_expenses - v_losses, 2));
end;
$fn$;

revoke all on function public.daily_profit_estimate(timestamptz, timestamptz) from public, anon;
grant execute on function public.daily_profit_estimate(timestamptz, timestamptz) to authenticated;
