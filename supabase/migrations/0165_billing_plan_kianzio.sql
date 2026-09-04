-- A starter plan below Ndogo, at TSh 15,000 for 150 messages.
--
-- WHY THIS PRICE AND THIS ALLOWANCE. The cost of a message was measured rather
-- than assumed: thirty days of real traffic, the cache tokens the provider
-- actually billed, at published prices. It came to about TSh 65, of which the
-- cached prompt prefix is TSh 55; 69% of messages never reach the more
-- expensive model at all. Against that, 150 messages at 15,000 leaves roughly
-- TSh 5,900 at the ceiling, near 40%, and more when a shop does not fill its
-- allowance.
--
-- 150 IS THE PART THAT MATTERS. Capture is not what fills an allowance: of 218
-- real messages, only 34% wrote a record and 48% were questions about the books
-- already kept. At the measured 1.77 messages per record, 150 is roughly 50
-- records a month plus the questions around them. Smaller than this and the
-- plan stops being enough to form a habit, which is worse for the shop and for
-- Risip than having no starter plan at all.
--
-- The overage matches the other plans. It is only charged on the top plan.

insert into public.billing_plans
  (code, name_sw, monthly_tzs, yearly_tzs, message_allowance, overage_tzs, max_users, max_projects, sort_order)
values
  ('kianzio', 'Kianzio', 15000, 150000, 150, 75, 1, 1, 0)
on conflict (code) do nothing;

comment on table public.billing_plans is
  'What each plan costs and allows. Prices live here, not in code, so a change '
  'is a data change. Invoices snapshot the amount and never read it back.';
