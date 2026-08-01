import { useMemo } from 'react';
import { formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

// Daily total-spend bars for the last N days. Pure SVG — no chart library dependency.
// Only counts confirmed receipts. Empty days render as flat baseline (still a slot on
// the axis so gaps are visible).

const DAYS = 30;
const HEIGHT = 140;
const AXIS_H = 20;
const BAR_GAP = 2;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function SpendTrendChart({ receipts }: { receipts: Receipt[] }) {
  const { series, maxTotal, todayTotal, prevTotal, prevPct } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build DAYS slots, oldest → newest.
    const slots: Array<{ date: string; total: number }> = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      slots.push({ date: ymd(d), total: 0 });
    }
    const byDay = new Map(slots.map((s, i) => [s.date, i]));

    for (const r of receipts) {
      if (r.status !== 'confirmed') continue;
      const key = (r.receipt_date ?? r.created_at?.slice(0, 10)) as string | undefined;
      if (!key) continue;
      const idx = byDay.get(key);
      if (idx === undefined) continue;
      slots[idx].total += Number(r.total_amount || 0);
    }

    // Previous window (day -60..-31) for a % comparison.
    const prevStart = new Date(today);
    prevStart.setDate(today.getDate() - DAYS * 2);
    const prevEnd = new Date(today);
    prevEnd.setDate(today.getDate() - DAYS);
    let prev = 0;
    for (const r of receipts) {
      if (r.status !== 'confirmed') continue;
      const key = r.receipt_date ?? r.created_at?.slice(0, 10);
      if (!key) continue;
      const d = new Date(key);
      if (d >= prevStart && d < prevEnd) prev += Number(r.total_amount || 0);
    }

    const totalWindow = slots.reduce((s, x) => s + x.total, 0);
    const maxT = Math.max(1, ...slots.map((s) => s.total));

    const pct = prev > 0 ? ((totalWindow - prev) / prev) * 100 : totalWindow > 0 ? 100 : 0;

    return { series: slots, maxTotal: maxT, todayTotal: totalWindow, prevTotal: prev, prevPct: pct };
  }, [receipts]);

  const isEmpty = todayTotal === 0;

  const width = 600; // Virtual viewport width — SVG scales via viewBox.
  const barW = (width - (series.length - 1) * BAR_GAP) / series.length;
  const chartH = HEIGHT - AXIS_H;

  // Deltas render only when the previous window has data — otherwise the comparison
  // is meaningless ("+100% from zero" is misleading).
  const deltaLabel =
    prevTotal > 0
      ? `${prevPct >= 0 ? '+' : ''}${prevPct.toFixed(0)}% vs previous ${DAYS} days`
      : `${DAYS}-day window`;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-muted">
            Last {DAYS} days
          </div>
          <div className="text-2xl font-semibold text-ink">{formatMoney(todayTotal)}</div>
        </div>
        <div
          className={`text-xs font-medium ${
            prevTotal === 0
              ? 'text-ink-muted'
              : prevPct >= 0
                ? 'text-emerald-600'
                : 'text-red-600'
          }`}
        >
          {deltaLabel}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="h-36 w-full">
        {/* Baseline */}
        <line
          x1="0"
          x2={width}
          y1={chartH}
          y2={chartH}
          stroke="rgb(var(--surface-border))"
          strokeWidth="1"
        />

        {series.map((slot, i) => {
          const h = isEmpty ? 2 : Math.max(2, (slot.total / maxTotal) * (chartH - 4));
          const x = i * (barW + BAR_GAP);
          const y = chartH - h;
          const isFirstOfMonth = slot.date.endsWith('-01');
          return (
            <g key={slot.date}>
              <title>
                {slot.date} · {formatMoney(slot.total)}
              </title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx="2"
                className={isEmpty ? 'fill-surface-border' : 'fill-role-admin/80'}
              />
              {isFirstOfMonth && (
                <text
                  x={x}
                  y={HEIGHT - 4}
                  fontSize="10"
                  className="fill-ink-muted"
                >
                  {slot.date.slice(5, 7)}/{slot.date.slice(2, 4)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
