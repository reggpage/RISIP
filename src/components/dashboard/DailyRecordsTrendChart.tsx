import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/format';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import type { LangCode } from '@/lib/lang';
import type { DailyRecord } from '@/types/db';
import { DAILY_RECORD_CHART_COLORS } from '@/features/dailyRecords/uiRules';

type Gran = 'day' | 'week' | 'month' | 'year';
type SeriesKey = 'sale' | 'expense' | 'stock_purchase' | 'debt_issued' | 'customer_payment' | 'cash';
type Series = { key: SeriesKey; label: string; color: string };

const colors: Record<SeriesKey, string> = {
  sale: DAILY_RECORD_CHART_COLORS.sale,
  expense: DAILY_RECORD_CHART_COLORS.expense,
  stock_purchase: DAILY_RECORD_CHART_COLORS.stockPurchase,
  debt_issued: DAILY_RECORD_CHART_COLORS.debt,
  customer_payment: DAILY_RECORD_CHART_COLORS.customerPayment,
  cash: DAILY_RECORD_CHART_COLORS.cashMovement,
};

const ranges: Record<LangCode, Record<Gran, string>> = {
  en: { day: 'Day', week: 'Week', month: 'Month', year: 'Year' },
  sw: { day: 'Siku', week: 'Wiki', month: 'Mwezi', year: 'Mwaka' },
};

const W = 680;
const H = 250;
const PAD = { l: 58, r: 16, t: 18, b: 32 };

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  value.setHours(0, 0, 0, 0);
  return value;
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}

type Point = { key: string; label: string; values: Record<SeriesKey, number> };

function buildPoints(records: DailyRecord[], gran: Gran): Point[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slots = gran === 'day' ? 30 : gran === 'week' ? 12 : gran === 'month' ? 12 : 5;
  const points: Point[] = [];
  for (let index = slots - 1; index >= 0; index -= 1) {
    let date: Date;
    let key: string;
    let label: string;
    if (gran === 'day') {
      date = new Date(today); date.setDate(today.getDate() - index); key = ymd(date); label = `${date.getDate()}/${date.getMonth() + 1}`;
    } else if (gran === 'week') {
      date = startOfWeek(today); date.setDate(date.getDate() - index * 7); key = ymd(date); label = `${date.getDate()}/${date.getMonth() + 1}`;
    } else if (gran === 'month') {
      date = new Date(today.getFullYear(), today.getMonth() - index, 1); key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; label = date.toLocaleDateString('en-GB', { month: 'short' });
    } else {
      date = new Date(today.getFullYear() - index, 0, 1); key = String(date.getFullYear()); label = key;
    }
    points.push({ key, label, values: { sale: 0, expense: 0, stock_purchase: 0, debt_issued: 0, customer_payment: 0, cash: 0 } });
  }
  const indexByKey = new Map(points.map((point, index) => [point.key, index]));
  for (const record of records) {
    if (record.status !== 'confirmed') continue;
    const date = new Date(record.occurred_at);
    const key = gran === 'day' ? ymd(date) : gran === 'week' ? ymd(startOfWeek(date)) : gran === 'month' ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : String(date.getFullYear());
    const slot = indexByKey.get(key);
    if (slot !== undefined) points[slot].values[record.kind] += Number(record.amount || 0);
  }
  // Stock is money that left the till, so it comes off the cash line too.
  for (const point of points) {
    point.values.cash = point.values.sale + point.values.customer_payment
      - point.values.expense - point.values.stock_purchase;
  }
  return points;
}

export default function DailyRecordsTrendChart({ records, lang = 'en' }: { records: DailyRecord[]; lang?: LangCode }) {
  const [gran, setGran] = useState<Gran>('week');
  const points = useMemo(() => buildPoints(records, gran), [gran, records]);
  const series: Series[] = [
    { key: 'sale', label: lang === 'sw' ? 'Mauzo' : 'Sales', color: colors.sale },
    { key: 'expense', label: lang === 'sw' ? 'Matumizi ya siku' : 'Daily expenses', color: colors.expense },
    { key: 'stock_purchase', label: lang === 'sw' ? 'Ununuzi wa stock' : 'Stock purchases', color: colors.stock_purchase },
    { key: 'debt_issued', label: lang === 'sw' ? 'Mikopo iliyotolewa' : 'Debt issued', color: colors.debt_issued },
    { key: 'customer_payment', label: lang === 'sw' ? 'Malipo ya wateja' : 'Customer payments', color: colors.customer_payment },
    { key: 'cash', label: lang === 'sw' ? 'Makadirio ya mtiririko wa fedha' : 'Cash movement estimate', color: colors.cash },
  ];
  const max = niceMax(Math.max(0, ...points.flatMap((point) => series.map((item) => Math.abs(point.values[item.key])))));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (index: number) => PAD.l + (plotW * index) / Math.max(1, points.length - 1);
  const y = (value: number) => PAD.t + plotH * (1 - (value + max) / (2 * max));
  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  const tabs = (Object.keys(ranges[lang]) as Gran[]).map((value) => ({ value, label: ranges[lang][value] }));

  return (
    <section aria-label={lang === 'sw' ? 'Mwelekeo wa rekodi za siku' : 'Daily Records trend'}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div><h3 className="text-base font-semibold text-ink">{lang === 'sw' ? 'Rekodi za Siku' : 'Daily Records'}</h3><p className="text-xs text-ink-muted">{lang === 'sw' ? 'Mikopo si fedha zilizopokelewa.' : 'Debt issued is not cash received.'}</p></div>
        <UnderlineTabs tabs={tabs} value={gran} onChange={setGran} label={lang === 'sw' ? 'Kipindi cha rekodi' : 'Daily Records time range'} />
      </div>
      <p className="mb-2 text-xs text-ink-muted">{lang === 'sw' ? 'Mtiririko wa fedha = mauzo + malipo ya wateja − matumizi ya siku.' : 'Cash movement estimate = sales + customer payments − daily expenses.'}</p>
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label={lang === 'sw' ? 'Mwelekeo wa rekodi za siku' : 'Daily Records trend chart'}>
        {[-1, -.5, 0, .5, 1].map((fraction) => <g key={fraction}><line x1={PAD.l} x2={W - PAD.r} y1={y(max * fraction)} y2={y(max * fraction)} stroke="rgb(var(--surface-border))" strokeDasharray={fraction === 0 ? '0' : '3 3'} /><text x={PAD.l - 8} y={y(max * fraction) + 4} textAnchor="end" fontSize="11" className="fill-ink" opacity=".7">{Math.round(max * fraction / 1000)}k</text></g>)}
        {series.map((item) => <polyline key={item.key} points={points.map((point, index) => `${x(index)},${y(point.values[item.key])}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.key === 'cash' ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />)}
        {points.map((point, index) => index % labelStep === 0 || index === points.length - 1 ? <text key={point.key} x={x(index)} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink" opacity=".7">{point.label}</text> : null)}
        {points.map((point, index) => <g key={`${point.key}-tips`}>{series.map((item) => <circle key={item.key} cx={x(index)} cy={y(point.values[item.key])} r="2.5" fill={item.color}><title>{`${point.label}: ${item.label} ${formatMoney(point.values[item.key])}`}</title></circle>)}</g>)}
      </svg></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">{series.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    </section>
  );
}
