-- ============================================================================
-- Marketplace: an invoice when the goods arrive
-- ============================================================================
-- A delivered order is a real purchase with a real amount, and the buyer has
-- nothing to file. This records where the PDF lives and whether it reached
-- them, so a failed send is visible instead of silent.
--
-- The PDF itself is built by the marketplace-invoice edge function; storage
-- and Meta both live outside the database.

alter table public.marketplace_order_requests
  add column if not exists invoice_no       text,
  add column if not exists invoice_path     text,
  add column if not exists invoice_total    numeric,
  add column if not exists invoice_built_at timestamptz,
  add column if not exists invoice_sent_at  timestamptz,
  add column if not exists invoice_error    text;

-- One invoice number per order, never reused, readable over a phone line.
create sequence if not exists public.marketplace_invoice_seq;

-- ── What still needs an invoice ──────────────────────────────────────────
-- Delivered, priced, and not yet built. An order whose supplier never shared
-- prices has no amount to invoice; it is skipped rather than invoiced at zero,
-- because a zero invoice is worse than none.
create or replace function public.marketplace_claim_invoices(p_limit integer default 10)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_rows jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('marketplace_claim_invoices'));

  with claimed as (
    update public.marketplace_order_requests o
       set invoice_no = 'MKI-' || lpad(nextval('public.marketplace_invoice_seq')::text, 6, '0'),
           invoice_total = round(o.unit_price * o.quantity, 2),
           invoice_built_at = now()
     where o.id in (
       select x.id from public.marketplace_order_requests x
        where x.status = 'delivered'
          and x.invoice_built_at is null
          and x.unit_price is not null
        order by x.delivered_at
        limit greatest(1, least(coalesce(p_limit, 10), 50))
        for update skip locked)
    returning o.*)
  select coalesce(jsonb_agg(jsonb_build_object(
           'orderId', c.id,
           'invoiceNo', c.invoice_no,
           'productName', c.product_name,
           'quantity', c.quantity,
           'unit', c.unit,
           'unitPrice', c.unit_price,
           'total', c.invoice_total,
           'currency', coalesce(c.currency, 'TZS'),
           'placedAt', c.placed_at,
           'deliveredAt', c.delivered_at,
           'buyerCompanyId', c.buyer_company_id,
           'buyerName', b.name,
           'supplierName', s.name,
           -- Where to send it, resolved now so a revoked identity later does
           -- not silently redirect an invoice.
           'buyerPhone', (select w.phone_e164 from public.whatsapp_identities w
                           where w.company_id = c.buyer_company_id
                             and w.verified_at is not null
                             and w.revoked_at is null
                             and w.opted_out_at is null
                           order by w.verified_at desc limit 1),
           'lang', coalesce((select p.lang from public.profiles p
                              where p.id = c.buyer_profile_id), 'sw')))
         , '[]'::jsonb)
    into v_rows
  from claimed c
  join public.companies b on b.id = c.buyer_company_id
  join public.companies s on s.id = c.supplier_company_id;

  return v_rows;
end $$;

create or replace function public.marketplace_mark_invoice(
  p_order_id uuid,
  p_path     text,
  p_sent     boolean,
  p_error    text default null
) returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.marketplace_order_requests
     set invoice_path = coalesce(p_path, invoice_path),
         invoice_sent_at = case when p_sent then now() else invoice_sent_at end,
         invoice_error = left(p_error, 300)
   where id = p_order_id;
$$;

-- ── The buyer's own copy, from the app ───────────────────────────────────
-- Needs no Meta approval, so this is the channel that always works.
create or replace function public.marketplace_my_invoice(p_order_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; o public.marketplace_order_requests;
begin
  v_company := private.marketplace_my_company(false);
  select * into o from public.marketplace_order_requests where id = p_order_id;
  if o.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  -- Either party may fetch it: the buyer files it, the supplier proves it.
  if v_company not in (o.buyer_company_id, o.supplier_company_id) then
    raise exception 'not a party to this order' using errcode = 'P0001', hint = 'not_order_party';
  end if;
  return jsonb_build_object(
    'orderId', o.id, 'invoiceNo', o.invoice_no, 'path', o.invoice_path,
    'total', o.invoice_total, 'currency', coalesce(o.currency, 'TZS'),
    'builtAt', o.invoice_built_at, 'sentAt', o.invoice_sent_at);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.marketplace_claim_invoices(integer)',
    'public.marketplace_mark_invoice(uuid, text, boolean, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  execute 'revoke all on function public.marketplace_my_invoice(uuid) from public, anon';
  execute 'grant execute on function public.marketplace_my_invoice(uuid) to authenticated';
  execute 'grant execute on function public.marketplace_my_invoice(uuid) to service_role';
end $$;
