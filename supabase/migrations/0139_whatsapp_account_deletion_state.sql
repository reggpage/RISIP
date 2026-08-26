alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check
  check (awaiting in (
    'language', 'project', 'payment_source', 'business', 'product_cost',
    'product_analytics', 'logout_confirm', 'account_delete_confirm'
  ));
