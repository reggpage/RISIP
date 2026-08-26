import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type BuchaReportingSnapshot = {
  sales?: { total?: number; cash_sales?: number; credit_sales?: number };
  expenses?: number;
  customer_payments?: number;
  profit?: { estimated_profit?: number; coverage?: number; products_missing_cost?: string[]; unvalued_stock_losses?: number };
  customer_receivables?: Array<{ party_name: string; outstanding: number }>;
  supplier_payables?: Array<{ supplier_name: string; outstanding: number }>;
  stock?: Array<{ product_name: string; unit?: string | null; on_hand: number; incomplete_purchases?: boolean }>;
  stock_loss?: { amount?: number; quantity?: number; unvalued_events?: number; valuation_complete?: boolean };
  owner_use?: { amount?: number; quantity?: number; events?: number };
  whole_animals?: { count?: number; total?: number; pending_breakdown?: number; breakdown_outputs?: number };
};

export type BuchaReportingState = {
  status: 'loading' | 'ready' | 'error';
  snapshot: BuchaReportingSnapshot | null;
  error: Error | null;
};

export function useBuchaReporting(): BuchaReportingState & { reload: () => void } {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<BuchaReportingState>({ status: 'loading', snapshot: null, error: null });
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ status: 'loading', snapshot: current.snapshot, error: null }));
    void supabase.rpc('bucha_reporting_snapshot', { p_from: null, p_to: null })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ status: 'error', snapshot: null, error });
        } else {
          setState({ status: 'ready', snapshot: (data ?? {}) as BuchaReportingSnapshot, error: null });
        }
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  return { ...state, reload };
}
