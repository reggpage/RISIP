-- Logout asks a question before it acts ("are you sure?", and sometimes "did
-- you mean cancel or leave?"), so it needs a slot in the conversation table like
-- every other pending question. Parking it here rather than in its own table
-- means an abandoned logout expires on the normal timer instead of leaving
-- somebody half-signed-out.
--
-- ROLLBACK: restore the 0081 constraint text (drop 'logout_confirm').

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check
  check (awaiting in (
    'language', 'project', 'payment_source', 'business', 'product_cost',
    'product_analytics', 'logout_confirm'
  ));
