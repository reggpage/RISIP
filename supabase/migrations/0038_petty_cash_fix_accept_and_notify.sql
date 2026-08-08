-- Fix: accepting a petty cash top-up did not credit the recipient's balance.
--
-- 0036 made petty_cash_apply_transaction() status-aware — it credits the account
-- only on the transition INTO 'accepted' (either an INSERT that is already
-- accepted, or an UPDATE that flips pending -> accepted). But the trigger created
-- in 0020 still fired `AFTER INSERT` only, so the accept UPDATE never ran the
-- function and the balance stayed at 0. Rebind the trigger to fire on UPDATE too.
-- The function already guards against double-crediting, so this is safe.

drop trigger if exists petty_cash_apply_transaction_ai on petty_cash_transactions;
create trigger petty_cash_apply_transaction_ai
  after insert or update on petty_cash_transactions
  for each row execute function petty_cash_apply_transaction();

-- Notify the requester (owner/accountant) in real time when the recipient accepts
-- or declines their top-up, so the admin sees the outcome without refreshing.
create or replace function respond_to_petty_cash_request(
  p_transaction uuid, p_accept boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_txn_id uuid; v_status text; v_type text; v_amount numeric;
  v_created_by uuid; v_account_user uuid; v_company uuid;
  v_recipient_name text;
begin
  select t.id, t.status, t.type, t.amount, t.created_by, a.user_id, a.company_id
    into v_txn_id, v_status, v_type, v_amount, v_created_by, v_account_user, v_company
    from petty_cash_transactions t
    join petty_cash_accounts a on a.id = t.account_id
   where t.id = p_transaction
   for update;
  if not found then raise exception 'top-up request not found'; end if;
  if v_account_user <> auth.uid() then raise exception 'this top-up belongs to another user'; end if;
  if v_type <> 'allocation' or v_status <> 'pending' then raise exception 'this top-up has already been handled'; end if;

  update petty_cash_transactions
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_transaction;

  select full_name into v_recipient_name from profiles where id = auth.uid();

  if v_created_by is not null then
    insert into app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
    values (
      v_company, v_created_by, auth.uid(), 'petty_cash_response',
      case when p_accept then 'Top-up accepted' else 'Top-up declined' end,
      coalesce(v_recipient_name, 'Staff')
        || case when p_accept then ' accepted your top-up of TSh ' else ' declined your top-up of TSh ' end
        || trim(to_char(v_amount, 'FM999,999,999,999,990')) || '.',
      jsonb_build_object('transaction_id', p_transaction, 'amount', v_amount, 'accepted', p_accept)
    );
  end if;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

grant execute on function respond_to_petty_cash_request(uuid, boolean) to authenticated;
