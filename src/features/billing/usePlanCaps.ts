import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// What this shop's PLAn allows, readable by any member — not just the owner.
//
// The frontend gates features against this map. Billing stays owner-only under
// RLS (see 0159), but a worker at the till has to know, without asking the
// owner, whether that packet can be SCANNED or must be typed. company_plan_caps
// answers that for every role; it reads the subscription behind the scenes and
// never exposes invoice history.
//
// A shop with NO subscription gets every capability open, matching migration
// 0161's philosophy: no billing row is no opinion, and the free week is not
// meant to feel crippled.

export type PlanCaps = {
  plan: string | null;
  status: string | null;
  barcode_sell: boolean;
  barcode_register: boolean;
  reports: boolean;
  debts: boolean;
  profit_per_product: boolean;
  pdf_invoices: boolean;
  export: boolean;
  compare_shops: boolean;
  b2b_orders: boolean;
  max_users: number;
  max_projects: number;
  message_allowance: number | null;
};

const OPEN: PlanCaps = {
  plan: null,
  status: null,
  barcode_sell: true,
  barcode_register: true,
  reports: true,
  debts: true,
  profit_per_product: true,
  pdf_invoices: true,
  export: true,
  compare_shops: true,
  b2b_orders: true,
  max_users: 999,
  max_projects: 999,
  message_allowance: null,
};

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; caps: PlanCaps };

export function usePlanCaps() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    // The RPC failing (for example, before the migration is applied) must fail
    // OPEN: every feature stays unlocked. Locking a shop out of selling because
    // a capability check errored would be the worst possible failure.
    try {
      const { data, error } = await (supabase as any).rpc('company_plan_caps');
      if (error) { setState({ status: 'ready', caps: OPEN }); return; }
      const row = (data ?? {}) as Record<string, unknown>;
      setState({
        status: 'ready',
        caps: {
          plan: (row.plan as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          barcode_sell: row.barcode_sell !== false,
          barcode_register: row.barcode_register !== false,
          reports: row.reports !== false,
          debts: row.debts !== false,
          profit_per_product: row.profit_per_product !== false,
          pdf_invoices: row.pdf_invoices !== false,
          export: row.export !== false,
          compare_shops: row.compare_shops !== false,
          b2b_orders: row.b2b_orders !== false,
          max_users: Number(row.max_users ?? 999),
          max_projects: Number(row.max_projects ?? 999),
          message_allowance: row.message_allowance == null ? null : Number(row.message_allowance),
        },
      });
    } catch {
      setState({ status: 'ready', caps: OPEN });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { state, refresh };
}