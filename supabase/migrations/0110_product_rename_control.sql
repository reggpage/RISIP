-- Rename one product without changing quantities, prices, revenue or stock.
-- A rename is an audited relabelling operation, not a delete and not a merge.

alter table public.product_events
  drop constraint if exists product_events_action_check;
alter table public.product_events
  add constraint product_events_action_check
  check (action in ('merge', 'archive', 'unarchive', 'rename'));

create or replace function private.product_exists_for_company(p_company uuid, p_key text)
returns boolean
language sql stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company and private.product_key(l.description) = p_key
    union all select 1 from public.product_costs where company_id = p_company and product_key = p_key
    union all select 1 from public.product_selling_prices where company_id = p_company and product_key = p_key
    union all select 1 from public.stock_counts where company_id = p_company and product_key = p_key
    union all select 1 from public.product_units where company_id = p_company and product_key = p_key
    union all select 1 from public.product_cost_prompts where company_id = p_company and product_key = p_key
    union all select 1 from public.product_archives where company_id = p_company and product_key = p_key
    limit 1
  );
$$;

create or replace function private.product_rename_preview(
  p_company uuid,
  p_from text,
  p_to text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_from text := private.product_key(p_from);
  v_to text := private.product_key(p_to);
  v_lines integer;
  v_costs integer;
  v_prices integer;
  v_counts integer;
  v_units integer;
begin
  if p_company is null or v_from is null or v_to is null or length(v_to) < 2 then
    raise exception 'both usable product names are required'
      using errcode = 'P0001', hint = 'invalid_name';
  end if;
  if v_from = v_to then
    raise exception 'the new product name is unchanged'
      using errcode = 'P0001', hint = 'same_product';
  end if;
  if not private.product_exists_for_company(p_company, v_from) then
    raise exception 'the product to rename was not found'
      using errcode = 'P0001', hint = 'source_not_found';
  end if;
  if private.product_exists_for_company(p_company, v_to) then
    raise exception 'the new name already belongs to another product; use merge instead'
      using errcode = 'P0001', hint = 'target_exists';
  end if;

  select count(*) into v_lines
    from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
   where r.company_id = p_company and private.product_key(l.description) = v_from;
  select count(*) into v_costs from public.product_costs where company_id = p_company and product_key = v_from;
  select count(*) into v_prices from public.product_selling_prices where company_id = p_company and product_key = v_from;
  select count(*) into v_counts from public.stock_counts where company_id = p_company and product_key = v_from;
  select count(*) into v_units from public.product_units where company_id = p_company and product_key = v_from;

  return jsonb_build_object(
    'from_key', v_from, 'from_name', btrim(p_from), 'to_key', v_to, 'to_name', btrim(p_to),
    'sale_lines', v_lines, 'cost_rows', v_costs, 'price_rows', v_prices,
    'stock_counts', v_counts, 'unit_rows', v_units,
    'records', v_lines + v_costs + v_prices + v_counts + v_units
  );
end;
$$;

create or replace function private.rename_product_for_actor(
  p_company uuid,
  p_actor uuid,
  p_from text,
  p_to text,
  p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_from text;
  v_to text;
  v_name text := btrim(coalesce(p_to, ''));
  v_revenue_before numeric;
  v_revenue_after numeric;
begin
  if p_company is null or p_actor is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  v_preview := private.product_rename_preview(p_company, p_from, p_to);
  v_from := v_preview ->> 'from_key';
  v_to := v_preview ->> 'to_key';

  select coalesce(sum(l.line_total), 0) into v_revenue_before
    from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
   where r.company_id = p_company and private.product_key(l.description) = v_from;

  update public.daily_record_lines l set description = v_name
    from public.daily_records r
   where r.id = l.daily_record_id and r.company_id = p_company
     and private.product_key(l.description) = v_from;
  update public.product_costs set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.product_selling_prices set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.stock_counts set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.product_cost_prompts set product_key = v_to
   where company_id = p_company and product_key = v_from;
  update public.product_units set product_key = v_to, product_name = v_name
   where company_id = p_company and product_key = v_from;
  update public.product_archives set product_key = v_to
   where company_id = p_company and product_key = v_from;

  select coalesce(sum(l.line_total), 0) into v_revenue_after
    from public.daily_record_lines l join public.daily_records r on r.id = l.daily_record_id
   where r.company_id = p_company and private.product_key(l.description) = v_to;
  if v_revenue_before <> v_revenue_after then
    raise exception 'a rename must not change revenue'
      using errcode = 'P0001', hint = 'revenue_moved';
  end if;

  insert into public.product_events
    (company_id, actor_id, action, product_key, target_key, reason, metadata)
  values
    (p_company, p_actor, 'rename', v_from, v_to, nullif(btrim(p_reason), ''),
     v_preview || jsonb_build_object('revenue', v_revenue_after));
  return v_preview || jsonb_build_object('revenue', v_revenue_after);
end;
$$;

revoke all on function private.product_exists_for_company(uuid, text)
  from public, anon, authenticated;
revoke all on function private.product_rename_preview(uuid, text, text)
  from public, anon, authenticated;
revoke all on function private.rename_product_for_actor(uuid, uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.preview_product_rename(p_from text, p_to text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid := private.auth_company_id();
begin
  if auth.uid() is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.product_rename_preview(v_company, p_from, p_to);
end;
$$;

create or replace function public.rename_product(p_from text, p_to text, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid := private.auth_company_id(); v_actor uuid := auth.uid();
begin
  if v_actor is null or v_company is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.rename_product_for_actor(v_company, v_actor, p_from, p_to, p_reason);
end;
$$;

create or replace function public.wa_preview_product_rename(p_phone text, p_from text, p_to text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_profile uuid; v_company uuid; v_role text;
begin
  select i.profile_id, p.active_company_id, m.role into v_profile, v_company, v_role
    from public.whatsapp_identities i join public.profiles p on p.id = i.profile_id
    join public.company_members m on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then raise exception 'WhatsApp identity not linked' using errcode = 'P0001', hint = 'not_linked'; end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products' using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.product_rename_preview(v_company, p_from, p_to);
end;
$$;

create or replace function public.wa_rename_product(p_phone text, p_from text, p_to text, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_profile uuid; v_company uuid; v_role text;
begin
  select i.profile_id, p.active_company_id, m.role into v_profile, v_company, v_role
    from public.whatsapp_identities i join public.profiles p on p.id = i.profile_id
    join public.company_members m on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_profile is null then raise exception 'WhatsApp identity not linked' using errcode = 'P0001', hint = 'not_linked'; end if;
  if v_role not in ('owner', 'accountant') then
    raise exception 'only an owner or accountant may rename products' using errcode = 'P0001', hint = 'not_authorized';
  end if;
  return private.rename_product_for_actor(v_company, v_profile, p_from, p_to, p_reason);
end;
$$;

revoke all on function public.preview_product_rename(text, text) from public, anon;
revoke all on function public.rename_product(text, text, text) from public, anon;
grant execute on function public.preview_product_rename(text, text) to authenticated;
grant execute on function public.rename_product(text, text, text) to authenticated;
revoke all on function public.wa_preview_product_rename(text, text, text) from public, anon, authenticated;
revoke all on function public.wa_rename_product(text, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_preview_product_rename(text, text, text) to service_role;
grant execute on function public.wa_rename_product(text, text, text, text) to service_role;
