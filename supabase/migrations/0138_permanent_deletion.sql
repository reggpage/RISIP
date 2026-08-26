-- RISIP permanent deletion boundary.
--
-- Database rows are removed in one transaction. Storage objects and the
-- auth.users row are deliberately handled by the privileged Edge functions
-- after this transaction succeeds: Storage is not transactional, and auth is
-- the last credential we need while validating the request.

-- A person deleting their account must not make historical rows in another
-- business undeletable. These are actor/audit references, not ownership
-- references, so a missing actor is represented by NULL.
do $$
declare
  v_table regclass;
  v_column name;
  v_constraint name;
  v_relname name;
begin
  for v_table, v_column in
    select * from (values
      ('public.projects'::regclass, 'created_by'::name),
      ('public.invite_links'::regclass, 'created_by'::name),
      ('public.receipts'::regclass, 'uploaded_by'::name),
      ('public.invoices'::regclass, 'generated_by'::name),
      ('public.supplier_connections'::regclass, 'approved_by'::name),
      ('public.scanned_documents'::regclass, 'created_by'::name),
      ('public.petty_cash_accounts'::regclass, 'user_id'::name),
      ('public.petty_cash_transactions'::regclass, 'created_by'::name),
      ('public.staff_retirements'::regclass, 'staff_id'::name),
      ('public.staff_retirement_documents'::regclass, 'created_by'::name),
      ('public.reimbursement_payouts'::regclass, 'paid_to'::name),
      ('public.reimbursement_payouts'::regclass, 'paid_by'::name),
      ('public.product_costs'::regclass, 'recorded_by'::name),
      ('public.product_archives'::regclass, 'archived_by'::name),
      ('public.product_events'::regclass, 'actor_id'::name),
      ('public.stock_counts'::regclass, 'counted_by'::name),
      ('public.product_selling_prices'::regclass, 'recorded_by'::name),
      ('public.product_units'::regclass, 'created_by'::name),
      ('public.product_unit_audit_log'::regclass, 'actor_id'::name),
      ('public.product_combos'::regclass, 'created_by'::name),
      ('public.business_vocabulary'::regclass, 'created_by'::name),
      ('public.business_vocabulary_audit_log'::regclass, 'actor_id'::name),
      ('public.whole_animal_procurements'::regclass, 'created_by'::name),
      ('public.whole_animal_breakdowns'::regclass, 'created_by'::name),
      ('public.company_invite_codes'::regclass, 'created_by'::name)
    ) as refs(table_name, column_name)
  loop
    v_constraint := null;
    v_relname := null;
    select c.conname, cl.relname
      into v_constraint, v_relname
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_attribute a on a.attrelid = c.conrelid
                           and a.attnum = c.conkey[1]
     where c.conrelid = v_table
       and c.confrelid = 'public.profiles'::regclass
       and c.contype = 'f'
       and cardinality(c.conkey) = 1
       and a.attname = v_column;

    if v_constraint is not null then
      execute format('alter table %s drop constraint %I', v_table, v_constraint);
      execute format('alter table %s alter column %I drop not null', v_table, v_column);
      execute format(
        'alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
        v_table, v_relname || '_' || v_column || '_delete_set_null_fkey', v_column
      );
    end if;
  end loop;
end $$;

-- The legacy pointer is retained for old clients, but deleting a business must
-- never cascade into the person's auth/profile row. active_company_id already
-- has the right nullable shape; SET NULL protects direct SQL deletes too.
alter table public.profiles alter column company_id drop not null;
alter table public.profiles drop constraint if exists profiles_company_id_fkey;
alter table public.profiles add constraint profiles_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_active_company_id_fkey;
alter table public.profiles add constraint profiles_active_company_id_fkey
  foreign key (active_company_id) references public.companies(id) on delete set null;

