-- ============================================================================
-- Marketplace invoices: reachable from the app, and a schedule that keeps the
-- product index honest
-- ============================================================================

-- ── Read your own invoice ────────────────────────────────────────────────
-- The WhatsApp delivery is gated behind Meta template approval. This is not:
-- a party to the order can fetch the PDF straight from the app.
--
-- The path is `<order_id>/invoice.pdf`, so the first segment names the order
-- and the policy can decide from it alone. Both sides may read: the buyer
-- files it, the supplier proves what was agreed.
create policy "marketplace invoice readable by either party"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and exists (
      select 1
      from public.marketplace_order_requests o
      join public.company_members m
        on m.company_id in (o.buyer_company_id, o.supplier_company_id)
      where o.id = ((storage.foldername(name))[1])::uuid
        and m.profile_id = auth.uid()
        and m.deactivated_at is null
    )
  );

-- ── Keep the searchable index in step with the catalogue ─────────────────
-- Joining indexes a shop once. Products are added and archived afterwards, and
-- an index that only reflects the day a shop joined starts lying quietly.
-- Hourly is ample for a stock count taken at most daily.
select cron.unschedule('marketplace-reindex')
 where exists (select 1 from cron.job where jobname = 'marketplace-reindex');

select cron.schedule('marketplace-reindex', '7 * * * *',
  $job$select public.marketplace_reindex_all()$job$);

-- ── Prune expired pick-lists ─────────────────────────────────────────────
-- A consumed or expired selection has no further use, and the table is written
-- on every single search.
select cron.unschedule('marketplace-prune-selections')
 where exists (select 1 from cron.job where jobname = 'marketplace-prune-selections');

select cron.schedule('marketplace-prune-selections', '23 4 * * *',
  $job$delete from public.marketplace_pending_selections
        where created_at < now() - interval '7 days'$job$);
