-- ============================================================================
-- Marketplace orders in the in-app notification bell
-- ============================================================================
-- The WhatsApp ping is blocked behind Meta template approval, so until that
-- lands an incoming order was invisible unless the supplier happened to open
-- the Marketplace page. The bell is the channel that needs nobody's approval.
--
-- Rows go to public.app_notifications, the same table Retirements and Receipts
-- use, so the existing realtime subscription and unread badge pick them up
-- with no client change.

create or replace function private.marketplace_notify_app(
  p_order_id   uuid,
  p_company_id uuid,
  p_type       text,
  p_title      text,
  p_body       text
) returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  -- Every active member who can act on an order gets it. A worker cannot
  -- accept or decline, so telling them would be noise they cannot answer.
  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p_company_id, m.profile_id, auth.uid(), p_type, p_title, p_body,
         jsonb_build_object('order_id', p_order_id, 'route', '/marketplace')
  from public.company_members m
  where m.company_id = p_company_id
    and m.deactivated_at is null
    and m.role in ('owner', 'accountant');
end $$;

-- ── Fire on placement and on every status change ──────────────────────────
-- A trigger rather than a call inside marketplace_place_order: status also
-- moves from the app and from the WhatsApp confirmation path, and a
-- notification that depends on which door the change came through is a
-- notification that goes missing.
create or replace function private.marketplace_order_notify()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer text; v_supplier text; v_qty text;
begin
  select name into v_buyer from public.companies where id = new.buyer_company_id;
  select name into v_supplier from public.companies where id = new.supplier_company_id;
  v_qty := trim(to_char(new.quantity, 'FM999999990.##'))
           || coalesce(' ' || new.unit, '') || ' ' || new.product_name;

  if tg_op = 'INSERT' then
    -- The supplier is the one who has to do something about it.
    perform private.marketplace_notify_app(
      new.id, new.supplier_company_id, 'marketplace_order_received',
      'Oda mpya ya mzigo',
      v_buyer || ' wanahitaji ' || v_qty || '. Jibu kukubali au kukataa.');
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform private.marketplace_notify_app(new.id, new.buyer_company_id,
        'marketplace_order_accepted', 'Oda imekubaliwa',
        v_supplier || ' wamekubali ' || v_qty || '.');
    elsif new.status = 'rejected' then
      perform private.marketplace_notify_app(new.id, new.buyer_company_id,
        'marketplace_order_rejected', 'Oda imekataliwa',
        v_supplier || ' wamekataa ' || v_qty || '.'
          || coalesce(' Sababu: ' || new.status_reason, ''));
    elsif new.status = 'delivered' then
      perform private.marketplace_notify_app(new.id, new.buyer_company_id,
        'marketplace_order_delivered', 'Mzigo umefika',
        v_supplier || ' wamepeleka ' || v_qty || '.');
    elsif new.status = 'cancelled' then
      -- Cancelling is the buyer's move, so the supplier is the one told.
      perform private.marketplace_notify_app(new.id, new.supplier_company_id,
        'marketplace_order_cancelled', 'Oda imeghairiwa',
        v_buyer || ' wameghairi ' || v_qty || '.');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists marketplace_order_notify_ins on public.marketplace_order_requests;
create trigger marketplace_order_notify_ins
  after insert on public.marketplace_order_requests
  for each row execute function private.marketplace_order_notify();

drop trigger if exists marketplace_order_notify_upd on public.marketplace_order_requests;
create trigger marketplace_order_notify_upd
  after update of status on public.marketplace_order_requests
  for each row execute function private.marketplace_order_notify();

revoke all on function private.marketplace_notify_app(uuid, uuid, text, text, text)
  from public, anon, authenticated;
