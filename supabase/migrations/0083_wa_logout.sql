-- Logging out of WhatsApp, which until now did not exist.
--
-- MEASURED GAP: "logout", "nataka kutoka" and "sign out" matched nothing at all.
-- Worse, bare "toka" matched isStopCommand — the cancel-a-draft command — so a
-- person typing "toka" meaning "let me out" was told their draft was cancelled
-- and stayed fully linked.
--
-- WHAT LOGOUT MEANS HERE, chosen deliberately: the phone number IS the
-- credential, so signing out has to mean UNLINKING it. The real reasons someone
-- asks are "my phone was stolen" and "this employee has left" — clearing a chat
-- session would answer neither, because the number could still record sales
-- the next morning.
--
-- WHAT IT REMOVES: the identity, any unused login link, any unused linking
-- token, the conversation state, and the assistant's memory of the thread.
--
-- WHAT IT KEEPS, on purpose: the profile, the company membership, and every
-- receipt, daily record and audit row that person ever created. Leaving a
-- business is not the same as erasing what you did there, and the books must not
-- move because somebody changed phone.
--
-- After this the number is unknown again, so its next message starts onboarding.
-- Re-linking needs a fresh invite or link code — which is the point.
--
-- ROLLBACK
--   drop function public.wa_logout(text);
--   -- Identities already revoked stay revoked; re-link through the normal flow.

create or replace function public.wa_logout(p_phone text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_identity uuid; v_profile uuid; v_company text; v_name text; v_changed int;
begin
  select i.id, i.profile_id into v_identity, v_profile
    from whatsapp_identities i
   where i.phone_e164 = p_phone and i.revoked_at is null;
  if v_identity is null then
    raise exception 'this number is not linked'
      using errcode = 'P0001', hint = 'not_linked';
  end if;

  -- Read before revoking, so the goodbye can name the business they are leaving.
  select p.full_name, c.name into v_name, v_company
    from profiles p
    left join companies c on c.id = p.active_company_id
   where p.id = v_profile;

  update whatsapp_identities set revoked_at = now(), updated_at = now()
   where id = v_identity;
  get diagnostics v_changed = row_count;

  -- Anything that could still let this number back in, closed in the same breath.
  update whatsapp_link_tokens set revoked_at = now()
   where profile_id = v_profile and used_at is null and revoked_at is null;
  update wa_login_tokens set used_at = now()
   where profile_id = v_profile and used_at is null;

  delete from whatsapp_conversations where identity_id = v_identity;
  delete from whatsapp_ai_threads    where identity_id = v_identity;
  delete from whatsapp_ai_messages   where identity_id = v_identity;
  delete from whatsapp_onboarding    where phone_e164 = p_phone;

  return jsonb_build_object(
    'revoked', v_changed, 'person', v_name, 'company_name', v_company);
end $$;

revoke execute on function public.wa_logout(text) from public, anon, authenticated;
