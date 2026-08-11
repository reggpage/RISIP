-- Reimbursements: paying staff back for receipts they covered out of their own
-- pocket. A confirmed cash_personal receipt is "owed" until finance marks it
-- reimbursed, so the queue needs no bookkeeping of its own — uploading a receipt
-- puts it in the queue automatically.

alter table receipts
  add column if not exists reimbursed_at timestamptz,
  add column if not exists reimbursed_by uuid references profiles(id);

-- Drives the per-person "owed" list; the partial predicate keeps it small.
create index if not exists receipts_unreimbursed_idx
  on receipts (company_id, uploaded_by)
  where payment_method = 'cash_personal'
    and status = 'confirmed'
    and reimbursed_at is null;

-- Mark one, several, or all of a person's receipts as paid (or undo a mistake).
-- Only touches confirmed cash_personal receipts in the caller's own company, so a
-- stray id can never reach across tenants or hit petty-cash spend.
create or replace function mark_receipts_reimbursed(
  p_receipt_ids uuid[], p_paid boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_changed integer := 0;
  r record;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'not authorized';
  end if;
  v_company := private.auth_company_id();
  if p_receipt_ids is null or array_length(p_receipt_ids, 1) is null then return 0; end if;

  update receipts
     set reimbursed_at = case when p_paid then now() else null end,
         reimbursed_by = case when p_paid then v_actor else null end
   where id = any(p_receipt_ids)
     and company_id = v_company
     and payment_method = 'cash_personal'
     and status = 'confirmed'
     and (reimbursed_at is null) = p_paid;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then return 0; end if;

  select full_name into v_actor_name from profiles where id = v_actor;

  -- One notification per affected person, summarising what just changed.
  for r in
    select uploaded_by, count(*) as n, coalesce(sum(total_amount), 0) as amount
      from receipts
     where id = any(p_receipt_ids)
       and company_id = v_company
       and payment_method = 'cash_personal'
       and status = 'confirmed'
       and (reimbursed_at is not null) = p_paid
     group by uploaded_by
  loop
    insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      v_company, r.uploaded_by, v_actor,
      case when p_paid then 'reimbursement_paid' else 'reimbursement_reverted' end,
      case when p_paid then 'You have been paid back' else 'A reimbursement was reversed' end,
      case when p_paid then 'TSh ' || trim(to_char(r.amount, 'FM999,999,999,999,990'))
                          || ' for ' || r.n || ' receipt' || case when r.n = 1 then '' else 's' end
                          || ' was marked paid by ' || coalesce(v_actor_name, 'finance') || '.'
           else 'TSh ' || trim(to_char(r.amount, 'FM999,999,999,999,990'))
                          || ' for ' || r.n || ' receipt' || case when r.n = 1 then '' else 's' end
                          || ' is pending again.' end,
      jsonb_build_object('receipt_ids', to_jsonb(p_receipt_ids), 'amount', r.amount, 'paid', p_paid)
    );
  end loop;

  return v_changed;
end;
$$;

grant execute on function mark_receipts_reimbursed(uuid[], boolean) to authenticated;

-- Notifications were not in the realtime publication, so the bell and toasts only
-- updated on refresh. Add it alongside the petty cash tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end $$;
