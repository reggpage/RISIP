-- Staff retirements become a finance-control workflow here.
--
-- A retirement is NOT a new expense. It is a controlled settlement/review wrapper
-- around receipts that already counted when they were confirmed. Therefore this
-- migration does not touch project/dashboard totals; it only controls who may
-- submit/decide/pay/acknowledge a retirement and freezes linked receipt money.

do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typnamespace = 'public'::regnamespace
       and t.typname = 'staff_retirement_status'
       and e.enumlabel = 'rejected'
  ) then
    create type public.staff_retirement_status_v2 as enum (
      'submitted',
      'viewed',
      'approved',
      'changes_requested',
      'paid',
      'received_confirmed',
      'cancelled',
      'rejected'
    );

    alter table public.staff_retirements alter column status drop default;
    alter table public.staff_retirements
      alter column status type public.staff_retirement_status_v2
      using status::text::public.staff_retirement_status_v2;
    alter table public.staff_retirements
      alter column status set default 'submitted'::public.staff_retirement_status_v2;

    drop type public.staff_retirement_status;
    alter type public.staff_retirement_status_v2 rename to staff_retirement_status;
  end if;
end $$;

create or replace function private.staff_retirement_is_live(p_status public.staff_retirement_status)
returns boolean
language sql
immutable
as $$
  select p_status::text = any (array[
    'submitted',
    'viewed',
    'changes_requested',
    'approved',
    'paid',
    'received_confirmed'
  ]);
$$;

alter table public.staff_retirements
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists viewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists received_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists paid_amount_snapshot numeric(14,2);

alter table public.staff_retirements
  drop constraint if exists staff_retirements_payment_method_check;

alter table public.staff_retirements
  add constraint staff_retirements_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'mobile_money', 'bank', 'other'));

update public.staff_retirements
   set submitted_at = coalesce(submitted_at, created_at),
       submitted_by = coalesce(submitted_by, staff_id)
 where submitted_at is null
    or submitted_by is null;

create index if not exists staff_retirement_receipts_receipt_idx
  on public.staff_retirement_receipts(receipt_id);

create index if not exists staff_retirements_company_staff_status_idx
  on public.staff_retirements(company_id, staff_id, status, created_at desc);

