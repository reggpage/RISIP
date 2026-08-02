import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

type Gran = 'day' | 'week' | 'month' | 'year';
const GRAN_LABEL: Record<Gran, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

// Deterministic tint per category so colours stay consistent across renders.
const PALETTE = [
  'bg-role-admin', 'bg-role-worker', 'bg-role-accountant',
  'bg-sky-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-fuchsia-500', 'bg-rose-500', 'bg-indigo-500',
  'bg-lime-500', 'bg-cyan-500', 'bg-orange-500',
];
function tintFor(cat: string): string {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function windowStart(gran: Gran): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (gran === 'day') return d.getTime();
  if (gran === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getTime(); }
  if (gran === 'month') { d.setDate(1); return d.getTime(); }
  d.setMonth(0, 1); // year
  return d.getTime();
}

type CatItem = { category: string; total: number; pct: number };

function compute(receipts: Receipt[], gran: Gran): CatItem[] {
  const start = windowStart(gran);
  const byCat = new Map<string, number>();
  let total = 0;
  for (const r of receipts) {
    if (r.status !== 'confirmed') continue;
    const key = r.receipt_date ?? r.created_at?.slice(0, 10);
    if (!key) continue;
    const t = new Date(key).getTime();
    if (isNaN(t) || t < start) continue;
    const amt = Number(r.total_amount || 0);
    const cat = r.category ?? 'Other';
    byCat.set(cat, (byCat.get(cat) ?? 0) + amt);
    total += amt;
  }
  return Array.from(byCat.entries())
    .map(([category, tot]) => ({ category, total: tot, pct: total > 0 ? (tot / total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

// One category row with an animated bar (width grows from 0 on mount / granularity change).
function Row({ item, tint, delay }: { item: CatItem; tint: string; delay: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setW(Math.max(2, item.pct)), 40 + delay);
    return () => window.clearTimeout(id);
  }, [item.pct, delay]);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium text-ink">{item.category}</span>
        <span className="shrink-0 text-ink-muted">{formatMoney(item.total)} · {item.pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full rounded-full ${tint}`} style={{ width: `${w}%`, transition: 'width 700ms cubic-bezier(.22,1,.36,1)' }} />
      </div>
    </div>
  );
}

export default function SpendByCategory({ receipts }: { receipts: Receipt[] }) {
  const [gran, setGran] = useState<Gran>('month');
  const items = useMemo(() => compute(receipts, gran), [receipts, gran]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">Spend by category</h3>
        <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5 text-xs">
          {(Object.keys(GRAN_LABEL) as Gran[]).map((g) => (
            <button key={g} type="button" onClick={() => setGran(g)}
              className={'rounded-md px-2 py-1 font-medium transition ' + (gran === g ? 'bg-role-admin/10 text-role-admin' : 'text-ink-muted hover:text-ink')}>
              {GRAN_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No spend in this period" description="Try a wider range (Month or Year)." />
      ) : (
        <div key={gran} className="flex flex-col gap-3">
          {items.map((it, i) => <Row key={it.category} item={it} tint={tintFor(it.category)} delay={i * 80} />)}
        </div>
      )}
    </div>
  );
}
