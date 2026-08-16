-- Minting an invite from WhatsApp.
--
-- create_company_invite_code already exists and is right; it is simply out of
-- reach from WhatsApp, where the caller is a phone number rather than a signed-in
-- session. This is the same rule enforced the same way, for the service role.
--
-- Risip does NOT send the invite itself. Meta will not deliver a free-form
-- message to a number that has not written to you first — it would need an
-- approved template and a per-message fee — and an unsolicited invite from the
-- one Risip number puts that number's standing at risk for every business on it.
-- Worse, a single mistyped digit would hand a stranger a link into the owner's
-- books. So the code goes back to the OWNER, written out ready to forward, and
-- the owner picks the person out of their own contacts. They see who they are
-- sending it to; Risip never could.

create or replace function public.wa_create_invite_code(
  p_phone text,
  p_role text default 'worker',
  p_days integer default 7
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile uuid; v_company uuid; v_role text; v_name text;
  v_code text; v_expires timestamptz;
begin
  select i.profile_id, p.active_company_id, m.role, c.name
    into v_profile, v_company, v_role, v_name
    from whatsapp_identities i
    join profiles p on p.id = i.profile_id
    join company_members m
      on m.profile_id = p.id and m.company_id = p.active_company_id and m.deactivated_at is null
    join companies c on c.id = p.active_company_id
   where i.phone_e164 = p_phone and i.revoked_at is null;

  if v_profile is null then
    raise exception 'this number is not linked' using errcode = 'P0001', hint = 'not_linked';
  end if;
  -- The same rule as the web: only an owner brings somebody into the company.
  if v_role <> 'owner' then
    raise exception 'only the owner may invite somebody'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_role not in ('worker', 'accountant') then
    raise exception 'an invite can only be for a worker or an accountant'
      using errcode = 'P0001', hint = 'bad_role';
  end if;

  -- No 0/O/1/I/L: this gets read aloud and typed on a phone keypad.
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                             (floor(random() * 31) + 1)::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from company_invite_codes where code = v_code);
  end loop;

  v_expires := now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)));

  -- One use. An invite forwarded on to a group chat should not keep letting
  -- people in, and the owner can always mint another in one message.
  insert into company_invite_codes (company_id, code, role, expires_at, max_uses, created_by)
  values (v_company, v_code, p_role::user_role, v_expires, 1, v_profile);

  return jsonb_build_object(
    'code', v_code,
    'role', p_role,
    'company_name', coalesce(v_name, ''),
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.wa_create_invite_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.wa_create_invite_code(text, text, integer) to service_role;