create table if not exists public.staff_retirement_audit_log (
  id uuid primary key default gen_random_uuid(),
  retirement_id uuid not null references public.staff_retirements(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  from_status public.staff_retirement_status,
  to_status public.staff_retirement_status,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_retirement_audit_log_action_check check (
    action in (
      'legacy_imported',
      'created',
      'resubmitted',
      'viewed',
      'approved',
      'changes_requested',
      'rejected',
      'paid',
      'received_confirmed',
      'cancelled'
    )
  )
);

create index if not exists staff_retirement_audit_retirement_idx
  on public.staff_retirement_audit_log(retirement_id, created_at desc);

create index if not exists staff_retirement_audit_company_idx
  on public.staff_retirement_audit_log(company_id, created_at desc);

alter table public.staff_retirement_audit_log enable row level security;

drop policy if exists staff_retirement_audit_select on public.staff_retirement_audit_log;
create policy staff_retirement_audit_select on public.staff_retirement_audit_log
  for select to authenticated
  using (
    exists (
      select 1
        from public.staff_retirements sr
       where sr.id = staff_retirement_audit_log.retirement_id
         and sr.company_id = private.auth_company_id()
         and (sr.staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
    )
  );

insert into public.staff_retirement_audit_log
  (retirement_id, company_id, actor_id, action, from_status, to_status, metadata, created_at)
select sr.id, sr.company_id, sr.submitted_by, 'legacy_imported', null, sr.status,
       jsonb_build_object('source', '0072_backfill'), sr.created_at
  from public.staff_retirements sr
 where not exists (
   select 1
     from public.staff_retirement_audit_log a
    where a.retirement_id = sr.id
      and a.action = 'legacy_imported'
 );

create or replace function private.staff_retirement_actor_name(p_actor uuid)
returns text
language sql
stable
as $$
  select coalesce((select full_name from public.profiles where id = p_actor), 'A colleague');
$$;

create or replace function private.staff_retirement_notify_finance(
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

create or replace function private.staff_retirement_notify_staff(
  p_company uuid,
  p_staff uuid,
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
  select p_company, p_staff, p_actor, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb)
   where p_staff is distinct from p_actor;
$$;

create or replace function private.staff_retirement_require_reason(p_reason text, p_message text)
returns text
language plpgsql
stable
as $$
declare v_reason text;
begin
  if not private.is_meaningful_reason(p_reason) then
    raise exception '%', p_message using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  v_reason := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  return v_reason;
end $$;

create or replace function private.staff_retirement_check_receipt_eligible(
  p_receipt uuid,
  p_company uuid,
  p_staff uuid,
  p_project uuid,
  p_retirement uuid default null
)
returns numeric
language plpgsql
stable
as $$
declare r record;
begin
  select * into r
    from public.receipts
   where id = p_receipt;
  if not found then
    raise exception 'one or more receipts could not be found' using errcode = 'P0001', hint = 'receipt_not_found';
  end if;
  if r.company_id <> p_company or r.uploaded_by <> p_staff or r.project_id is distinct from p_project then
    raise exception 'retirements can include only your own receipts on the selected project'
      using errcode = 'P0001', hint = 'wrong_receipt_scope';
  end if;
  if r.status <> 'confirmed' then
    raise exception 'only confirmed receipts can be retired' using errcode = 'P0001', hint = 'not_confirmed';
  end if;
  if r.reimbursed_at is not null then
    raise exception 'a receipt that was already reimbursed cannot also be retired'
      using errcode = 'P0001', hint = 'already_reimbursed';
  end if;
  if r.payment_method = 'petty_cash' then
    raise exception 'petty-cash receipts cannot be retired as staff claims'
      using errcode = 'P0001', hint = 'petty_cash_not_allowed';
  end if;
  if r.payment_method is null then
    raise exception 'choose a payment source before retiring a receipt'
      using errcode = 'P0001', hint = 'payment_source_missing';
  end if;
  if exists (
    select 1
      from public.staff_retirement_receipts srr
      join public.staff_retirements sr on sr.id = srr.retirement_id
     where srr.receipt_id = p_receipt
       and sr.id is distinct from p_retirement
       and private.staff_retirement_is_live(sr.status)
  ) then
    raise exception 'a receipt cannot be in more than one live retirement'
      using errcode = 'P0001', hint = 'duplicate_live_retirement';
  end if;

  return coalesce(r.total_amount, 0);
end $$;

create or replace function public.create_retirement(
  p_project_id uuid,
  p_title text,
  p_notes text,
  p_receipt_ids uuid[],
  p_documents jsonb default '[]'::jsonb,
  p_retirement_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_company uuid := private.auth_company_id();
  v_retirement uuid := coalesce(p_retirement_id, gen_random_uuid());
  v_wanted int := coalesce(array_length(p_receipt_ids, 1), 0);
  v_distinct int;
  v_total numeric(14,2) := 0;
  v_receipt uuid;
  v_docs jsonb := coalesce(p_documents, '[]'::jsonb);
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = 'P0001', hint = 'not_authenticated';
  end if;
  if v_wanted = 0 then
    raise exception 'choose at least one receipt to retire' using errcode = 'P0001', hint = 'nothing_selected';
  end if;
  select count(distinct x) into v_distinct from unnest(p_receipt_ids) x;
  if v_distinct <> v_wanted then
    raise exception 'the same receipt was selected more than once' using errcode = 'P0001', hint = 'duplicate_selection';
  end if;
  if not private.auth_can_see_project(p_project_id) then
    raise exception 'not your project' using errcode = 'P0001', hint = 'project_not_visible';
  end if;
  if jsonb_typeof(v_docs) <> 'array' then
    raise exception 'documents must be a JSON array' using errcode = 'P0001', hint = 'bad_documents';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_docs) d
     where nullif(btrim(d->>'storage_path'), '') is null
        or nullif(btrim(d->>'file_name'), '') is null
  ) then
    raise exception 'each document needs storage_path and file_name'
      using errcode = 'P0001', hint = 'bad_documents';
  end if;

  perform 1 from public.receipts where id = any(p_receipt_ids) order by id for update;

  foreach v_receipt in array p_receipt_ids loop
    v_total := v_total + private.staff_retirement_check_receipt_eligible(
      v_receipt, v_company, v_actor, p_project_id, v_retirement
    );
  end loop;
  if v_total <= 0 then
    raise exception 'selected receipts total zero' using errcode = 'P0001', hint = 'zero_total';
  end if;

  insert into public.staff_retirements
    (id, company_id, project_id, staff_id, title, notes, total_amount, status,
     submitted_at, submitted_by, created_at, updated_at)
  values
    (v_retirement, v_company, p_project_id, v_actor,
     coalesce(nullif(btrim(p_title), ''), 'Receipt retirement'),
     nullif(btrim(p_notes), ''), v_total, 'submitted'::public.staff_retirement_status,
     now(), v_actor, now(), now());

  insert into public.staff_retirement_receipts (retirement_id, receipt_id)
  select v_retirement, x from unnest(p_receipt_ids) x;

  insert into public.staff_retirement_documents
    (retirement_id, company_id, project_id, storage_path, file_name, file_type, created_by, ai_status)
  select v_retirement, v_company, p_project_id,
         btrim(d.storage_path), btrim(d.file_name), nullif(btrim(d.file_type), ''),
         v_actor, 'not_scanned'
    from jsonb_to_recordset(v_docs) as d(storage_path text, file_name text, file_type text);

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (v_retirement, v_company, v_actor, 'created', null, 'submitted'::public.staff_retirement_status,
     jsonb_build_object('receipt_ids', p_receipt_ids, 'document_count', jsonb_array_length(v_docs), 'total_amount', v_total));

  perform private.staff_retirement_notify_finance(
    v_company, v_actor, 'retirement_submitted', 'New staff retirement submitted',
    v_name || ' submitted ' || v_wanted || ' receipt' || case when v_wanted = 1 then '' else 's' end
      || ' for TSh ' || trim(to_char(v_total, 'FM999,999,999,999,990')) || '.',
    jsonb_build_object('retirement_id', v_retirement, 'receipt_ids', p_receipt_ids, 'amount', v_total)
  );

  return v_retirement;
end $$;

revoke execute on function public.create_retirement(uuid, text, text, uuid[], jsonb, uuid) from public, anon;
grant execute on function public.create_retirement(uuid, text, text, uuid[], jsonb, uuid) to authenticated;

create or replace function public.submit_retirement(p_retirement uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_total numeric(14,2);
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id <> v_actor then
    raise exception 'only the staff member who owns this retirement can resubmit it'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if sr.status <> 'changes_requested'::public.staff_retirement_status then
    raise exception 'only a changes-requested retirement can be resubmitted'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  perform 1
    from public.receipts r
    join public.staff_retirement_receipts srr on srr.receipt_id = r.id
   where srr.retirement_id = p_retirement
   order by r.id for update;

  select coalesce(sum(private.staff_retirement_check_receipt_eligible(
           srr.receipt_id, sr.company_id, sr.staff_id, sr.project_id, p_retirement
         )), 0)
    into v_total
    from public.staff_retirement_receipts srr
   where srr.retirement_id = p_retirement;
  if v_total <= 0 then
    raise exception 'this retirement has no eligible receipts' using errcode = 'P0001', hint = 'nothing_selected';
  end if;

  update public.staff_retirements
     set status = 'submitted'::public.staff_retirement_status,
         total_amount = v_total,
         submitted_at = now(),
         submitted_by = v_actor,
         change_request_note = null,
         change_request_receipt_ids = '{}'::uuid[],
         decision_reason = null,
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, metadata)
  values
    (p_retirement, sr.company_id, v_actor, 'resubmitted', sr.status, 'submitted'::public.staff_retirement_status,
     jsonb_build_object('total_amount', v_total));

  perform private.staff_retirement_notify_finance(
    sr.company_id, v_actor, 'retirement_resubmitted', 'Staff resubmitted retirement',
    v_name || ' resubmitted "' || sr.title || '" after changes.',
    jsonb_build_object('retirement_id', p_retirement, 'amount', v_total)
  );

  return 'submitted';
end $$;

revoke execute on function public.submit_retirement(uuid) from public, anon;
grant execute on function public.submit_retirement(uuid) to authenticated;

create or replace function public.decide_retirement(
  p_retirement uuid,
  p_decision text,
  p_reason text default null,
  p_change_receipt_ids uuid[] default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_reason text;
  v_to text;
  v_body text;
begin
  if p_decision not in ('viewed', 'approve', 'request_changes', 'reject') then
    raise exception 'unknown retirement decision %', p_decision using errcode = 'P0001';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may decide a retirement' using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id = v_actor and p_decision <> 'viewed' then
    raise exception 'you submitted this retirement, so another finance user must decide it'
      using errcode = 'P0001', hint = 'maker_checker';
  end if;

  if p_decision = 'viewed' then
    if sr.status <> 'submitted'::public.staff_retirement_status then
      raise exception 'only a submitted retirement can be marked viewed' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'viewed';
    v_body := 'Finance has opened your retirement "' || sr.title || '".';
  elsif p_decision = 'approve' then
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status) then
      raise exception 'only submitted or viewed retirements can be approved' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_to := 'approved';
    v_body := 'Your retirement "' || sr.title || '" was approved.';
  elsif p_decision = 'request_changes' then
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status) then
      raise exception 'changes can be requested only before approval' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_reason := private.staff_retirement_require_reason(
      p_reason,
      'Please write a clear reason with at least 3 meaningful words, so the staff member knows what to fix.'
    );
    v_to := 'changes_requested';
    v_body := v_reason;
  elsif p_decision = 'reject' then
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status) then
      raise exception 'only submitted or viewed retirements can be rejected' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    v_reason := private.staff_retirement_require_reason(
      p_reason,
      'Please write a clear reason with at least 3 meaningful words, so the rejection can be audited.'
    );
    v_to := 'rejected';
    v_body := v_reason;
  end if;

  update public.staff_retirements
     set status = v_to::public.staff_retirement_status,
         viewed_at = case when v_to = 'viewed' then coalesce(viewed_at, now()) else viewed_at end,
         viewed_by = case when v_to = 'viewed' then coalesce(viewed_by, v_actor) else viewed_by end,
         approved_at = case when v_to = 'approved' then now() else approved_at end,
         approved_by = case when v_to = 'approved' then v_actor else approved_by end,
         rejected_at = case when v_to = 'rejected' then now() else rejected_at end,
         rejected_by = case when v_to = 'rejected' then v_actor else rejected_by end,
         change_request_note = case when v_to = 'changes_requested' then v_reason else change_request_note end,
         change_request_receipt_ids = case when v_to = 'changes_requested' then coalesce(p_change_receipt_ids, '{}'::uuid[]) else change_request_receipt_ids end,
         decision_reason = case when v_to in ('changes_requested', 'rejected') then v_reason else null end,
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (p_retirement, sr.company_id, v_actor,
     case v_to when 'approved' then 'approved'
               when 'changes_requested' then 'changes_requested'
               when 'rejected' then 'rejected'
               else 'viewed' end,
     sr.status, v_to::public.staff_retirement_status, v_reason,
     jsonb_build_object('receipt_ids', coalesce(p_change_receipt_ids, '{}'::uuid[])));

  perform private.staff_retirement_notify_staff(
    sr.company_id, sr.staff_id, v_actor,
    'retirement_' || v_to,
    case v_to when 'viewed' then 'Accountant viewed your retirement'
              when 'approved' then 'Retirement approved'
              when 'changes_requested' then 'Changes requested'
              else 'Retirement rejected' end,
    v_body,
    jsonb_build_object('retirement_id', p_retirement, 'receipt_ids', coalesce(p_change_receipt_ids, '{}'::uuid[]))
  );

  return v_to;
