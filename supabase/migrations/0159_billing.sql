-- Subscriptions, and the money that keeps Risip running.
--
-- WHY THIS SHAPE. Snippe has no subscriptions, no card on file and no mandate.
-- That is not a gap in Snippe; it is how mobile money works in Tanzania. Every
-- month the shopkeeper has to say yes on his own handset. So the recurring part
-- is ours: we decide when a period ends, we raise an invoice, we ask over
-- WhatsApp, and Snippe only carries the one payment.
--
-- THREE DECISIONS TAKEN HERE, so they are not re-argued later:
--
--   1. THE INVOICE SNAPSHOTS ITS OWN PRICE. billing_plans can change tomorrow;
--      what a shop was charged in October is what it was charged in October.
--      An invoice never reads its amount from the plan table.
--   2. ONE INVOICE PER PERIOD, enforced by a unique index rather than by
--      careful code. A cron that fires twice, a webhook retried five times and
--      a founder pressing a button by hand all have to land on the same row.
--   3. PAYING BY HAND IS A FIRST-CLASS PATH, not a hack. Before Snippe is
--      wired, and any day Snippe is down, money still arrives by M-Pesa and
--      somebody still has to mark it. That is recorded with WHO marked it.
--
-- Append-only where it matters: subscription_events is never updated and never
-- deleted, because "did he pay?" is a question that must have an answer months
-- later, and the answer cannot be something we can quietly edit.

-- ── The plans, as data rather than as constants in code ────────────────
create table if not exists public.billing_plans (
  code               text primary key,
  name_sw            text not null,
  monthly_tzs        integer not null check (monthly_tzs > 0),
  yearly_tzs         integer not null check (yearly_tzs > 0),
  /** Billable WhatsApp messages included, counted in and out. */
  message_allowance  integer not null check (message_allowance > 0),
  /** Charged per message beyond the allowance, on the top plan only. */
  overage_tzs        integer not null check (overage_tzs > 0),
  max_users          smallint not null check (max_users > 0),
  max_projects       smallint not null check (max_projects > 0),
  sort_order         smallint not null,
  created_at         timestamptz not null default clock_timestamp()
);

comment on table public.billing_plans is
  'What each plan costs and allows. Prices live here, not in code, so a change '
  'is a data change. Invoices snapshot the amount and never read it back.';

insert into public.billing_plans
  (code, name_sw, monthly_tzs, yearly_tzs, message_allowance, overage_tzs, max_users, max_projects, sort_order)
values
  ('ndogo', 'Ndogo', 29999, 299990, 300, 75, 1, 1, 1),
  ('kati',  'Kati',  39999, 399990, 500, 75, 3, 1, 2),
  ('kubwa', 'Kubwa', 70000, 700000, 700, 75, 10, 3, 3)
on conflict (code) do nothing;

-- ── One subscription per company ───────────────────────────────────────
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null unique references public.companies(id) on delete cascade,
  plan                  text not null references public.billing_plans(code),
  cycle                 text not null check (cycle in ('monthly', 'yearly')),
  /**
   * trialing   the free week, everything works
   * active     paid, inside the period
   * past_due   the period ended unpaid, inside the grace days, still writable
   * suspended  grace spent: the shop can READ its books but not add to them
   * cancelled  it asked to stop. Data is kept.
   */
  status                text not null default 'trialing'
                          check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at         timestamptz,
  current_period_start  date not null,
  current_period_end    date not null,
  /** How long past current_period_end the shop keeps writing. */
  grace_until           date,
  /** The handset that receives the USSD push. Not always the WhatsApp one. */
  billing_phone         text,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default clock_timestamp(),
  updated_at            timestamptz not null default clock_timestamp(),
  constraint subscriptions_period_forward check (current_period_end > current_period_start)
);

comment on column public.subscriptions.status is
  'suspended never deletes and never hides history: the shop reads its own '
  'books forever, it only stops being able to add to them.';

create index if not exists subscriptions_due_idx
  on public.subscriptions (current_period_end)
  where status in ('trialing', 'active', 'past_due');

-- ── What was charged, for which stretch of time ────────────────────────
create table if not exists public.subscription_invoices (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references public.subscriptions(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete cascade,
  /** Snapshots. The plan table may change; this invoice may not. */
  plan              text not null,
  cycle             text not null check (cycle in ('monthly', 'yearly')),
  amount_tzs        integer not null check (amount_tzs > 0),
  period_start      date not null,
  period_end        date not null,
  status            text not null default 'open'
                      check (status in ('open', 'paid', 'failed', 'void')),
  /** Snippe's payment reference, once one exists. */
  snippe_reference  text,
  snippe_status     text,
  attempts          smallint not null default 0 check (attempts >= 0),
  paid_at           timestamptz,
  /**
   * Set when a human marked this paid instead of a webhook. Never a silent
   * path: money that arrives outside Snippe still names who accepted it.
   */
  paid_manually_by  uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default clock_timestamp(),
  constraint subscription_invoices_period_forward check (period_end > period_start)
);

-- ONE INVOICE PER PERIOD. This is the idempotency anchor for the whole system:
-- a cron that fires twice, a webhook retried five times and a button pressed by
-- hand all collide here instead of charging a shop twice.
create unique index if not exists subscription_invoices_one_per_period
  on public.subscription_invoices (subscription_id, period_start);

create unique index if not exists subscription_invoices_snippe_reference_uniq
  on public.subscription_invoices (snippe_reference)
  where snippe_reference is not null;

create index if not exists subscription_invoices_open_idx
  on public.subscription_invoices (company_id, created_at desc);

-- ── Every webhook and every state change, kept forever ─────────────────
create table if not exists public.subscription_events (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references public.companies(id) on delete cascade,
  invoice_id         uuid references public.subscription_invoices(id) on delete set null,
  /**
   * Snippe's own event id. Snippe retries up to five times, so this is what
   * stops one payment being recorded five times.
   */
  external_event_id  text,
  kind               text not null,
  /**
   * The webhook body as received. This is the shopkeeper's OWN billing data,
   * not customer data, and it is the evidence in any argument about whether a
   * payment happened. It is deliberately not trimmed.
   */
  payload            jsonb,
  created_at         timestamptz not null default clock_timestamp()
);

create unique index if not exists subscription_events_external_uniq
  on public.subscription_events (external_event_id)
  where external_event_id is not null;

create index if not exists subscription_events_by_company_idx
  on public.subscription_events (company_id, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.billing_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_events enable row level security;

-- The price list is not a secret; a signed-in user may read it.
drop policy if exists billing_plans_select on public.billing_plans;
create policy billing_plans_select on public.billing_plans
  for select to authenticated
  using (true);

-- Billing is the owner's business. Not the accountant's, not the worker's.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() = 'owner'::user_role
  );

drop policy if exists subscription_invoices_select on public.subscription_invoices;
create policy subscription_invoices_select on public.subscription_invoices
  for select to authenticated
  using (
    company_id = private.auth_company_id()
    and private.auth_role() = 'owner'::user_role
  );

-- subscription_events gets NO policy on purpose. RLS on with no policy is deny,
-- so raw webhook bodies are reachable by service_role alone. The owner sees his
-- payment history through invoices, which is the readable version of the same
-- facts without the provider's internals.

revoke all on public.billing_plans from public, anon;
revoke all on public.subscriptions from public, anon;
revoke all on public.subscription_invoices from public, anon;
revoke all on public.subscription_events from public, anon;

grant select on public.billing_plans to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.subscription_invoices to authenticated;
