import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useReceipts } from '@/features/receipts/useReceipts';
import type { Receipt } from '@/types/db';

export type CategoryBreakdown = {
  category: string;
  total: number;
  count: number;
  pct: number;
};

export type DashboardData = {
  loading: boolean;
  totalExpenses: number;
  confirmedCount: number;
  activeWorkers: number;
  invoicesThisMonth: number;
  categories: CategoryBreakdown[];
  recent: Receipt[];
  // Raw receipt stream (up to `limit`) so downstream widgets like SpendTrendChart
  // can compute their own aggregates without a second query.
  receipts: Receipt[];
};

// Client-side aggregation. Fine for MVP (up to a few thousand rows). If/when we outgrow
// this we'll add a get_dashboard_metrics RPC that returns pre-computed numbers.
export function useDashboardData(projectId?: string): DashboardData {
  const { state: receiptsState } = useReceipts(projectId, 500);
  const [activeWorkers, setActiveWorkers] = useState(0);
  const [invoicesThisMonth, setInvoicesThisMonth] = useState(0);

  useEffect(() => {
    // Workers in the same company (RLS scopes the read).
    void (async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'worker')
        .is('deactivated_at', null);
      setActiveWorkers(count ?? 0);
    })();

    // Invoices generated this calendar month (any status).
    void (async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      let q = supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart);
      if (projectId) q = q.eq('project_id', projectId);
      const { count } = await q;
      setInvoicesThisMonth(count ?? 0);
    })();
  }, [projectId]);

  return useMemo(() => {
    if (receiptsState.status !== 'ready') {
      return {
        loading: receiptsState.status === 'loading',
        totalExpenses: 0,
        confirmedCount: 0,
        activeWorkers,
        invoicesThisMonth,
        categories: [],
        recent: [],
        receipts: [],
      };
    }
    const confirmed = receiptsState.receipts.filter((r) => r.status === 'confirmed');
    const totalExpenses = confirmed.reduce((s, r) => s + (r.total_amount ?? 0), 0);

    const byCat = new Map<string, { total: number; count: number }>();
    for (const r of confirmed) {
      const key = r.category ?? 'Other';
      const cur = byCat.get(key) ?? { total: 0, count: 0 };
      cur.total += r.total_amount ?? 0;
      cur.count += 1;
      byCat.set(key, cur);
    }
    const categories: CategoryBreakdown[] = Array.from(byCat.entries())
      .map(([category, v]) => ({
        category,
        total: v.total,
        count: v.count,
        pct: totalExpenses > 0 ? (v.total / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      loading: false,
      totalExpenses,
      confirmedCount: confirmed.length,
      activeWorkers,
      invoicesThisMonth,
      categories,
      recent: receiptsState.receipts.slice(0, 8),
      receipts: receiptsState.receipts,
    };
  }, [receiptsState, activeWorkers, invoicesThisMonth]);
}
