-- Phase 1b RPCs. Every rule here is server-side: the UI mirrors them, but a
-- forged request still cannot approve anything.
--
-- submit_receipt   uploader (or finance on their behalf) sends a completed
--                  receipt to finance. Never approves.
-- decide_receipt   finance approves / requests changes / rejects. A reason of at
--                  least 10 characters is required for the last two. Maker-checker:
--                  you may not approve what you submitted unless the company is
--                  explicitly configured for it, and that is audited.
--
-- receipts_guard_transitions is extended so the flag decides which route to
-- 'confirmed' is legal. With the flag OFF the matrix is byte-for-byte what 0053
-- established, which is what keeps existing companies unchanged.
--
-- ROLLBACK: drop submit_receipt and decide_receipt, and restore
-- receipts_guard_transitions from 0053. No data is touched.

create or replace function public.submit_receipt(p_receipt uuid)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r record; v_enabled boolean;
begin
  select rc.*, c.approval_flow_enabled into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if r.company_id <> private.auth_company_id() then raise exception 'not your company'; end if;
  v_enabled := r.approval_flow_enabled;
  if not v_enabled then raise exception 'approval flow is not enabled for this company'; end if;
  if r.uploaded_by <> auth.uid()
     and private.auth_role() not in ('owner','accountant') then
    raise exception 'only the uploader or finance may submit this receipt';
  end if;
  if r.status not in ('pending_review','changes_requested') then
    raise exception 'only a receipt awaiting review or changes can be submitted';
  end if;
  if r.project_id is null or r.category is null or r.payment_method is null then
    raise exception 'choose the project, category and payment source before submitting';
  end if;
  update public.receipts
     set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
         decision_reason = null, details_confirmed = true
   where id = p_receipt;
  return 'submitted';
end $$;

create or replace function public.decide_receipt(
  p_receipt uuid, p_decision text, p_reason text default null
) returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r record; v_self boolean;
begin
  if p_decision not in ('approve','request_changes','reject') then
    raise exception 'unknown decision %', p_decision;
  end if;
  if p_decision in ('request_changes','reject')
     and coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'a reason of at least 10 characters is required to % this receipt', p_decision;
  end if;
  if private.auth_role() not in ('owner','accountant') then
    raise exception 'only finance may decide on a receipt';
  end if;

  select rc.*, c.approval_flow_enabled, c.allow_self_approval into r
    from public.receipts rc join public.companies c on c.id = rc.company_id
   where rc.id = p_receipt for update;
  if not found then raise exception 'receipt not found'; end if;
  if r.company_id <> private.auth_company_id() then raise exception 'not your company'; end if;
  if not r.approval_flow_enabled then raise exception 'approval flow is not enabled for this company'; end if;
  if r.status <> 'submitted' then raise exception 'only a submitted receipt can be decided'; end if;

  -- Maker-checker: you may not approve what you submitted, unless the company is
  -- explicitly configured for it (one-person business) and it is audited.
  v_self := (r.submitted_by = auth.uid());
  if p_decision = 'approve' and v_self and not r.allow_self_approval then
    raise exception 'you submitted this receipt, so another finance user must approve it';
  end if;

  update public.receipts
     set status = case p_decision
                    when 'approve' then 'confirmed'::receipt_status
                    when 'request_changes' then 'changes_requested'::receipt_status
                    else 'rejected'::receipt_status end,
         decided_at = now(), decided_by = auth.uid(),
         decision_reason = case when p_decision = 'approve' then null else btrim(p_reason) end
   where id = p_receipt;

  if p_decision = 'approve' and v_self then
    update public.receipt_audit_log set self_approved = true
     where receipt_id = p_receipt and created_at = (
       select max(created_at) from public.receipt_audit_log where receipt_id = p_receipt);
  end if;

  insert into public.app_notifications (company_id, recipient_id, actor_id, type, title, body, metadata)
  select r.company_id, r.uploaded_by, auth.uid(),
         'receipt_' || p_decision,
         case p_decision when 'approve' then 'Receipt approved'
                         when 'request_changes' then 'Changes requested on your receipt'
                         else 'Receipt rejected' end,
         case when p_decision = 'approve' then 'Your receipt was approved and now counts as project spend.'
              else btrim(p_reason) end,
         jsonb_build_object('receipt_id', p_receipt, 'decision', p_decision)
   where r.uploaded_by is not null;

  return p_decision;
end $$;

create or replace function public.receipts_guard_transitions()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_booked boolean; v_flag boolean;
begin
  select exists (select 1 from public.petty_cash_transactions
                  where receipt_id = new.id and type = 'expense') into v_booked;

  if v_booked and new.status is distinct from old.status then
    raise exception
      'This receipt is booked against petty cash, so its status cannot change from % to %. Reverse the petty cash entry first.',
      old.status, new.status
      using errcode = 'P0001', hint = 'receipt_booked';
  end if;

  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    if old.status = 'duplicate' then
      raise exception 'A duplicate receipt cannot be confirmed. Resolve the duplicate instead.'
        using errcode = 'P0001', hint = 'invalid_transition_duplicate';
    end if;
    if old.status = 'error' then
      raise exception 'A failed receipt cannot be confirmed directly. Send it back for review so extraction and duplicate checks run again.'
        using errcode = 'P0001', hint = 'invalid_transition_error';
    end if;
    if old.status = 'rejected' then
      raise exception 'A rejected receipt is final and cannot be confirmed.'
        using errcode = 'P0001', hint = 'invalid_transition_rejected';
    end if;

    select approval_flow_enabled into v_flag from public.companies where id = new.company_id;
    if coalesce(v_flag, false) then
      -- With the flow on, approval is the only route in, and decide_receipt is
      -- the only thing that sets decided_by.
      if old.status <> 'submitted' or new.decided_by is null then
        raise exception 'With the approval flow enabled a receipt must be submitted and then approved by finance.'
          using errcode = 'P0001', hint = 'approval_required';
      end if;
    end if;
  end if;

  -- rejected is terminal.
  if old.status = 'rejected' and new.status is distinct from 'rejected' then
    raise exception 'A rejected receipt is final.'
      using errcode = 'P0001', hint = 'rejected_is_terminal';
  end if;

  return new;
end $$;

grant execute on function public.submit_receipt(uuid) to authenticated;
grant execute on function public.decide_receipt(uuid, text, text) to authenticated;
revoke execute on function public.receipts_guard_transitions() from public, anon, authenticated;
