-- Supplier claims finance-control hardening.
--
-- Supplier claims remain copied-data AP inbox items in this pass. They do not
-- link to internal receipts, reimbursements, petty cash, staff retirements or
-- invoices, and these RPCs do not post expenses.

create extension if not exists pgcrypto;

alter table public.supplier_claims
  add column if not exists viewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists disputed_by uuid references public.profiles(id) on delete set null,
  add column if not exists disputed_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists paid_amount_snapshot numeric(14,2),
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payment_note text,
  add column if not exists decision_reason text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'supplier_claims_payment_method_check'
       and conrelid = 'public.supplier_claims'::regclass
  ) then
    alter table public.supplier_claims
      add constraint supplier_claims_payment_method_check
      check (payment_method is null or payment_method in ('cash', 'mobile_money', 'bank', 'other'));
  end if;
end $$;

update public.supplier_claims
   set paid_amount_snapshot = coalesce(paid_amount_snapshot, amount)
 where status in ('paid'::public.supplier_claim_status, 'received_confirmed'::public.supplier_claim_status)
   and paid_amount_snapshot is null;

create index if not exists supplier_claims_target_payment_idx
  on public.supplier_claims(target_company_id, status, paid_at desc);

create table if not exists public.supplier_claim_audit_log (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.supplier_claims(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  from_status public.supplier_claim_status,
  to_status public.supplier_claim_status,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint supplier_claim_audit_log_action_check check (
    action in (
      'legacy_imported',
      'viewed',
      'approved_for_payment',
      'disputed',
      'paid',
      'received_confirmed'
    )
  )
);

create index if not exists supplier_claim_audit_claim_idx
  on public.supplier_claim_audit_log(claim_id, created_at desc);

create index if not exists supplier_claim_audit_company_idx
  on public.supplier_claim_audit_log(company_id, created_at desc);

alter table public.supplier_claim_audit_log enable row level security;

drop policy if exists supplier_claim_audit_select on public.supplier_claim_audit_log;
create policy supplier_claim_audit_select on public.supplier_claim_audit_log
  for select to authenticated
  using (
    exists (
      select 1
        from public.supplier_claims c
       where c.id = supplier_claim_audit_log.claim_id
         and c.target_company_id = private.auth_company_id()
         and private.auth_role() in ('owner', 'accountant')
    )
  );

insert into public.supplier_claim_audit_log
  (claim_id, company_id, actor_id, action, from_status, to_status, metadata, created_at)
select c.id, c.target_company_id, null, 'legacy_imported', null, c.status,
       jsonb_build_object('source', '0073_backfill'), c.created_at
  from public.supplier_claims c
 where not exists (
   select 1
     from public.supplier_claim_audit_log a
    where a.claim_id = c.id
      and a.action = 'legacy_imported'
 );

create or replace function private.supplier_claim_actor_name(p_actor uuid)
returns text
language sql
stable
as $$
  select coalesce((select full_name from public.profiles where id = p_actor), 'Finance');
$$;

create or replace function private.supplier_claim_notify_finance(
  p_company uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select p_company, p.id, p_actor, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb)
    from public.profiles p
   where p.company_id = p_company
     and p.role in ('owner', 'accountant')
     and p.deactivated_at is null
     and p.id is distinct from p_actor;
$$;

create or replace function private.supplier_claim_add_supplier_message(
  p_claim uuid,
  p_author_name text,
  p_message text
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.supplier_claim_messages (claim_id, author_side, author_name, message)
  values (p_claim, 'company', nullif(btrim(p_author_name), ''), btrim(p_message));
$$;

create or replace function private.supplier_claim_require_finance()
returns void
language plpgsql
stable
as $$
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may manage supplier claims'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
end $$;

create or replace function private.supplier_claim_require_reason(p_reason text, p_message text)
returns text
language plpgsql
stable
as $$
declare
  v_reason text;
begin
  if not private.is_meaningful_reason(p_reason) then
    raise exception '%', p_message using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  v_reason := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  return v_reason;
end $$;

create or replace function public.decide_supplier_claim(
  p_claim_id uuid,
  p_action text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c record;
  v_actor uuid := auth.uid();
  v_to public.supplier_claim_status;
  v_action text;
  v_reason text;
  v_actor_name text := private.supplier_claim_actor_name(auth.uid());
  v_message text;
begin
  perform private.supplier_claim_require_finance();

  if p_action not in ('viewed', 'approve', 'approved_for_payment', 'dispute', 'disputed') then
    raise exception 'unknown supplier claim action %', p_action using errcode = 'P0001';
  end if;

  select * into c
    from public.supplier_claims
   where id = p_claim_id
   for update;

  if not found then
    raise exception 'supplier claim not found' using errcode = 'P0001';
  end if;
  if c.target_company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;

  if p_action = 'viewed' then
    if c.status <> 'submitted'::public.supplier_claim_status then
      raise exception 'only a submitted supplier claim can be marked viewed'
        using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'viewed'::public.supplier_claim_status;
    v_action := 'viewed';
    v_message := 'Finance has viewed supplier claim "' || c.title || '".';
  elsif p_action in ('approve', 'approved_for_payment') then
    if c.status not in ('submitted'::public.supplier_claim_status, 'viewed'::public.supplier_claim_status) then
      raise exception 'only submitted or viewed supplier claims can be approved for payment'
        using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'approved_for_payment'::public.supplier_claim_status;
    v_action := 'approved_for_payment';
    v_message := 'Supplier claim "' || c.title || '" was approved for payment.';
  else
    if c.status not in (
      'submitted'::public.supplier_claim_status,
      'viewed'::public.supplier_claim_status,
      'approved_for_payment'::public.supplier_claim_status
    ) then
      raise exception 'only submitted, viewed, or approved supplier claims can be disputed'
        using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_reason := private.supplier_claim_require_reason(
      p_reason,
      'Please write a clear reason with at least 3 meaningful words, so the supplier dispute can be audited.'
    );
    v_to := 'disputed'::public.supplier_claim_status;
    v_action := 'disputed';
    v_message := 'Supplier claim "' || c.title || '" was disputed. Reason: ' || v_reason;
  end if;

  update public.supplier_claims
     set status = v_to,
         viewed_at = case when v_to = 'viewed' then coalesce(viewed_at, now()) else viewed_at end,
         viewed_by = case when v_to = 'viewed' then coalesce(viewed_by, v_actor) else viewed_by end,
         approved_at = case when v_to = 'approved_for_payment' then now() else approved_at end,
         approved_by = case when v_to = 'approved_for_payment' then v_actor else approved_by end,
         disputed_at = case when v_to = 'disputed' then now() else disputed_at end,
         disputed_by = case when v_to = 'disputed' then v_actor else disputed_by end,
         decision_reason = case when v_to = 'disputed' then v_reason else null end,
         updated_at = now()
   where id = p_claim_id;

  insert into public.supplier_claim_audit_log
    (claim_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_claim_id, c.target_company_id, v_actor, v_action, c.status, v_to, v_reason);

  perform private.supplier_claim_add_supplier_message(p_claim_id, v_actor_name, v_message);

  return v_to::text;
end $$;

revoke execute on function public.decide_supplier_claim(uuid, text, text) from public, anon;
grant execute on function public.decide_supplier_claim(uuid, text, text) to authenticated;

create or replace function public.mark_supplier_claim_paid(
  p_claim_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c record;
  v_actor uuid := auth.uid();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_actor_name text := private.supplier_claim_actor_name(auth.uid());
begin
  perform private.supplier_claim_require_finance();

  if p_amount is null or p_amount <= 0 then
    raise exception 'enter a positive payment amount' using errcode = 'P0001', hint = 'bad_amount';
  end if;
  if p_method is null or p_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'choose a payment method' using errcode = 'P0001', hint = 'bad_payment_method';
  end if;

  select * into c
    from public.supplier_claims
   where id = p_claim_id
   for update;

  if not found then
    raise exception 'supplier claim not found' using errcode = 'P0001';
  end if;
  if c.target_company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if c.status <> 'approved_for_payment'::public.supplier_claim_status then
    raise exception 'only a supplier claim approved for payment can be marked paid'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.supplier_claims
     set status = 'paid'::public.supplier_claim_status,
         paid_at = now(),
         paid_by = v_actor,
         paid_amount_snapshot = p_amount,
         payment_method = p_method,
         payment_reference = v_reference,
         payment_note = v_note,
         decision_reason = v_note,
         updated_at = now()
   where id = p_claim_id;

  insert into public.supplier_claim_audit_log
    (claim_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (p_claim_id, c.target_company_id, v_actor, 'paid', c.status, 'paid'::public.supplier_claim_status,
     v_note,
     jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', v_reference));

  perform private.supplier_claim_add_supplier_message(
    p_claim_id,
    v_actor_name,
    'Supplier claim "' || c.title || '" was marked paid for TSh '
      || trim(to_char(p_amount, 'FM999,999,999,999,990'))
      || coalesce('. Reference: ' || v_reference, '')
      || coalesce('. Note: ' || v_note, '')
  );

  return jsonb_build_object('status', 'paid', 'claim_id', p_claim_id, 'amount', p_amount);
end $$;

revoke execute on function public.mark_supplier_claim_paid(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.mark_supplier_claim_paid(uuid, numeric, text, text, text) to authenticated;

create or replace function public.confirm_supplier_claim_received(
  p_claim_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c record;
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor_name text := private.supplier_claim_actor_name(auth.uid());
begin
  perform private.supplier_claim_require_finance();

  select * into c
    from public.supplier_claims
   where id = p_claim_id
   for update;

  if not found then
    raise exception 'supplier claim not found' using errcode = 'P0001';
  end if;
  if c.target_company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if c.status <> 'paid'::public.supplier_claim_status then
    raise exception 'only a paid supplier claim can be confirmed received'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.supplier_claims
     set status = 'received_confirmed'::public.supplier_claim_status,
         received_confirmed_at = now(),
         decision_reason = v_reason,
         updated_at = now()
   where id = p_claim_id;

  insert into public.supplier_claim_audit_log
    (claim_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_claim_id, c.target_company_id, v_actor, 'received_confirmed', c.status,
     'received_confirmed'::public.supplier_claim_status, v_reason);

  perform private.supplier_claim_add_supplier_message(
    p_claim_id,
    v_actor_name,
    'Supplier payment receipt was confirmed for claim "' || c.title || '".'
      || coalesce(' Note: ' || v_reason, '')
  );

  perform private.supplier_claim_notify_finance(
    c.target_company_id, v_actor, 'supplier_claim_received_confirmed',
    'Supplier claim payment received',
    'Payment receipt was confirmed for supplier claim "' || c.title || '".',
    jsonb_build_object('claim_id', p_claim_id, 'amount', c.paid_amount_snapshot)
  );

  return 'received_confirmed';
end $$;

revoke execute on function public.confirm_supplier_claim_received(uuid, text) from public, anon;
grant execute on function public.confirm_supplier_claim_received(uuid, text) to authenticated;

-- RLS hardening. Public supplier access remains through SECURITY DEFINER RPCs
-- and the edge function only; direct table access is finance-only.
drop policy if exists supplier_connections_internal_select on public.supplier_connections;
create policy supplier_connections_internal_select on public.supplier_connections
  for select to authenticated
  using (
    target_company_id = private.auth_company_id()
    and private.auth_role() in ('owner', 'accountant')
  );

drop policy if exists supplier_connections_internal_update on public.supplier_connections;
create policy supplier_connections_internal_update on public.supplier_connections
  for update to authenticated
  using (
    target_company_id = private.auth_company_id()
    and private.auth_role() in ('owner', 'accountant')
  )
  with check (
    target_company_id = private.auth_company_id()
    and private.auth_role() in ('owner', 'accountant')
  );

drop policy if exists supplier_claims_internal_select on public.supplier_claims;
create policy supplier_claims_internal_select on public.supplier_claims
  for select to authenticated
  using (
    target_company_id = private.auth_company_id()
    and private.auth_role() in ('owner', 'accountant')
  );

drop policy if exists supplier_claims_internal_update on public.supplier_claims;

drop policy if exists supplier_claim_receipts_internal_select on public.supplier_claim_receipts;
create policy supplier_claim_receipts_internal_select on public.supplier_claim_receipts
  for select to authenticated
  using (
    exists (
      select 1
        from public.supplier_claims c
       where c.id = claim_id
         and c.target_company_id = private.auth_company_id()
         and private.auth_role() in ('owner', 'accountant')
    )
  );

drop policy if exists supplier_claim_messages_internal_select on public.supplier_claim_messages;
create policy supplier_claim_messages_internal_select on public.supplier_claim_messages
  for select to authenticated
  using (
    exists (
      select 1
        from public.supplier_claims c
       where c.id = claim_id
         and c.target_company_id = private.auth_company_id()
         and private.auth_role() in ('owner', 'accountant')
    )
  );

