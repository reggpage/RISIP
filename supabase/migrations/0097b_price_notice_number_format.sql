-- FM strips trailing zeros but leaves the decimal point behind, so a whole
-- number came out as "TZS 500." — a full stop mid-sentence, in a message people
-- read on a phone. rtrim takes it off only when nothing follows it.
create or replace function public.product_costs_notify_members()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous numeric;
  v_actor_name text;
  v_currency text;
  v_direction text;
  v_money text := 'FM999G999G999D99';
begin
  select unit_cost into v_previous
    from product_costs
   where company_id = new.company_id
     and product_key = new.product_key
     and id <> new.id
   order by effective_from desc, created_at desc
   limit 1;

  if v_previous is null or v_previous = new.unit_cost then
    return new;
  end if;

  select full_name into v_actor_name from profiles where id = new.recorded_by;
  v_currency := coalesce(new.currency, 'TZS');
  v_direction := case when new.unit_cost > v_previous then 'imepanda' else 'imeshuka' end;

  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select
    new.company_id,
    m.profile_id,
    new.recorded_by,
    'product_price_changed',
    'Bei ya kununua imebadilika',
    coalesce(v_actor_name, 'Mtu') || ' amebadilisha ' || new.product_name || ': '
      || v_currency || ' ' || rtrim(trim(to_char(v_previous, v_money)), '.') || ' → '
      || v_currency || ' ' || rtrim(trim(to_char(new.unit_cost, v_money)), '.')
      || ' (' || v_direction || '). Rekodi za nyuma hazijaguswa.',
    jsonb_build_object(
      'product_key', new.product_key,
      'product_name', new.product_name,
      'previous_cost', v_previous,
      'new_cost', new.unit_cost,
      'unit', new.unit)
  from company_members m
  where m.company_id = new.company_id
    and m.deactivated_at is null
    and m.profile_id <> new.recorded_by;

  return new;
end $$;
