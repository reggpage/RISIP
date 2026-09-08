-- Run after 0176 inside the SAME transaction; the caller must ROLLBACK.
select set_config('request.jwt.claim.sub','04d71cfe-430d-4da2-9474-86a833b05762',true);
set local role authenticated;
do $$
declare first_acceptance timestamptz; failure text;
begin
  if has_table_privilege('authenticated','public.legal_acceptances','INSERT') then raise exception 'direct write exposed'; end if;
  if has_function_privilege('anon','public.accept_legal_terms(text,boolean,text)','EXECUTE') then raise exception 'anonymous acceptance exposed'; end if;
  begin
    perform public.accept_legal_terms('2026-09-08',false,'sw');
    raise exception 'false acceptance allowed';
  exception when others then
    get stacked diagnostics failure=message_text;
    if failure <> 'explicit_acceptance_required' then raise; end if;
  end;
  begin
    perform public.accept_legal_terms('old-version',true,'sw');
    raise exception 'stale acceptance allowed';
  exception when others then
    get stacked diagnostics failure=message_text;
    if failure <> 'policy_version_changed' then raise; end if;
  end;
  perform public.accept_legal_terms('2026-09-08',true,'sw');
  select accepted_at into strict first_acceptance from public.legal_acceptances where profile_id=auth.uid() and version='2026-09-08';
  if (public.my_legal_acceptance()->>'accepted')::boolean is distinct from true then raise exception 'acceptance not visible'; end if;
  perform public.accept_legal_terms('2026-09-08',true,'en');
  if not exists(select 1 from public.legal_acceptances where profile_id=auth.uid() and accepted_at=first_acceptance and language='sw') then raise exception 'retry replaced evidence'; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  if exists(select 1 from public.legal_acceptances) then raise exception 'another profile can read acceptance'; end if;
  if (public.my_legal_acceptance()->>'accepted')::boolean then raise exception 'acceptance leaked across users'; end if;
  begin
    perform public.accept_legal_terms('2026-09-08',true,'sw');
    raise exception 'missing profile allowed';
  exception when others then
    get stacked diagnostics failure=message_text;
    if failure <> 'authentication_required' then raise; end if;
  end;
end $$;
reset role;
