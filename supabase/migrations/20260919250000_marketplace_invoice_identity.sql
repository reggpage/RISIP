-- ============================================================================
-- Invoice identity: a number a person can file, and the contact to call
-- ============================================================================
-- "MKI-000001" tells a trader nothing. Six months later, looking for what they
-- bought from a particular shop, the number has to name that shop. Format is
-- now SUPPLIER-YYYYMM-NNNN, e.g. RISIPUITEST-202609-0001 — sortable, unique,
-- and readable across a counter or down a phone line.
--
-- The invoice also carries the supplier's phone and WhatsApp. An invoice whose
-- whole purpose is a trade between two shops, that does not say how to reach
-- the other shop, sends the trader back to the app to find it.

create or replace function private.marketplace_invoice_slug(p_name text)
returns text
language sql immutable
set search_path = pg_catalog, public
as $$
  -- Letters and digits only, upper case, capped. A shop called "Mama Neema's
  -- Duka (Kariakoo)" becomes MAMANEEMASDUK — still recognisably itself.
  select upper(left(regexp_replace(coalesce(p_name, 'SHOP'), '[^a-zA-Z0-9]', '', 'g'), 12));
$$;

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
           -- Who to call about this invoice, and the number that can take a
           -- WhatsApp. They are frequently not the same number.
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
