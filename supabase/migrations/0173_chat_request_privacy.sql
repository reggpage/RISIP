-- Idempotency needs an equality fingerprint, never another plaintext copy.
alter table public.whatsapp_messages rename column input_text to request_hash;
update public.whatsapp_messages set request_hash=encode(extensions.digest(convert_to(request_hash,'UTF8'),'sha256'),'hex')
  where transport='web' and request_hash is not null;
alter table public.chat_messages add column sensitive boolean not null default false;
comment on column public.whatsapp_messages.request_hash is 'SHA-256 of normalized web input for replay equality. Never stores link tokens or raw input.';
