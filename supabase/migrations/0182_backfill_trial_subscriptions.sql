-- Give the shops that registered BEFORE trials existed the same five days
-- everybody else got.
--
-- THE PROBLEM, PLAINLY. `wa_create_business` and
-- `wa_create_business_classified` have written a five-day trial since the
-- onboarding work, so a shop created today sees a trial banner. Every company
-- that registered before that has no row in `subscriptions` at all, and
-- `billingBanner(null)` is deliberately `{ kind: 'none' }` — a page that warns
-- about everything warns about nothing. So those shops were not on a trial and
-- not off one. They were simply absent from billing, which is why an owner
-- looking at his dashboard saw nothing and a shop that had never been asked
-- for money was never asked.
--
-- WHAT THIS DOES. One row per company that has none, on the cheapest plan, with
-- `trial_ends_at` five days from now. NOT from the company's `created_at`:
-- backdating would expire every one of them the moment the sweep next runs,
-- which is not a trial but a bill sent to somebody who never saw one coming.
--
-- WHY IT IS SAFE TO RUN TWICE. `not exists` plus the unique constraint on
-- `company_id`. A company that already has a subscription — paid, trialling,
-- suspended, cancelled — is left exactly as it is, because being ABSENT is the
-- only condition this fixes.

insert into public.subscriptions (
  company_id, plan, cycle, status, trial_ends_at,
  current_period_start, current_period_end, grace_until
)
select c.id,
       'ndogo',
       'monthly',
       'trialing',
       clock_timestamp() + interval '5 days',
       current_date,
       current_date + interval '1 month',
       null
  from public.companies c
 where not exists (
         select 1 from public.subscriptions s where s.company_id = c.id
       )
   and exists (
         select 1 from public.billing_plans p where p.code = 'ndogo'
       )
on conflict (company_id) do nothing;

comment on table public.subscriptions is
  'One row per company. Every company has one: created with a five-day trial by '
  'the onboarding RPCs, and backfilled for companies that registered earlier.';