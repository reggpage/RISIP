import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type BuchaReportingSnapshot = {
  sales?: {
    total?: number; settled_sales?: number; cash_sales?: number; credit_sales?: number;
    by_payment_method?: Record<string, number>;
    items?: Array<{ product_name: string; unit?: string | null; quantity: number; total: number; average_unit_price?: number }>;
  };
  expenses?: number;
  customer_payments?: number;
  supplier_payments?: number;
  cash_movement?: number;
  profit?: { estimated_profit?: number; gross_profit?: number; cogs?: number; coverage?: number; products_missing_cost?: string[]; unvalued_stock_losses?: number; valuation_complete?: boolean };
  customer_receivables?: Array<{ party_name: string; outstanding: number }>;
  supplier_payables?: Array<{ supplier_name: string; outstanding: number }>;
  stock?: Array<{ product_name: string; unit?: string | null; on_hand: number; incomplete_purchases?: boolean }>;
  stock_loss?: { amount?: number; quantity?: number; unvalued_events?: number; valuation_complete?: boolean; details?: ReportDetail[] };
  owner_use?: { amount?: number; quantity?: number; events?: number; details?: ReportDetail[] };
  whole_animals?: {
    count?: number; total?: number; pending_breakdown?: number; breakdown_outputs?: number; allocation_incomplete?: number;
    procurements?: Array<{ animal_type: string; animal_count: number; purchase_total: number; breakdown_status: 'confirmed' | 'pending' }>;
  };
};

type ReportDetail = { product_name: string; quantity: number; unit?: string | null; value?: number; reason?: string | null };

export type ReportingRange = 'today' | 'yesterday' | 'week' | 'month';

export type BuchaReportingState = {
  status: 'loading' | 'ready' | 'error';
  snapshot: BuchaReportingSnapshot | null;
  error: Error | null;
};

function darRange(preset: ReportingRange): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const todayStart = new Date(Date.UTC(value('year'), value('month') - 1, value('day')) - 3 * 60 * 60 * 1000);
  let from = new Date(todayStart);
  let to = new Date();
  if (preset === 'yesterday') {
    from = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    to = todayStart;
  } else if (preset === 'week') {
    const darWeekday = new Date(todayStart.getTime() + 3 * 60 * 60 * 1000).getUTCDay();
    const daysSinceMonday = (darWeekday + 6) % 7;
    from = new Date(todayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  } else if (preset === 'month') {
    from = new Date(Date.UTC(value('year'), value('month') - 1, 1) - 3 * 60 * 60 * 1000);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useBuchaReporting(range: ReportingRange = 'today'): BuchaReportingState & { reload: () => void } {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<BuchaReportingState>({ status: 'loading', snapshot: null, error: null });
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ status: 'loading', snapshot: current.snapshot, error: null }));
    const dates = darRange(range);
    void supabase.rpc('bucha_reporting_snapshot', { p_from: dates.from, p_to: dates.to })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ status: 'error', snapshot: null, error });
        } else {
          setState({ status: 'ready', snapshot: (data ?? {}) as BuchaReportingSnapshot, error: null });
        }
      });
    return () => { cancelled = true; };
  }, [range, reloadKey]);

  return { ...state, reload };
}
