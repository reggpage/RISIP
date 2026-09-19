-- ============================================================================
-- Subscription access: days left, and a block that actually blocks
-- ============================================================================
-- billing_write_block already existed and returned a reason when a
-- subscription was suspended or cancelled. It was called from NOWHERE — not
-- the app, not the WhatsApp webhook — so an expired shop kept full access.
--
-- Two additions:
--
--   billing_access_state()  - what the shop should be told, including how many
--                             days remain. A trader asking "nimebakiza siku
--                             ngapi" should not have to work it out from a
--                             period end date.
--   private.billing_blocked(company) - the same decision for server-side
--                             callers that already know the company, so the
--                             WhatsApp worker can refuse a write without
--                             pretending to be the user.
--
-- Grace is honoured. Cutting a trader off the moment a period ends, while they
-- are mid-sale and their payment is a day behind, costs more goodwill than the
-- subscription is worth — and billing_grace_days exists precisely because that
-- was already the intention. Reads stay open even when blocked: a shop that
-- cannot pay today must still be able to see what it is owed.

create or replace function private.billing_blocked(p_company_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare s public.subscriptions%rowtype; v_grace integer;
begin
  if p_company_id is null then return null; end if;
  select * into s from public.subscriptions where company_id = p_company_id;
  if not found then return null; end if;

  -- Only these two states block. 'past_due' on its own does not: the sweep
  -- moves a subscription to suspended once grace is spent, and that is the
  -- single place the decision belongs.
  if s.status not in ('suspended', 'cancelled') then return null; end if;

  v_grace := coalesce((select public.billing_grace_days()), 0);
  -- Still inside grace: warn, do not block.
  if s.grace_until is not null and s.grace_until > now() then
    return jsonb_build_object(
      'blocked', false, 'grace', true, 'status', s.status, 'plan', s.plan,
      'graceUntil', s.grace_until,
      'graceDaysLeft', greatest(0, (s.grace_until::date - now()::date)));
  end if;

  return jsonb_build_object(
    'blocked', true, 'grace', false, 'status', s.status, 'plan', s.plan,
    'periodEnd', s.current_period_end, 'graceDays', v_grace);
end $$;

-- ── What the shop sees ───────────────────────────────────────────────────
create or replace function public.billing_access_state()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := private.auth_company_id();
  s public.subscriptions%rowtype;
  v_block jsonb;
  v_due numeric;
begin
  if v_company is null then return null; end if;
  select * into s from public.subscriptions where company_id = v_company;
  if not found then
    return jsonb_build_object('hasSubscription', false, 'blocked', false);
  end if;

  v_block := private.billing_blocked(v_company);
  select coalesce(sum(amount_tzs), 0) into v_due
  from public.subscription_invoices
  where company_id = v_company and status in ('open', 'due', 'overdue');

  return jsonb_build_object(
    'hasSubscription', true,
    'plan', s.plan,
    'cycle', s.cycle,
    'status', s.status,
    'periodEnd', s.current_period_end,
    -- The number the trader actually asks for. Negative means the period has
    -- already ended, which is more useful than clamping it to zero and hiding
    -- how far past due they are.
    'daysLeft', case when s.current_period_end is null then null
                     else (s.current_period_end::date - now()::date) end,
    'trialEndsAt', s.trial_ends_at,
    'trialDaysLeft', case when s.trial_ends_at is null then null
                          else greatest(0, (s.trial_ends_at::date - now()::date)) end,
    'graceUntil', s.grace_until,
    'graceDaysLeft', case when s.grace_until is null then null
                          else greatest(0, (s.grace_until::date - now()::date)) end,
    'blocked', coalesce((v_block->>'blocked')::boolean, false),
    'inGrace', coalesce((v_block->>'grace')::boolean, false),
    'amountDueTzs', v_due
  );
end $$;

revoke all on function public.billing_access_state() from public, anon;
grant execute on function public.billing_access_state() to authenticated;
grant execute on function public.billing_access_state() to service_role;
revoke all on function private.billing_blocked(uuid) from public, anon, authenticated;

-- ── Server-side callers ──────────────────────────────────────────────────
-- The WhatsApp worker already knows which company a message belongs to, and
-- runs as service_role with no end-user JWT, so it cannot use
-- billing_access_state(). private schemas are not exposed through PostgREST;
-- this is the callable wrapper. service_role only — a shop must never be able
-- to ask this about another shop.
create or replace function public.billing_blocked_for(p_company_id uuid)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select private.billing_blocked(p_company_id);
$$;

revoke all on function public.billing_blocked_for(uuid) from public, anon, authenticated;
grant execute on function public.billing_blocked_for(uuid) to service_role;
