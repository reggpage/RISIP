-- "Nimeuza soseji" names the goods and not how many.
--
-- Every such message used to reach the record parser, which asked for the
-- AMOUNT — the money — because that is the field it knew was missing. A
-- shopkeeper answering "5" to "how much?" has said five shillings, and the sale
-- that followed was for five shillings.
--
-- Asking the right question needs somewhere to remember that it was asked, so
-- whatsapp_conversations gains one more awaiting value. Nothing else changes:
-- same table, same identity scoping, same expires_at, same options column.
--
-- What gets stored there is deliberately thin — the intent, the wording of the
-- goods, the customer, the payment method if already stated. No price, no
-- total, no stock effect. When the number arrives it is all resolved and priced
-- again from the company's current data, exactly as if it had been one message.
--
-- ROLLBACK:
--   alter table public.whatsapp_conversations drop constraint whatsapp_conversations_awaiting_check;
--   alter table public.whatsapp_conversations add constraint whatsapp_conversations_awaiting_check
--     check (awaiting = any (array['language','project','payment_source','business',
--                                  'product_cost','product_analytics','logout_confirm']));

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_awaiting_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_awaiting_check check (
    awaiting = any (array[
      'language', 'project', 'payment_source', 'business',
      'product_cost', 'product_analytics', 'logout_confirm',
      'daily_record_quantity'
    ])
  );
