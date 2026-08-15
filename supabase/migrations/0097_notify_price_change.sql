-- Everyone in the business hears when a buying price changes.
--
-- A price change is not a private edit. It moves every profit figure that
-- follows it, and the person who notices a margin looking wrong is usually not
-- the person who typed the number. Silence here is how a fat-fingered 900 for
-- 9,000 survives a month.
--
-- A TRIGGER, not a call in each caller. Prices arrive from set_product_cost in
-- the web app, from wa_set_product_cost on WhatsApp, and from
-- wa_set_product_costs in bulk. Notifying inside one would leave the other doors
-- silent; notifying inside all three would drift apart. The table is the one
-- place every door must pass through.
--
-- FIRST PRICE IS NOT A CHANGE. Setting a price for a product that never had one
-- answers a question Risip asked; it overrules nobody. Thirty-six of those in
-- one paste would be thirty-six notifications for every member. Only a price
-- that MOVED is announced, and re-stating the same number is silent.
--
-- The actor is never told what they just did.
--
-- The amounts are trimmed of the full stop FM leaves behind: "TZS 500." read as
-- a sentence ending in the middle of itself on a phone.
--
-- ROLLBACK
--   drop trigger product_costs_notify_ai on public.product_costs;
--   drop function public.product_costs_notify_members();

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

drop trigger if exists product_costs_notify_ai on public.product_costs;
create trigger product_costs_notify_ai
  after insert on public.product_costs
  for each row execute function public.product_costs_notify_members();
