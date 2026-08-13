import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/format';
import type { DailyRecord } from '@/types/db';

type Series = { key: 'sale' | 'expense' | 'debt_issued' | 'customer_payment' | 'cash'; label: string; color: string };
const series: Series[] = [
  { key: 'sale', label: 'Sales', color: 'rgb(var(--role-admin))' },
  { key: 'expense', label: 'Daily expenses', color: 'rgb(234 88 12)' },
  { key: 'debt_issued', label: 'Debt issued', color: 'rgb(124 58 237)' },
  { key: 'customer_payment', label: 'Customer payments', color: 'rgb(5 150 105)' },
  { key: 'cash', label: 'Cash movement estimate', color: 'rgb(15 118 110)' },
];

const W = 680; const H = 250; const PAD = { l: 58, r: 16, t: 18, b: 32 };
function ymd(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function niceMax(value: number) { if (value <= 0) return 1; const p = 10 ** Math.floor(Math.log10(value)); const n = value / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

type Point = { key: string; label: string; values: Record<Series['key'], number> };
function buildPoints(records: DailyRecord[]): Point[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const points: Point[] = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - (13 - index));
    return { key: ymd(date), label: `${date.getDate()}/${date.getMonth() + 1}`, values: { sale: 0, expense: 0, debt_issued: 0, customer_payment: 0, cash: 0 } };
  });
  const index = new Map(points.map((point, i) => [point.key, i]));
  for (const record of records) {
    if (record.status !== 'confirmed') continue;
    const slot = index.get(ymd(new Date(record.occurred_at)));
    if (slot === undefined) continue;
    const amount = Number(record.amount || 0);
    points[slot].values[record.kind] += amount;
  }
  for (const point of points) point.values.cash = point.values.sale + point.values.customer_payment - point.values.expense;
  return points;
}

export default function DailyRecordsTrendChart({ records }: { records: DailyRecord[] }) {
  const [visible, setVisible] = useState<Record<Series['key'], boolean>>({ sale: true, expense: true, debt_issued: true, customer_payment: true, cash: true });
  const points = useMemo(() => buildPoints(records), [records]);
  const max = niceMax(Math.max(0, ...points.flatMap((point) => series.filter((item) => visible[item.key]).map((item) => Math.abs(point.values[item.key])))));
  const plotW = W - PAD.l - PAD.r; const plotH = H - PAD.t - PAD.b; const x = (i: number) => PAD.l + (plotW * i) / Math.max(1, points.length - 1); const y = (value: number) => PAD.t + plotH * (1 - (value + max) / (2 * max));
  return <div>
    <div className="mb-3 flex flex-wrap gap-2" aria-label="Daily Records chart series">
      {series.map((item) => <button key={item.key} type="button" onClick={() => setVisible((current) => ({ ...current, [item.key]: !current[item.key] }))} className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${visible[item.key] ? 'bg-surface-muted text-ink' : 'text-ink-muted line-through'}`}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</button>)}
    </div>
    <p className="mb-2 text-xs text-ink-muted">Cash movement estimate = sales + customer payments − daily expenses. Debt issued is shown separately and is not cash received.</p>
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label="Daily records trend chart">
      {[-1, -.5, 0, .5, 1].map((fraction) => <g key={fraction}><line x1={PAD.l} x2={W - PAD.r} y1={y(max * fraction)} y2={y(max * fraction)} stroke="rgb(var(--surface-border))" strokeDasharray={fraction === 0 ? '0' : '3 3'} /><text x={PAD.l - 8} y={y(max * fraction) + 4} textAnchor="end" fontSize="11" className="fill-ink" opacity=".7">{Math.round(max * fraction / 1000)}k</text></g>)}
      {series.filter((item) => visible[item.key]).map((item) => <polyline key={item.key} points={points.map((point, i) => `${x(i)},${y(point.values[item.key])}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.key === 'cash' ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />)}
      {points.map((point, i) => i % 2 === 0 || i === points.length - 1 ? <text key={point.key} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink" opacity=".7">{point.label}</text> : null)}
      {points.map((point, i) => <g key={`${point.key}-tips`}>{series.filter((item) => visible[item.key]).map((item) => <circle key={item.key} cx={x(i)} cy={y(point.values[item.key])} r="2.5" fill={item.color}><title>{`${point.label}: ${item.label} ${formatMoney(point.values[item.key])}`}</title></circle>)}</g>)}
    </svg></div>
  </div>;
}
