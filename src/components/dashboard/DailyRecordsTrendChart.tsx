import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/format';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import type { LangCode } from '@/lib/lang';
import type { DailyRecord } from '@/types/db';
import { DAILY_RECORD_CHART_COLORS } from '@/features/dailyRecords/uiRules';

type Gran = 'day' | 'week' | 'month' | 'year';
type SeriesKey = 'sale' | 'expense' | 'stock_purchase' | 'debt_issued' | 'customer_payment'
  | 'stock_loss' | 'owner_use' | 'supplier_payable' | 'supplier_payment'
  | 'whole_animal_procurement' | 'cash';
type Series = { key: SeriesKey; label: string; color: string };

const colors: Record<SeriesKey, string> = {
  sale: DAILY_RECORD_CHART_COLORS.sale,
  expense: DAILY_RECORD_CHART_COLORS.expense,
  stock_purchase: DAILY_RECORD_CHART_COLORS.stockPurchase,
  debt_issued: DAILY_RECORD_CHART_COLORS.debt,
  customer_payment: DAILY_RECORD_CHART_COLORS.customerPayment,
  stock_loss: DAILY_RECORD_CHART_COLORS.stockLoss,
  owner_use: DAILY_RECORD_CHART_COLORS.ownerUse,
  supplier_payable: DAILY_RECORD_CHART_COLORS.supplierPayable,
  supplier_payment: DAILY_RECORD_CHART_COLORS.supplierPayment,
  whole_animal_procurement: DAILY_RECORD_CHART_COLORS.stockPurchase,
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
    points.push({ key, label, values: { sale: 0, expense: 0, stock_purchase: 0, debt_issued: 0, customer_payment: 0, stock_loss: 0, owner_use: 0, supplier_payable: 0, supplier_payment: 0, whole_animal_procurement: 0, cash: 0 } });
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
      - point.values.expense - point.values.stock_purchase
      - point.values.whole_animal_procurement;
  }
  return points;
}

export default function DailyRecordsTrendChart({ records, lang = 'en' }: { records: DailyRecord[]; lang?: LangCode }) {
  const [gran, setGran] = useState<Gran>('week');
  const points = useMemo(() => buildPoints(records, gran), [gran, records]);
  // Sales only.
  //
  // Six lines were drawn and five of them lay flat on zero, so the chart was a
  // legend with a wire through it. The one line that moves is the one the shop
  // came to look at, and its last value is written on the point — a chart the
  // reader has to hover to read is a chart that answers nothing on a phone.
  const series: Series[] = [
    { key: 'sale', label: lang === 'sw' ? 'Mauzo' : 'Sales', color: colors.sale },
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
      <p className="mb-2 text-xs text-ink-muted">{lang === 'sw' ? 'Mauzo yaliyothibitishwa kwa kila kipindi.' : 'Confirmed sales per period.'}</p>
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label={lang === 'sw' ? 'Mwelekeo wa rekodi za siku' : 'Daily Records trend chart'}>
        {[-1, -.5, 0, .5, 1].map((fraction) => <g key={fraction}><line x1={PAD.l} x2={W - PAD.r} y1={y(max * fraction)} y2={y(max * fraction)} stroke="rgb(var(--surface-border))" strokeDasharray={fraction === 0 ? '0' : '3 3'} /><text x={PAD.l - 8} y={y(max * fraction) + 4} textAnchor="end" fontSize="11" className="fill-ink" opacity=".7">{Math.round(max * fraction / 1000)}k</text></g>)}
        {series.map((item) => <polyline key={item.key} points={points.map((point, index) => `${x(index)},${y(point.values[item.key])}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.key === 'cash' ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />)}
        {points.map((point, index) => index % labelStep === 0 || index === points.length - 1 ? <text key={point.key} x={x(index)} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink" opacity=".7">{point.label}</text> : null)}
        {points.map((point, index) => <g key={`${point.key}-tips`}>{series.map((item) => <circle key={item.key} cx={x(index)} cy={y(point.values[item.key])} r="2.5" fill={item.color}><title>{`${point.label}: ${item.label} ${formatMoney(point.values[item.key])}`}</title></circle>)}</g>)}
        {(() => {
          const last = points[points.length - 1];
          if (!last) return null;
          const value = last.values.sale;
          const cx = x(points.length - 1);
          const cy = y(value);
          // Kept inside the plot: on the right-hand edge the tag would otherwise
          // hang off the drawing and be clipped by the scroller.
          const anchor = cx > W - PAD.r - 70 ? 'end' : 'start';
          return (
            <text
              x={anchor === 'end' ? cx - 8 : cx + 8}
              y={cy - 10}
              textAnchor={anchor}
              fontSize="12"
              fontWeight="600"
              fill={colors.sale}
            >
              {formatMoney(value)}
            </text>
          );
        })()}
      </svg></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">{series.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    </section>
  );
}