create or replace function public.delete_company_data(
  p_company_id uuid,
  p_allow_orphan_profiles boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_profile uuid;
  v_fallback uuid;
  v_profiles uuid[] := '{}'::uuid[];
  v_table name;
  v_count bigint;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service role required' using errcode = '42501', hint = 'service_role_required';
  end if;
  if p_company_id is null then
    raise exception 'company id is required' using errcode = '22004', hint = 'company_required';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    return jsonb_build_object('deleted', false, 'company_id', p_company_id, 'already_absent', true);
  end if;

  -- Detach every profile before deleting the company. A business delete is
  -- fail-closed when somebody would otherwise lose their only active home.
  select coalesce(array_agg(x.id order by x.id), '{}') into v_profiles
    from (
      select distinct p.id
        from public.profiles p
        left join public.company_members m on m.profile_id = p.id
       where m.company_id = p_company_id
          or p.company_id = p_company_id
          or p.active_company_id = p_company_id
    ) x;

  foreach v_profile in array v_profiles loop
    select m.company_id into v_fallback
      from public.company_members m
     where m.profile_id = v_profile
       and m.company_id <> p_company_id
       and m.deactivated_at is null
     order by (m.company_id = (select active_company_id from public.profiles where id = v_profile)) desc,
              m.joined_at asc, m.company_id
     limit 1;

    if v_fallback is null and not p_allow_orphan_profiles then
      raise exception 'account deletion is required before deleting this sole business'
        using errcode = 'P0001', hint = 'account_deletion_required';
    end if;

    if v_fallback is not null then
      update public.whatsapp_identities
         set company_id = v_fallback
       where profile_id = v_profile and company_id = p_company_id;
    end if;

    update public.profiles
       set company_id = v_fallback,
           active_company_id = case
             when active_company_id = p_company_id then v_fallback
             else active_company_id
           end
     where id = v_profile;
  end loop;

  -- These logs intentionally use SET NULL in the historical schema. Delete
  -- them explicitly so a company cannot leave a tenant-identifying orphan.
  delete from public.whatsapp_messages where company_id = p_company_id;
  delete from public.whatsapp_audit_log where company_id = p_company_id;
  delete from public.whatsapp_conversations where company_id = p_company_id;
  delete from public.whatsapp_ai_messages where company_id = p_company_id;
  delete from public.whatsapp_ai_threads where company_id = p_company_id;
  delete from public.whatsapp_notification_deliveries where company_id = p_company_id;
  delete from public.whatsapp_notification_consent_log where company_id = p_company_id;

  -- Remove restrictive child links before their parent records.
  delete from public.whole_animal_breakdown_outputs
   where breakdown_daily_record_id in (
     select daily_record_id from public.whole_animal_breakdowns where company_id = p_company_id
   );
  delete from public.whole_animal_breakdowns where company_id = p_company_id;
  delete from public.whole_animal_procurements where company_id = p_company_id;
  delete from public.staff_retirement_receipts
   where retirement_id in (select id from public.staff_retirements where company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.reimbursement_payout_items
   where payout_id in (select id from public.reimbursement_payouts where company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.invoice_receipts
   where invoice_id in (select i.id from public.invoices i join public.projects p on p.id = i.project_id where p.company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.petty_cash_transactions
   where account_id in (select id from public.petty_cash_accounts where company_id = p_company_id)
      or receipt_id in (select id from public.receipts where company_id = p_company_id);
  delete from public.staff_retirement_documents where company_id = p_company_id;
  delete from public.staff_retirements where company_id = p_company_id;
  delete from public.receipts where company_id = p_company_id;
  delete from public.daily_records where company_id = p_company_id;
  delete from public.projects where company_id = p_company_id;

  -- All remaining company-owned tables either cascade from companies or are
  -- direct company logs/configuration. Deleting the company removes those rows
  -- in the same transaction, including memberships, invites, products, stock,
  -- debts/payables, supplier claims, reports, and WhatsApp link state.
  delete from public.companies where id = p_company_id;

  -- Guard against future direct company_id tables being added with SET NULL.
  for v_table in
    select distinct c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'companies'
  loop
    execute format('select count(*) from public.%I where company_id = $1', v_table)
      into v_count using p_company_id;
    if v_count > 0 then
      raise exception 'company deletion left rows in %.company_id', v_table
        using errcode = 'P0001', hint = 'company_delete_incomplete';
    end if;
  end loop;

  return jsonb_build_object('deleted', true, 'company_id', p_company_id,
    'provider_backups', 'live application data deleted; provider backup retention is outside Risip control');
end;
$fn$;

create or replace function public.delete_account_data(
  p_profile_id uuid,
  p_owned_company_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_expected uuid[] := '{}'::uuid[];
  v_requested uuid[] := coalesce(p_owned_company_ids, '{}');
  v_company uuid;
  v_duplicate_count integer;
  v_phone text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service role required' using errcode = '42501', hint = 'service_role_required';
  end if;
  select phone into v_phone from public.profiles where id = p_profile_id;
  if p_profile_id is null or not found then
    raise exception 'profile not found' using errcode = 'P0001', hint = 'profile_not_found';
  end if;

  select coalesce(array_agg(m.company_id order by m.company_id), '{}')
    into v_expected
    from public.company_members m
   where m.profile_id = p_profile_id and m.role = 'owner';

  select count(*) - count(distinct id) into v_duplicate_count from unnest(v_requested) ids(id);
  if v_duplicate_count <> 0 or v_requested <> v_expected then
    raise exception 'all owned businesses must be explicitly selected'
      using errcode = 'P0001', hint = 'owned_companies_must_be_explicit';
  end if;

  foreach v_company in array v_expected loop
    perform public.delete_company_data(v_company, true);
  end loop;

  -- Personal channel history and credentials are removed even for businesses
  -- the person only joined. Other businesses and their finance rows remain.
  delete from public.whatsapp_messages where profile_id = p_profile_id;
  delete from public.whatsapp_audit_log where profile_id = p_profile_id;
  delete from public.whatsapp_conversations where profile_id = p_profile_id;
  delete from public.whatsapp_ai_messages where profile_id = p_profile_id;
  delete from public.whatsapp_ai_threads where profile_id = p_profile_id;
  delete from public.whatsapp_notification_consent_log where profile_id = p_profile_id;
  delete from public.whatsapp_identities where profile_id = p_profile_id;
  delete from public.whatsapp_link_tokens where profile_id = p_profile_id;
  delete from public.wa_login_tokens where profile_id = p_profile_id;
  delete from public.product_cost_prompts where profile_id = p_profile_id;
  delete from public.receipt_aliases where user_id = p_profile_id;
  if v_phone is not null then
    delete from public.whatsapp_onboarding where phone_e164 = v_phone;
  end if;
  delete from public.company_members where profile_id = p_profile_id;
  delete from public.profiles where id = p_profile_id;

  return jsonb_build_object('deleted', true, 'profile_id', p_profile_id,
    'owned_companies', v_expected,
    'provider_backups', 'live application data deleted; provider backup retention is outside Risip control');
end;
$fn$;

revoke all on function public.delete_company_data(uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_company_data(uuid, boolean) to service_role;
revoke all on function public.delete_account_data(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid, uuid[]) to service_role;
