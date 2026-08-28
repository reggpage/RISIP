-- One more parked state: the day, waiting to be closed.
--
-- The awaiting column is deliberately a closed list — a typo in a state name
-- would otherwise park a conversation nothing knows how to answer, and the
-- shopkeeper would be stuck until it expired. Adding a state means saying so
-- here, which is the point.
--
-- 'day_close' holds the draft of everything recorded today while the worker
-- reads it. Nothing is written to the ledger until they answer NDIYO.

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check
  check (awaiting = any (array[
    'language'::text,
    'project'::text,
    'payment_source'::text,
    'business'::text,
    'product_cost'::text,
    'product_analytics'::text,
    'logout_confirm'::text,
    'account_delete_confirm'::text,
    'day_close'::text
  ]));
