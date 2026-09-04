-- Tighter message allowances on every plan, decided by the owner.
--
--   Kianzio  150 -> 100      Ndogo  300 -> 250
--   Kati     500 -> 450      Kubwa  700 -> 650
--
-- WHAT THIS BUYS. Revenue per message rises on all four, and Kati stops being
-- the outlier it was: 150, 120, 89 and 108 shillings a message against a
-- measured cost of about 65. At the ceiling every plan now clears a third,
-- where Kati used to clear almost nothing.
--
-- WHAT IT COSTS. An allowance is not only a cost ceiling, it is how much of the
-- shop's month fits inside the plan. At the traffic mix actually measured, 218
-- messages produced 47 records, so 100 messages is roughly 22 records: under
-- one a day. That is the number to watch if starter shops churn, and the first
-- thing to raise if they do.
--
-- The allowance is read live when usage is checked, so this takes effect for
-- existing subscriptions on the next sweep. Invoices already raised snapshot
-- their own amount and are untouched by this.

update public.billing_plans set message_allowance = 100 where code = 'kianzio';
update public.billing_plans set message_allowance = 250 where code = 'ndogo';
update public.billing_plans set message_allowance = 450 where code = 'kati';
update public.billing_plans set message_allowance = 650 where code = 'kubwa';

-- No plan may earn less per message than a message costs to serve. TSh 65 is
-- measured, not assumed: thirty days of real cache tokens at published prices.
-- A future allowance rise that breaks the economics fails here rather than in a
-- month of invoices.
do $$
declare bad text;
begin
  select string_agg(format('%s earns TSh %s/message', code,
                           round(monthly_tzs::numeric / message_allowance, 1)), '; ')
    into bad
  from public.billing_plans
  where monthly_tzs::numeric / message_allowance < 65;

  if bad is not null then
    raise exception 'a plan would sell messages below the TSh 65 they cost: %', bad;
  end if;
end $$;
