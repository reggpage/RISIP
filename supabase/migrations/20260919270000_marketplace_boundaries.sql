-- ============================================================================
-- Two corrections: who may join, and when an invoice is raised
-- ============================================================================

-- ── 1. Platform operators do not join shops to the marketplace ───────────
-- Publishing your stock to other shops is a decision about your own business.
-- It belongs to the trader, not to whoever is on shift at the console. The
-- console is there to manage shops and read subscription revenue, not to reach
-- into their trading.
--
-- The tenant-facing marketplace_set_my_optin stays: the owner decides, from
-- their own app, for their own shop.
--
-- Reading stays too. An operator still needs to see that the marketplace is
-- healthy - how many shops joined, how many searches found nothing, how many
-- orders matched only fuzzily - because that is platform health, not a shop's
-- private business.
drop function if exists public.platform_admin_set_marketplace_optin(uuid, boolean, boolean, integer, text);

-- ── 2. The invoice is raised when the order is ACCEPTED, once ────────────
-- It was raised on 'delivered'. Acceptance is the moment the supplier commits
-- to supply and the amount stops moving, which is when a buyer wants something
-- to file — waiting for a delivery flag the supplier may never set leaves the
-- trade with no document at all.
--
-- invoice_sent_at is now part of the guard as well as invoice_built_at. Built
-- alone was already once-only, but an invoice is the kind of thing that must
-- never be sent twice even if a future retry path forgets that.
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
       set invoice_no = coalesce(
             o.invoice_no,
             private.marketplace_invoice_slug(
               (select name from public.companies where id = o.supplier_company_id))
             || '-' || to_char(now(), 'YYYYMM')
             || '-' || lpad(nextval('public.marketplace_invoice_seq')::text, 4, '0')),
           invoice_total = round(o.unit_price * o.quantity, 2),
           invoice_built_at = now()
     where o.id in (
       select x.id from public.marketplace_order_requests x
        where x.status in ('accepted', 'delivered')
          and x.invoice_built_at is null
          and x.invoice_sent_at is null
          and x.unit_price is not null
        order by x.accepted_at nulls last, x.delivered_at
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
           'deliveredAt', coalesce(c.delivered_at, c.accepted_at),
           'buyerCompanyId', c.buyer_company_id,
           'buyerName', b.name,
           'supplierName', s.name,
           'supplierContactName', sup.contact_name,
           'supplierPhone', sup.phone,
           'supplierWhatsapp', sup.whatsapp,
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
    order by (w.profile_id = c.buyer_profile_id) desc,
             (w.profile_id = ms.contact_profile_id) desc,
             w.verified_at
    limit 1
  ) r on true
  left join lateral (
    select pr.full_name as contact_name, pr.phone,
           (select w2.phone_e164 from public.whatsapp_identities w2
             where w2.company_id = c.supplier_company_id
               and w2.verified_at is not null
               and w2.revoked_at is null
               and w2.opted_out_at is null
             order by (w2.profile_id = pr.id) desc, w2.verified_at desc
             limit 1) as whatsapp
    from public.company_members cm
    left join public.company_marketplace_settings ms2 on ms2.company_id = c.supplier_company_id
    join public.profiles pr on pr.id = cm.profile_id
    where cm.company_id = c.supplier_company_id
      and cm.deactivated_at is null
    order by (cm.profile_id = ms2.contact_profile_id) desc,
             (cm.role = 'owner') desc, cm.joined_at
    limit 1
  ) sup on true;

  return v_rows;
end $$;

revoke all on function public.marketplace_claim_invoices(integer) from public, anon, authenticated;
grant execute on function public.marketplace_claim_invoices(integer) to service_role;
