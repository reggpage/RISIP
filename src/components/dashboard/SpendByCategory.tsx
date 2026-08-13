import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/format';
import { receiptActivityDate } from '@/lib/receiptDates';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { getLang } from '@/lib/lang';
import type { Receipt } from '@/types/db';

type Gran = 'day' | 'week' | 'month' | 'year';
const GRAN_LABEL: Record<'en' | 'sw', Record<Gran, string>> = {
  en: { day: 'Day', week: 'Week', month: 'Month', year: 'Year' },
  sw: { day: 'Siku', week: 'Wiki', month: 'Mwezi', year: 'Mwaka' },
};

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

function periodLabel(gran: Gran, lang: 'en' | 'sw') {
  const today = new Date();
  if (gran === 'day') return lang === 'sw' ? 'Leo' : 'Today';
  if (gran === 'week') return lang === 'sw' ? 'Wiki hii' : 'This week';
  if (gran === 'month') return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-GB', { month: 'long', year: 'numeric' }).format(today);
  return String(today.getFullYear());
}

type CatItem = { category: string; total: number; pct: number };

function compute(receipts: Receipt[], gran: Gran): CatItem[] {
  const start = windowStart(gran);
  const byCat = new Map<string, number>();
  let total = 0;
  for (const r of receipts) {
    if (r.status !== 'confirmed') continue;
    const date = receiptActivityDate(r);
    if (!date || date.getTime() < start) continue;
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
  const lang = getLang();
  const [gran, setGran] = useState<Gran>('year');
  const items = useMemo(() => compute(receipts, gran), [receipts, gran]);
  const confirmedCount = useMemo(() => {
    const start = windowStart(gran);
    return receipts.filter((receipt) => {
      if (receipt.status !== 'confirmed') return false;
      const date = receiptActivityDate(receipt);
      return Boolean(date && date.getTime() >= start);
    }).length;
  }, [receipts, gran]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-ink">Spend by category</h3>
          <p className="mt-0.5 text-xs text-ink-muted">{periodLabel(gran, lang)} · {confirmedCount} {lang === 'sw' ? 'risiti zilizothibitishwa' : `confirmed receipt${confirmedCount === 1 ? '' : 's'}`}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{lang === 'sw' ? 'Zimepangwa kwa siku risiti iliporekodiwa.' : 'Grouped by the day the receipt was recorded.'}</p>
        </div>
        <UnderlineTabs
          className="text-xs"
          tabs={(Object.keys(GRAN_LABEL[lang]) as Gran[]).map((value) => ({ value, label: GRAN_LABEL[lang][value] }))}
          value={gran}
          onChange={setGran}
          label={lang === 'sw' ? 'Kipindi cha matumizi kwa kategoria' : 'Spend by category time range'}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState title={lang === 'sw' ? 'Hakuna matumizi katika kipindi hiki' : 'No spend in this period'} description={lang === 'sw' ? 'Jaribu kipindi kipana zaidi (Mwezi au Mwaka).' : 'Try a wider range (Month or Year).'} />
      ) : (
        <div key={gran} className="flex flex-col gap-3">
          {items.length === 1 && <p className="text-xs text-ink-muted">{lang === 'sw' ? `Matumizi yote yaliyothibitishwa katika kipindi hiki yamewekwa kwenye ${items[0].category}.` : `All confirmed spend in this period is categorized as ${items[0].category}.`}</p>}
          {items.map((it, i) => <Row key={it.category} item={it} tint={tintFor(it.category)} delay={i * 80} />)}
        </div>
      )}
    </div>
  );
}
