-- Preserve the remaining WhatsApp text history that predates durable chat rows.
-- whatsapp_ai_messages retains only a short rolling window, so this imports only
-- real, still-present exchanges and never fabricates older WhatsApp content.
insert into public.chat_messages
  (identity_id, company_id, wa_message_id, ordinal, role, content, chat_day, created_at)
select
  a.identity_id,
  a.company_id,
  a.wa_message_id,
  case when a.role = 'user' then 0 else 1 end,
  a.role,
  replace(a.content, chr(8212), ','),
  (a.created_at at time zone 'Africa/Dar_es_Salaam')::date,
  a.created_at
from public.whatsapp_ai_messages a
join public.whatsapp_messages w on w.wa_message_id = a.wa_message_id
where a.role in ('user', 'assistant')
  and not exists (
    select 1 from public.chat_messages m
    where m.wa_message_id = a.wa_message_id and m.role = a.role
  )
on conflict (wa_message_id, ordinal) do nothing;
