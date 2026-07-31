import { formatMoney } from '@/lib/format';
import type { CategoryBreakdown } from '@/features/dashboard/useDashboardData';

// Deterministic tint per category so bars stay consistent across renders.
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

export default function CategoryBar({ item }: { item: CategoryBreakdown }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{item.category}</span>
        <span className="text-ink-muted">
          {formatMoney(item.total)} · {item.pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${tintFor(item.category)}`}
          style={{ width: `${Math.max(2, item.pct)}%` }}
        />
      </div>
    </div>
  );
}
