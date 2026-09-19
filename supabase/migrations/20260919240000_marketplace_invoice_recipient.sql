-- ============================================================================
-- Fix: send the invoice to the person who placed the order
-- ============================================================================
-- marketplace_claim_invoices resolved the recipient as "the company's most
-- recently verified WhatsApp identity". marketplace_order_contacts resolves
-- the same question as "the declared contact, else the oldest active owner".
--
-- Two rules for one question, and on the first real order they disagreed: the
-- shop has two verified numbers, the buyer placed the order from one of them,
-- and the invoice went to the other. The send reported success because Meta
-- accepted it — it was delivered, just not to the person who asked for it.
--
-- The right answer was always available on the order itself. buyer_profile_id
-- is who placed it. Preference order now:
--   1. the identity of the person who placed the order
--   2. the company's declared marketplace contact
--   3. the oldest active owner
-- which is the same ladder the contact card uses, so the two agree by
-- construction rather than by coincidence.

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
       set invoice_no = coalesce(o.invoice_no,
             'MKI-' || lpad(nextval('public.marketplace_invoice_seq')::text, 6, '0')),
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
           'buyerPhone', r.phone_e164,
           'lang', coalesce(r.lang, 'sw')))
         , '[]'::jsonb)
    into v_rows
  from claimed c
  join public.companies b on b.id = c.buyer_company_id
  join public.companies s on s.id = c.supplier_company_id
  left join lateral (
    select w.phone_e164,
           case when coalesce(w.lang, p.lang, 'sw') = 'en' then 'en' else 'sw' end as lang
    from public.whatsapp_identities w
    left join public.profiles p on p.id = w.profile_id
    left join public.company_marketplace_settings ms on ms.company_id = c.buyer_company_id
    where w.company_id = c.buyer_company_id
      and w.verified_at is not null
      and w.revoked_at is null
      and w.opted_out_at is null
    order by
      -- Whoever actually placed the order comes first. Everything else is a
      -- fallback for an order placed by a machine or a departed member.
      (w.profile_id = c.buyer_profile_id) desc,
      (w.profile_id = ms.contact_profile_id) desc,
      w.verified_at
    limit 1
  ) r on true;

  return v_rows;
end $$;

revoke all on function public.marketplace_claim_invoices(integer) from public, anon, authenticated;
grant execute on function public.marketplace_claim_invoices(integer) to service_role;
