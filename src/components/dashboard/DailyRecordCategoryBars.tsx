import { useMemo } from 'react';
import { formatMoney } from '@/lib/format';
import type { DailyRecord } from '@/types/db';

export default function DailyRecordCategoryBars({ records }: { records: DailyRecord[] }) {
  const rows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const record of records) {
      if (record.status !== 'confirmed' || record.kind !== 'expense') continue;
      const category = record.description || 'Other';
      totals.set(category, (totals.get(category) ?? 0) + Number(record.amount || 0));
    }
    const grand = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0);
    return Array.from(totals.entries()).map(([category, amount]) => ({ category, amount, pct: grand ? (amount / grand) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
  }, [records]);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return <section aria-label="Daily record spend by category"><div className="mb-3 flex items-end justify-between"><div><h3 className="text-sm font-semibold text-ink">Daily record expenses by category</h3><p className="text-xs text-ink-muted">Confirmed daily records · selected period: current loaded timeline</p></div><strong className="font-display text-sm text-ink">{formatMoney(total)}</strong></div>{rows.length === 0 ? <p className="text-sm text-ink-muted">No confirmed daily-record expenses in this period.</p> : <div className="space-y-3">{rows.map((row) => <div key={row.category}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate text-ink">{row.category}</span><span className="shrink-0 text-ink-muted">{formatMoney(row.amount)} · {row.pct.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-role-admin" style={{ width: `${Math.max(2, row.pct)}%` }} /></div></div>)}</div>}</section>;
}
