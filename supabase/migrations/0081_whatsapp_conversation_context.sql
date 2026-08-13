-- Allow the conversation states already used by the webhook plus short-lived
-- product analytics context. This table remains service-role only under RLS.
alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check
  check (awaiting in (
    'language', 'project', 'payment_source', 'business', 'product_cost',
    'product_analytics'
  ));
