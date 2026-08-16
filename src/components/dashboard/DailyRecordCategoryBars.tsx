import { useMemo } from 'react';
import { formatMoney } from '@/lib/format';
import { getLang, type LangCode } from '@/lib/lang';
import type { DailyRecord } from '@/types/db';

/**
 * One colour per category, in a fixed order.
 *
 * Every bar was the same red, so the chart carried no information the numbers
 * beside it did not already carry — the eye had nothing to compare. The order is
 * by size, so the colours stay stable while the reader looks down the list.
 */
const BAR_COLOURS = [
  'bg-role-admin',
  'bg-role-accountant',
  'bg-role-worker',
  'bg-amber-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-emerald-600',
  'bg-rose-400',
];

/**
 * A category label that only repeats the heading.
 *
 * The owner wrote "Matumizi 15000" and the chart headed "expenses by category"
 * then listed a category called "Matumizi" — expenses, inside expenses. It says
 * nothing. Labelled as unclassified instead, which is what it is.
 */
const GENERIC_LABEL = /^(?:matumizi|expenses?|gharama|spending|other|nyingine|misc(?:ellaneous)?)$/i;

export default function DailyRecordCategoryBars({ records, lang = getLang() }: { records: DailyRecord[]; lang?: LangCode }) {
  const unclassified = lang === 'sw' ? 'Bila kategoria' : 'Uncategorised';

  const rows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const record of records) {
      if (record.status !== 'confirmed' || record.kind !== 'expense') continue;
      const raw = (record.description || '').trim();
      const category = !raw || GENERIC_LABEL.test(raw) ? unclassified : raw;
      totals.set(category, (totals.get(category) ?? 0) + Number(record.amount || 0));
    }
    const grand = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0);
    return Array.from(totals.entries())
      .map(([category, amount]) => ({ category, amount, pct: grand ? (amount / grand) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [records, unclassified]);

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const title = lang === 'sw' ? 'Matumizi ya rekodi za siku kwa kategoria' : 'Daily record expenses by category';
  const subtitle = lang === 'sw'
    ? 'Rekodi za siku zilizothibitishwa · kipindi: rekodi zilizopakiwa'
    : 'Confirmed daily records · selected period: current loaded timeline';
  const empty = lang === 'sw'
    ? 'Hakuna matumizi ya rekodi za siku yaliyothibitishwa katika kipindi hiki.'
    : 'No confirmed daily-record expenses in this period.';

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-xs text-ink-muted">{subtitle}</p>
        </div>
        <strong className="font-display text-sm text-ink">{formatMoney(total)}</strong>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.category}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${BAR_COLOURS[index % BAR_COLOURS.length]}`}
                    aria-hidden="true"
                  />
                  <span className="truncate text-ink">{row.category}</span>
                </span>
                <span className="shrink-0 text-ink-muted">
                  {formatMoney(row.amount)} · {row.pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={`h-full rounded-full ${BAR_COLOURS[index % BAR_COLOURS.length]}`}
                  style={{ width: `${Math.max(2, row.pct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