end $$;

revoke execute on function public.decide_retirement(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.decide_retirement(uuid, text, text, uuid[]) to authenticated;

create or replace function public.mark_retirement_paid(
  p_retirement uuid,
  p_method text default null,
  p_reference text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sr record;
  v_actor uuid := auth.uid();
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may mark a retirement paid' using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if p_method is not null and p_method not in ('cash', 'mobile_money', 'bank', 'other') then
    raise exception 'unknown payment method %', p_method using errcode = 'P0001', hint = 'bad_payment_method';
  end if;

  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id = v_actor then
    raise exception 'you submitted this retirement, so another finance user must pay it'
      using errcode = 'P0001', hint = 'maker_checker';
  end if;
  if sr.status <> 'approved'::public.staff_retirement_status then
    raise exception 'only an approved retirement can be marked paid' using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.staff_retirements
     set status = 'paid'::public.staff_retirement_status,
         paid_at = now(),
         paid_by = v_actor,
         paid_amount_snapshot = total_amount,
         payment_method = p_method,
         payment_reference = nullif(btrim(p_reference), ''),
         decision_reason = nullif(btrim(p_reason), ''),
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason, metadata)
  values
    (p_retirement, sr.company_id, v_actor, 'paid', sr.status, 'paid'::public.staff_retirement_status,
     nullif(btrim(p_reason), ''),
     jsonb_build_object('amount', sr.total_amount, 'method', p_method, 'reference', nullif(btrim(p_reference), '')));

  perform private.staff_retirement_notify_staff(
    sr.company_id, sr.staff_id, v_actor, 'retirement_paid', 'Retirement marked as paid',
    'TSh ' || trim(to_char(sr.total_amount, 'FM999,999,999,999,990')) || ' was marked paid for "' || sr.title || '".'
      || coalesce(' Reference: ' || nullif(btrim(p_reference), ''), ''),
    jsonb_build_object('retirement_id', p_retirement, 'amount', sr.total_amount)
  );

  return jsonb_build_object('status', 'paid', 'retirement_id', p_retirement, 'amount', sr.total_amount);
end $$;

revoke execute on function public.mark_retirement_paid(uuid, text, text, text) from public, anon;
grant execute on function public.mark_retirement_paid(uuid, text, text, text) to authenticated;

create or replace function public.confirm_retirement_received(p_retirement uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.staff_id <> v_actor then
    raise exception 'only the staff member paid can confirm receiving the money'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;
  if sr.status <> 'paid'::public.staff_retirement_status then
    raise exception 'only a paid retirement can be confirmed received' using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.staff_retirements
     set status = 'received_confirmed'::public.staff_retirement_status,
         received_confirmed_at = now(),
         received_confirmed_by = v_actor,
         decision_reason = nullif(btrim(p_reason), ''),
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_retirement, sr.company_id, v_actor, 'received_confirmed', sr.status,
     'received_confirmed'::public.staff_retirement_status, nullif(btrim(p_reason), ''));

  perform private.staff_retirement_notify_finance(
    sr.company_id, v_actor, 'retirement_received_confirmed', 'Staff confirmed payment received',
    v_name || ' confirmed receiving payment for "' || sr.title || '".',
    jsonb_build_object('retirement_id', p_retirement, 'amount', sr.total_amount)
  );

  return 'received_confirmed';
end $$;

revoke execute on function public.confirm_retirement_received(uuid, text) from public, anon;
grant execute on function public.confirm_retirement_received(uuid, text) to authenticated;

create or replace function public.cancel_retirement(p_retirement uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sr record;
  v_actor uuid := auth.uid();
  v_reason text;
  v_is_finance boolean := private.auth_role() in ('owner', 'accountant');
  v_name text := private.staff_retirement_actor_name(auth.uid());
begin
  v_reason := private.staff_retirement_require_reason(
    p_reason,
    'Please write a clear reason with at least 3 meaningful words, so the cancellation can be audited.'
  );

  select * into sr from public.staff_retirements where id = p_retirement for update;
  if not found then raise exception 'retirement not found' using errcode = 'P0001'; end if;
  if sr.company_id <> private.auth_company_id() then raise exception 'not your company' using errcode = 'P0001'; end if;
  if sr.status in ('received_confirmed'::public.staff_retirement_status, 'rejected'::public.staff_retirement_status, 'cancelled'::public.staff_retirement_status) then
    raise exception 'this retirement is already terminal' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if not v_is_finance then
    if sr.staff_id <> v_actor then
      raise exception 'only the staff member or finance may cancel a retirement'
        using errcode = 'P0001', hint = 'not_authorized';
    end if;
    if sr.status not in ('submitted'::public.staff_retirement_status, 'viewed'::public.staff_retirement_status, 'changes_requested'::public.staff_retirement_status) then
      raise exception 'after approval, only finance may void or cancel the retirement'
        using errcode = 'P0001', hint = 'not_authorized';
    end if;
  elsif sr.staff_id = v_actor and sr.status in ('approved'::public.staff_retirement_status, 'paid'::public.staff_retirement_status) then
    raise exception 'you submitted this retirement, so another finance user must void it'
      using errcode = 'P0001', hint = 'maker_checker';
  end if;

  update public.staff_retirements
     set status = 'cancelled'::public.staff_retirement_status,
         cancelled_at = now(),
         cancelled_by = v_actor,
         decision_reason = v_reason,
         updated_at = now()
   where id = p_retirement;

  insert into public.staff_retirement_audit_log
    (retirement_id, company_id, actor_id, action, from_status, to_status, reason)
  values
    (p_retirement, sr.company_id, v_actor, 'cancelled', sr.status,
     'cancelled'::public.staff_retirement_status, v_reason);

  if sr.staff_id = v_actor then
    perform private.staff_retirement_notify_finance(
      sr.company_id, v_actor, 'retirement_cancelled', 'Staff cancelled retirement',
      v_name || ' cancelled "' || sr.title || '". Reason: ' || v_reason,
      jsonb_build_object('retirement_id', p_retirement)
    );
  else
    perform private.staff_retirement_notify_staff(
      sr.company_id, sr.staff_id, v_actor, 'retirement_cancelled', 'Retirement cancelled',
      'Your retirement "' || sr.title || '" was cancelled. Reason: ' || v_reason,
      jsonb_build_object('retirement_id', p_retirement)
    );
  end if;

  return 'cancelled';
end $$;

revoke execute on function public.cancel_retirement(uuid, text) from public, anon;
grant execute on function public.cancel_retirement(uuid, text) to authenticated;

create or replace function public.staff_retirement_receipt_live_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare sr record;
begin
  select * into sr from public.staff_retirements where id = new.retirement_id;
  if not found then
    raise exception 'retirement not found' using errcode = 'P0001';
  end if;
  if not private.staff_retirement_is_live(sr.status) then
    return new;
  end if;

  perform 1 from public.receipts where id = new.receipt_id for update;
  perform private.staff_retirement_check_receipt_eligible(
    new.receipt_id, sr.company_id, sr.staff_id, sr.project_id, sr.id
  );

  return new;
end $$;

drop trigger if exists staff_retirement_receipt_live_guard_biu on public.staff_retirement_receipts;
create trigger staff_retirement_receipt_live_guard_biu
  before insert or update of retirement_id, receipt_id on public.staff_retirement_receipts
  for each row execute function public.staff_retirement_receipt_live_guard();

create or replace function public.staff_retirement_status_live_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_receipt uuid;
begin
  if tg_op = 'UPDATE'
     and private.staff_retirement_is_live(new.status)
     and not private.staff_retirement_is_live(old.status) then
    for v_receipt in
      select receipt_id from public.staff_retirement_receipts where retirement_id = new.id
    loop
      perform private.staff_retirement_check_receipt_eligible(
        v_receipt, new.company_id, new.staff_id, new.project_id, new.id
      );
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists staff_retirement_status_live_guard_bu on public.staff_retirements;
create trigger staff_retirement_status_live_guard_bu
  before update of status on public.staff_retirements
  for each row execute function public.staff_retirement_status_live_guard();

create or replace function public.receipts_guard_live_staff_retirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.staff_retirement_receipts srr
      join public.staff_retirements sr on sr.id = srr.retirement_id
     where srr.receipt_id = old.id
       and private.staff_retirement_is_live(sr.status)
  ) then
    if new.total_amount is distinct from old.total_amount
       or new.tax_amount is distinct from old.tax_amount
       or new.payment_method is distinct from old.payment_method
       or new.status is distinct from old.status
       or new.company_id is distinct from old.company_id
       or new.project_id is distinct from old.project_id
       or new.uploaded_by is distinct from old.uploaded_by
       or new.receipt_date is distinct from old.receipt_date
       or new.category is distinct from old.category
       or new.reimbursed_at is distinct from old.reimbursed_at
       or new.reimbursed_by is distinct from old.reimbursed_by then
      raise exception 'This receipt is part of a live staff retirement. Cancel or reject the retirement before changing money-sensitive fields.'
        using errcode = 'P0001', hint = 'retirement_receipt_frozen';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.receipts_guard_live_staff_retirement() from public, anon, authenticated;

drop trigger if exists receipts_guard_live_staff_retirement_bu on public.receipts;
create trigger receipts_guard_live_staff_retirement_bu
  before update on public.receipts
  for each row execute function public.receipts_guard_live_staff_retirement();

-- Existing reversal RPC already blocks active retirements; this version lets
-- terminal rejected retirements release the receipt just like cancelled ones.
create or replace function public.reverse_petty_cash_receipt(
  p_receipt uuid, p_transaction uuid, p_mode text, p_reason text, p_new_amount numeric default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  r record; v_txn record; v_actor uuid := auth.uid(); v_confirmer uuid;
  v_adjustment uuid; v_expense uuid; v_balance numeric; v_blocker text;
begin
  if p_mode not in ('void', 'correct') then
    raise exception 'unknown reversal mode %', p_mode using errcode = 'P0001';
  end if;
  if not private.is_meaningful_reason(p_reason) then
    raise exception 'Please write a clear reason with at least 3 meaningful words. Somebody will read this months from now to understand where the money went.'
      using errcode = 'P0001', hint = 'reason_not_meaningful';
  end if;
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'only finance may reverse a petty cash entry'
      using errcode = 'P0001', hint = 'not_authorized';
  end if;

  select rc.*, c.reversal_enabled, c.allow_self_approval into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update of rc;
  if not found then raise exception 'receipt not found' using errcode = 'P0001'; end if;
  if r.company_id <> private.auth_company_id() then
    raise exception 'not your company' using errcode = 'P0001';
  end if;
  if not r.reversal_enabled then
    raise exception 'reversal is not enabled for this company'
      using errcode = 'P0001', hint = 'reversal_disabled';
  end if;

  select * into v_txn from public.petty_cash_transactions
   where id = p_transaction and receipt_id = p_receipt and type = 'expense';
  if not found then
    raise exception 'that petty cash posting does not belong to this receipt'
      using errcode = 'P0001', hint = 'wrong_transaction';
  end if;

  if v_txn.reversed_at is not null then
    select current_balance into v_balance
      from public.petty_cash_accounts where id = v_txn.account_id;
    return jsonb_build_object('status', 'already_reversed',
      'adjustment_id', v_txn.reversed_by_transaction_id, 'balance', v_balance);
  end if;

  if r.status <> 'confirmed' then
    raise exception 'only a confirmed receipt has a posting to reverse'
      using errcode = 'P0001', hint = 'not_confirmed';
  end if;

  if r.reimbursed_at is not null then
    v_blocker := 'This receipt has already been reimbursed to the employee. Recover the money first; a reversal does not get it back.';
  elsif exists (select 1 from public.invoice_receipts ir join public.invoices i on i.id = ir.invoice_id
                 where ir.receipt_id = p_receipt and i.status <> 'draft') then
    v_blocker := 'This receipt is on an invoice that has already left draft. Reversing it would change a document the client holds.';
  elsif exists (select 1 from public.staff_retirement_receipts srr
                  join public.staff_retirements sr on sr.id = srr.retirement_id
                 where srr.receipt_id = p_receipt and sr.status::text not in ('cancelled', 'rejected')) then
    v_blocker := 'This receipt is part of a retirement claim. Cancel or reject the retirement first.';
  end if;
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001', hint = 'reversal_blocked';
  end if;

  v_confirmer := coalesce(r.decided_by, (
    select actor_id from public.receipt_audit_log
     where receipt_id = p_receipt and event = 'confirmed'
     order by created_at desc limit 1));
  if v_confirmer = v_actor and not r.allow_self_approval then
    raise exception 'you confirmed this receipt, so another finance user must reverse it'
      using errcode = 'P0001', hint = 'self_reversal_blocked';
  end if;

  if p_mode = 'correct' then
    if p_new_amount is null or p_new_amount <= 0 then
      raise exception 'a correction needs a positive corrected amount'
        using errcode = 'P0001', hint = 'invalid_amount';
    end if;
    if p_new_amount = r.total_amount then
      raise exception 'the corrected amount is the same as the current one'
        using errcode = 'P0001', hint = 'no_change';
    end if;
  end if;

  select current_balance into v_balance from public.petty_cash_accounts
   where id = v_txn.account_id for update;
  if v_balance is null then
    raise exception 'petty cash account not found' using errcode = 'P0001';
  end if;

  insert into public.petty_cash_transactions
    (account_id, amount, type, receipt_id, description, created_by, project_id,
     status, reverses_transaction_id, reversal_reason)
  values (v_txn.account_id, -v_txn.amount, 'adjustment', p_receipt,
    case p_mode when 'void' then 'Reversal of petty cash expense'
                else 'Correction of petty cash expense' end,
    v_actor, v_txn.project_id, 'accepted', v_txn.id, btrim(p_reason))
  returning id into v_adjustment;

  update public.petty_cash_transactions
     set reversed_at = now(), reversed_by_transaction_id = v_adjustment
   where id = v_txn.id;

  perform set_config('risip.audit_event',
                     case p_mode when 'void' then 'reversed' else 'corrected' end, true);
  perform set_config('risip.audit_reason', btrim(p_reason), true);
  perform set_config('risip.audit_actor', v_actor::text, true);
  perform set_config('risip.audit_txn', v_adjustment::text, true);
  perform set_config('risip.audit_account', v_txn.account_id::text, true);

  if p_mode = 'void' then
    update public.receipts
       set status = 'pending_review', decision_reason = btrim(p_reason),
           details_confirmed = false, submitted_at = null, submitted_by = null,
           decided_at = null, decided_by = null
     where id = p_receipt;
  else
    update public.receipts
       set total_amount = p_new_amount, decision_reason = btrim(p_reason)
     where id = p_receipt;

    insert into public.petty_cash_transactions
      (account_id, amount, type, receipt_id, description, created_by, project_id, status)
    values (v_txn.account_id, -p_new_amount, 'expense', p_receipt,
      coalesce('Receipt: ' || nullif(r.vendor_name, ''), 'Petty cash expense'),
      r.uploaded_by, r.project_id, 'accepted')
    returning id into v_expense;
  end if;

  perform set_config('risip.audit_event', '', true);
  perform set_config('risip.audit_reason', '', true);
  perform set_config('risip.audit_actor', '', true);
  perform set_config('risip.audit_txn', '', true);
  perform set_config('risip.audit_account', '', true);

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, r.uploaded_by, v_actor, 'receipt_' || p_mode,
         case p_mode when 'void' then 'A receipt was reversed'
                     else 'A receipt amount was corrected' end,
         case p_mode
           when 'void' then 'Your receipt was reversed and the petty cash was returned to your float. Reason: ' || btrim(p_reason)
           else 'Your receipt was corrected from TSh '
                || trim(to_char(r.total_amount, 'FM999,999,999,999,990')) || ' to TSh '
                || trim(to_char(p_new_amount, 'FM999,999,999,999,990')) || '. Reason: ' || btrim(p_reason)
         end,
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode, 'adjustment_id', v_adjustment)
   where r.uploaded_by is not null and r.uploaded_by <> v_actor;

  insert into public.app_notifications
    (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, p.id, v_actor, 'receipt_' || p_mode,
         case p_mode when 'void' then 'Petty cash entry reversed'
                     else 'Petty cash entry corrected' end,
         coalesce((select full_name from public.profiles where id = v_actor), 'A colleague')
           || ' ' || case p_mode when 'void' then 'reversed' else 'corrected' end
           || ' ' || coalesce(nullif(r.vendor_name, ''), 'a receipt')
           || '. Reason: ' || btrim(p_reason),
         jsonb_build_object('receipt_id', p_receipt, 'mode', p_mode, 'adjustment_id', v_adjustment)
    from public.profiles p
   where p.company_id = r.company_id and p.role in ('owner', 'accountant')
     and p.deactivated_at is null and p.id <> v_actor
     and p.id is distinct from r.uploaded_by;

  select current_balance into v_balance
    from public.petty_cash_accounts where id = v_txn.account_id;

  return jsonb_build_object('status', p_mode, 'adjustment_id', v_adjustment,
    'expense_id', v_expense, 'balance', v_balance);
end $$;

revoke execute on function public.reverse_petty_cash_receipt(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.reverse_petty_cash_receipt(uuid, uuid, text, text, numeric) to authenticated;

drop policy if exists staff_retirements_select on public.staff_retirements;
create policy staff_retirements_select on public.staff_retirements
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and (staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
  );

drop policy if exists staff_retirements_insert_own on public.staff_retirements;
drop policy if exists staff_retirements_update_participants on public.staff_retirements;

drop policy if exists staff_retirement_receipts_select on public.staff_retirement_receipts;
create policy staff_retirement_receipts_select on public.staff_retirement_receipts
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_retirements sr
      where sr.id = retirement_id
        and sr.company_id = private.auth_company_id()
        and (sr.staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
    )
  );

drop policy if exists staff_retirement_receipts_insert on public.staff_retirement_receipts;

drop policy if exists staff_retirement_documents_select on public.staff_retirement_documents;
create policy staff_retirement_documents_select on public.staff_retirement_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_retirements sr
      where sr.id = retirement_id
        and sr.company_id = private.auth_company_id()
        and (sr.staff_id = auth.uid() or private.auth_role() in ('owner', 'accountant'))
    )
  );

drop policy if exists staff_retirement_documents_insert on public.staff_retirement_documents;
