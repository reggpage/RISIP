-- Record what Meta said, not what we assumed. Two invoices have now been
-- reported "sent" while the trader saw nothing; without the provider id and
-- the number it went to, there is nothing to check against.
alter table public.marketplace_order_requests
  add column if not exists invoice_message_id text,
  add column if not exists invoice_sent_to    text;

create or replace function public.marketplace_mark_invoice(
  p_order_id   uuid,
  p_path       text,
  p_sent       boolean,
  p_error      text default null,
  p_message_id text default null,
  p_sent_to    text default null
) returns void
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.marketplace_order_requests
     set invoice_path = coalesce(p_path, invoice_path),
         invoice_sent_at = case when p_sent then now() else invoice_sent_at end,
         invoice_error = left(p_error, 300),
         invoice_message_id = coalesce(p_message_id, invoice_message_id),
         invoice_sent_to = coalesce(p_sent_to, invoice_sent_to)
   where id = p_order_id;
$$;

revoke all on function public.marketplace_mark_invoice(uuid, text, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.marketplace_mark_invoice(uuid, text, boolean, text, text, text)
  to service_role;
