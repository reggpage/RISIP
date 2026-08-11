-- An admin who sent a top-up by mistake had no way back: only the recipient could
-- respond. Let the finance side withdraw a request that is still pending. Accepted
-- top-ups are untouched -- that money is already spendable and must be corrected
-- with a real adjustment, not by rewriting history.
create or replace function cancel_petty_cash_request(p_transaction uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_status text; v_type text; v_amount numeric;
  v_account_user uuid; v_txn_company uuid; v_changed integer;
begin
  if private.auth_role() not in ('owner', 'accountant') then
    raise exception 'not authorized';
  end if;
  v_company := private.auth_company_id();

  select t.status, t.type, t.amount, a.user_id, a.company_id
    into v_status, v_type, v_amount, v_account_user, v_txn_company
    from petty_cash_transactions t
    join petty_cash_accounts a on a.id = t.account_id
   where t.id = p_transaction
   for update;
  if not found then raise exception 'top-up request not found'; end if;
  if v_txn_company <> v_company then raise exception 'not in your company'; end if;
  if v_type <> 'allocation' or v_status <> 'pending' then
    raise exception 'only a pending top-up can be cancelled';
  end if;

  update petty_cash_transactions
     set status = 'declined', responded_at = now()
   where id = p_transaction;
  get diagnostics v_changed = row_count;

  insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  values (
    v_company, v_account_user, auth.uid(), 'petty_cash_cancelled',
    'Top-up cancelled',
    'A pending top-up of TSh ' || trim(to_char(v_amount, 'FM999,999,999,999,990'))
      || ' was cancelled by your finance team.',
    jsonb_build_object('transaction_id', p_transaction, 'amount', v_amount)
  );

  return v_changed;
end;
$$;

grant execute on function cancel_petty_cash_request(uuid) to authenticated;
