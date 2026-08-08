-- Petty cash is not spendable until the recipient accepts it. Existing ledger
-- entries predate this flow, so they remain accepted to preserve balances.

alter table petty_cash_transactions
  add column if not exists status text not null default 'accepted'
    check (status in ('pending', 'accepted', 'declined')),
  add column if not exists responded_at timestamptz;

update petty_cash_transactions
   set status = 'accepted'
 where status is null;

create or replace function petty_cash_apply_transaction() returns trigger
language plpgsql as $$
begin
  -- Expenses and historical entries are accepted immediately. A top-up request
  -- changes a pending allocation to accepted only after its recipient agrees.
  if (tg_op = 'INSERT' and new.status = 'accepted')
     or (tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted') then
    update petty_cash_accounts
       set current_balance = current_balance + new.amount,
           updated_at = now()
     where id = new.account_id;
  end if;
  return new;
end $$;

-- Project allocations reserve the project budget while pending, but do not
-- credit the member's balance until the member accepts the request.
create or replace function allocate_project_petty_cash(
  p_project uuid, p_user uuid, p_amount numeric, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_budget numeric; v_reserved numeric;
  v_is_owner boolean; v_is_leader boolean; v_account uuid; v_txn uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  v_is_owner := (private.auth_role() = 'owner');
  select exists (
    select 1 from project_members
     where project_id = p_project and profile_id = auth.uid() and role = 'leader'
  ) into v_is_leader;
  if not (v_is_owner or v_is_leader) then raise exception 'not authorized for this project'; end if;

  select company_id, petty_cash_budget into v_company, v_budget from projects where id = p_project;
  if v_company is null or v_company <> private.auth_company_id() then
    raise exception 'project not in your company';
  end if;
  if not exists (select 1 from project_members where project_id = p_project and profile_id = p_user) then
    raise exception 'user is not a member of this project';
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from petty_cash_transactions
   where project_id = p_project and type = 'allocation' and status in ('pending', 'accepted');
  if not v_is_owner and (v_reserved + p_amount) > v_budget then
    raise exception 'exceeds project budget (reserved % of %)', v_reserved, v_budget;
  end if;

  select id into v_account from petty_cash_accounts where user_id = p_user and company_id = v_company;
  if v_account is null then
    insert into petty_cash_accounts (user_id, company_id) values (p_user, v_company) returning id into v_account;
  end if;

  insert into petty_cash_transactions (account_id, amount, type, project_id, description, created_by, status)
  values (v_account, p_amount, 'allocation', p_project, coalesce(p_description, 'Project allocation'), auth.uid(), 'pending')
  returning id into v_txn;

  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  values (
    v_company, p_user, auth.uid(), 'petty_cash_request', 'Petty cash top-up request',
    'You have received a project cash top-up request of TSh ' || trim(to_char(p_amount, 'FM999,999,999,999,990.00')) || '. Accept it before using the funds.',
    jsonb_build_object('transaction_id', v_txn, 'amount', p_amount, 'project_id', p_project)
  );
  return v_txn;
end;
$$;

-- Company-level top-ups use the same acceptance path as project allocations.
create or replace function request_petty_cash_top_up(
  p_user uuid, p_amount numeric, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_account uuid; v_txn uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if private.auth_role() not in ('owner', 'accountant') then raise exception 'not authorized'; end if;
  v_company := private.auth_company_id();
  if not exists (select 1 from profiles where id = p_user and company_id = v_company and deactivated_at is null) then
    raise exception 'staff member not in your company';
  end if;
  select id into v_account from petty_cash_accounts where user_id = p_user and company_id = v_company;
  if v_account is null then
    insert into petty_cash_accounts (user_id, company_id) values (p_user, v_company) returning id into v_account;
  end if;
  insert into petty_cash_transactions (account_id, amount, type, description, created_by, status)
  values (v_account, p_amount, 'allocation', coalesce(p_description, 'Top-up'), auth.uid(), 'pending')
  returning id into v_txn;
  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  values (
    v_company, p_user, auth.uid(), 'petty_cash_request', 'Petty cash top-up request',
    'You have received a cash top-up request of TSh ' || trim(to_char(p_amount, 'FM999,999,999,999,990.00')) || '. Accept it before using the funds.',
    jsonb_build_object('transaction_id', v_txn, 'amount', p_amount)
  );
  return v_txn;
end;
$$;

create or replace function respond_to_petty_cash_request(
  p_transaction uuid, p_accept boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_txn record;
begin
  select t.id, t.status, t.type, a.user_id
    into v_txn
    from petty_cash_transactions t
    join petty_cash_accounts a on a.id = t.account_id
   where t.id = p_transaction
   for update;
  if not found then raise exception 'top-up request not found'; end if;
  if v_txn.user_id <> auth.uid() then raise exception 'this top-up belongs to another user'; end if;
  if v_txn.type <> 'allocation' or v_txn.status <> 'pending' then raise exception 'this top-up has already been handled'; end if;

  update petty_cash_transactions
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_transaction;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

grant execute on function allocate_project_petty_cash(uuid, uuid, numeric, text) to authenticated;
grant execute on function request_petty_cash_top_up(uuid, numeric, text) to authenticated;
grant execute on function respond_to_petty_cash_request(uuid, boolean) to authenticated;
