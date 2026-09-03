import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// What the owner is allowed to know about his own bill.
//
// EVERYTHING HERE IS A READ. There is no way to change a plan, void an invoice
// or mark anything paid from this hook, and that is deliberate: only a signed
// Snippe webhook may say a period was paid for. A dashboard that could also say
// it would be a second way to grant a month, and the second way is always the
// one nobody tests.
//
// RLS does the rest. subscriptions and subscription_invoices are readable by
// the OWNER of that company alone, so a worker who guesses this URL gets an
// empty page rather than somebody else's money.

export type BillingPlan = {
  code: string;
  name_sw: string;
  monthly_tzs: number;
  yearly_tzs: number;
  message_allowance: number;
  overage_tzs: number;
  max_users: number;
  max_projects: number;
  sort_order: number;
};

export type Subscription = {
  id: string;
  plan: string;
  cycle: 'monthly' | 'yearly';
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  grace_until: string | null;
};

export type Invoice = {
  id: string;
  plan: string;
  cycle: string;
  amount_tzs: number;
  period_start: string;
  period_end: string;
  status: 'open' | 'paid' | 'failed' | 'void';
  paid_at: string | null;
  created_at: string;
};

export type Usage = {
  period_start: string;
  period_end: string;
  messages_used: number;
  allowance: number;
  over_by: number;
  consecutive_over: number;
  refreshed_at: string;
} | null;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
    status: 'ready';
    subscription: Subscription | null;
    invoices: Invoice[];
    usage: Usage;
    plans: BillingPlan[];
  };

export function useBilling() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    // Four reads, together. A billing page that renders the plan before the
    // invoices arrive shows a shop "TSh 39,999" beside an empty history, which
    // reads like a charge nobody can account for.
    const [subRes, invRes, usageRes, planRes] = await Promise.all([
      supabase.from('subscriptions')
        .select('id, plan, cycle, status, trial_ends_at, current_period_start, current_period_end, grace_until')
        .maybeSingle(),
      supabase.from('subscription_invoices')
        .select('id, plan, cycle, amount_tzs, period_start, period_end, status, paid_at, created_at')
        .order('period_start', { ascending: false })
        .limit(24),
      supabase.rpc('billing_usage_now'),
      supabase.from('billing_plans')
        .select('code, name_sw, monthly_tzs, yearly_tzs, message_allowance, overage_tzs, max_users, max_projects, sort_order')
        .order('sort_order'),
    ]);

    const failed = subRes.error ?? invRes.error ?? planRes.error;
    if (failed) {
      setState({ status: 'error', message: failed.message });
      return;
    }

    setState({
      status: 'ready',
      subscription: (subRes.data as Subscription | null) ?? null,
      invoices: (invRes.data ?? []) as Invoice[],
      // The usage RPC returning nothing is not an error: a shop in its first
      // hours has a subscription and no counted period yet.
      usage: (usageRes.data as Usage) ?? null,
      plans: (planRes.data ?? []) as BillingPlan[],
    });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { state, refresh };
}

/** Days from today until an ISO date, floored at zero. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((then - today) / 86_400_000));
}

export type Banner =
  | { kind: 'none' }
  | { kind: 'trial'; daysLeft: number | null }
  | { kind: 'overdue'; daysLeft: number | null }
  | { kind: 'suspended' };

/**
 * WHICH ONE THING TO SAY, or nothing at all.
 *
 * A page that warns about everything warns about nothing, so at most one banner
 * shows and only when it is true. A shop that has paid and is inside its period
 * sees none, which is the right amount of noise for somebody who is up to date.
 *
 * Pure, and separate from the component, because "what does a suspended shop
 * see?" is a question worth answering in a test rather than by signing in as
 * five different shops.
 */
export function billingBanner(subscription: Subscription | null): Banner {
  if (!subscription) return { kind: 'none' };
  switch (subscription.status) {
    case 'suspended':
      return { kind: 'suspended' };
    case 'past_due':
      return { kind: 'overdue', daysLeft: daysUntil(subscription.grace_until) };
    case 'trialing':
      return { kind: 'trial', daysLeft: daysUntil(subscription.trial_ends_at) };
    // A cancelled shop is not nagged. It asked to stop, it has not been cut
    // off mid-period, and a banner would be an argument it did not start.
    case 'cancelled':
    case 'active':
    default:
      return { kind: 'none' };
  }
}
