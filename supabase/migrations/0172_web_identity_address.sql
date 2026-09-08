-- The live database has an E.164 constraint added outside the numbered history.
-- Preserve it for real numbers, and admit only the caller-bound web namespace.
alter table public.whatsapp_identities drop constraint if exists whatsapp_identities_phone_e164_format;
alter table public.whatsapp_identities add constraint whatsapp_identities_phone_e164_format check (
  phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  or (phone_e164 = 'web:' || profile_id::text and verified_at is null and wa_id is null)
) not valid;
