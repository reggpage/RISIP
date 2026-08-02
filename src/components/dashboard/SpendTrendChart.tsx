import { useMemo, useRef, useState } from 'react';
import { BarChart3, LineChart as LineIcon } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

// Interactive spend-over-time chart. Pure SVG — no chart library. Switch granularity
// (Day/Week/Month/Year) and view type (bars/line), with animated entry, Y-axis money
// ticks, X-axis date labels, and an in-app hover tooltip.

type Gran = 'day' | 'week' | 'month' | 'year';
type ViewType = 'bar' | 'line';

const GRAN_CFG: Record<Gran, { label: string; slots: number; caption: string }> = {
  day: { label: 'Day', slots: 30, caption: 'Last 30 days' },
  week: { label: 'Week', slots: 12, caption: 'Last 12 weeks' },
  month: { label: 'Month', slots: 12, caption: 'Last 12 months' },
  year: { label: 'Year', slots: 5, caption: 'Last 5 years' },
};

const VB_W = 640;
const VB_H = 220;
const PAD = { l: 52, r: 12, t: 12, b: 28 };
const PLOT_W = VB_W - PAD.l - PAD.r;
const PLOT_H = VB_H - PAD.t - PAD.b;

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function parseDate(r: Receipt): Date | null {
  const key = r.receipt_date ?? r.created_at?.slice(0, 10);
  if (!key) return null;
  const d = new Date(key);
  return isNaN(d.getTime()) ? null : d;
}
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}
function compact(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(Math.round(n));
}

type Slot = { key: string; label: string; total: number; startMs: number };

function buildSeries(receipts: Receipt[], gran: Gran): Slot[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = GRAN_CFG[gran].slots;
  const slots: Slot[] = [];
  const mFmt = new Intl.DateTimeFormat('en-GB', { month: 'short' });

  for (let i = n - 1; i >= 0; i--) {
    let start: Date; let key: string; let label: string;
    if (gran === 'day') {
      start = new Date(today); start.setDate(today.getDate() - i);
      key = ymd(start); label = `${start.getDate()}/${start.getMonth() + 1}`;
    } else if (gran === 'week') {
      start = startOfWeek(today); start.setDate(start.getDate() - i * 7);
      key = ymd(start); label = `${start.getDate()}/${start.getMonth() + 1}`;
    } else if (gran === 'month') {
      start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      label = mFmt.format(start);
    } else {
      start = new Date(today.getFullYear() - i, 0, 1);
      key = String(start.getFullYear()); label = key;
    }
    slots.push({ key, label, total: 0, startMs: start.getTime() });
  }
  const idx = new Map(slots.map((s, i) => [s.key, i]));
  for (const r of receipts) {
    if (r.status !== 'confirmed') continue;
    const d = parseDate(r);
    if (!d) continue;
    let key: string;
    if (gran === 'day') key = ymd(d);
    else if (gran === 'week') key = ymd(startOfWeek(d));
    else if (gran === 'month') key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    else key = String(d.getFullYear());
    const i = idx.get(key);
    if (i !== undefined) slots[i].total += Number(r.total_amount || 0);
  }
  return slots;
}

export default function SpendTrendChart({ receipts }: { receipts: Receipt[] }) {
  const [gran, setGran] = useState<Gran>('day');
  const [view, setView] = useState<ViewType>('bar');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; label: string; total: number } | null>(null);

  const { slots, windowTotal, deltaPct, prevHasData } = useMemo(() => {
    const s = buildSeries(receipts, gran);
    const total = s.reduce((a, x) => a + x.total, 0);
    const spanMs = s.length > 1 ? (s[s.length - 1].startMs - s[0].startMs) + (s[1].startMs - s[0].startMs) : 0;
    const winStart = s[0]?.startMs ?? 0;
    const prevStart = winStart - spanMs;
    let prev = 0;
    for (const r of receipts) {
      if (r.status !== 'confirmed') continue;
      const d = parseDate(r);
      if (!d) continue;
      const t = d.getTime();
      if (t >= prevStart && t < winStart) prev += Number(r.total_amount || 0);
    }
    const pct = prev > 0 ? ((total - prev) / prev) * 100 : 0;
    return { slots: s, windowTotal: total, deltaPct: pct, prevHasData: prev > 0 };
  }, [receipts, gran]);

  const maxVal = niceMax(Math.max(0, ...slots.map((s) => s.total)));
  const isEmpty = windowTotal === 0;
  const band = PLOT_W / slots.length;
  const barW = Math.max(2, band * 0.62);
  const cx = (i: number) => PAD.l + band * (i + 0.5);
  const y = (v: number) => PAD.t + PLOT_H * (1 - v / maxVal);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal);
  const labelStep = Math.max(1, Math.ceil(slots.length / 7));
  const linePts = slots.map((s, i) => `${cx(i).toFixed(1)},${y(s.total).toFixed(1)}`).join(' ');
  const areaPath = slots.length
    ? `M ${cx(0).toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} ` +
      slots.map((s, i) => `L ${cx(i).toFixed(1)},${y(s.total).toFixed(1)}`).join(' ') +
      ` L ${cx(slots.length - 1).toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} Z`
    : '';
  const animKey = `${gran}-${view}`;

  function showTip(e: React.MouseEvent, s: Slot) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, label: s.label, total: s.total });
  }

  return (
    <div>
      <style>{`
        @keyframes stc-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes stc-draw { to { stroke-dashoffset: 0; } }
        @keyframes stc-fade { from { opacity: 0; } to { opacity: 1; } }
        .stc-bar { transform-box: fill-box; transform-origin: bottom; animation: stc-grow .55s cubic-bezier(.22,1,.36,1) both; }
        .stc-line { stroke-dasharray: 1400; stroke-dashoffset: 1400; animation: stc-draw 1.1s ease-out forwards; }
        .stc-area { animation: stc-fade .9s ease-out both; }
        .stc-dot { animation: stc-fade .5s ease-out both; }
      `}</style>

      {/* Header: total + delta (left); view toggle + granularity on one aligned row (right). */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-muted">{GRAN_CFG[gran].caption}</div>
          <div className="text-2xl font-semibold text-ink">{formatMoney(windowTotal)}</div>
          <div className={`text-xs font-medium ${!prevHasData ? 'text-ink-muted' : deltaPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {prevHasData ? `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(0)}% vs previous ${GRAN_CFG[gran].label.toLowerCase()} window` : GRAN_CFG[gran].caption}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5">
            <button type="button" onClick={() => setView('bar')} title="Bars"
              className={'rounded-md p-1.5 transition ' + (view === 'bar' ? 'bg-role-admin/10 text-role-admin' : 'text-ink-muted hover:text-ink')}>
              <BarChart3 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setView('line')} title="Line"
              className={'rounded-md p-1.5 transition ' + (view === 'line' ? 'bg-role-admin/10 text-role-admin' : 'text-ink-muted hover:text-ink')}>
              <LineIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5 text-xs">
            {(Object.keys(GRAN_CFG) as Gran[]).map((g) => (
              <button key={g} type="button" onClick={() => setGran(g)}
                className={'rounded-md px-2.5 py-1 font-medium transition ' + (gran === g ? 'bg-role-admin/10 text-role-admin' : 'text-ink-muted hover:text-ink')}>
                {GRAN_CFG[g].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" style={{ height: 230 }}>
          {/* Y gridlines + money ticks */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={VB_W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--surface-border))" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 3'} opacity={i === 0 ? 1 : 0.7} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" className="fill-ink" opacity="0.7">{compact(t)}</text>
            </g>
          ))}
          <text x={14} y={PAD.t + PLOT_H / 2} fontSize="11" transform={`rotate(-90 14 ${PAD.t + PLOT_H / 2})`} textAnchor="middle" className="fill-ink" opacity="0.6">TZS</text>

          <g key={animKey}>
            {view === 'bar'
              ? slots.map((s, i) => {
                  const h = isEmpty ? 1 : Math.max(1, (s.total / maxVal) * PLOT_H);
                  const yy = PAD.t + PLOT_H - h;
                  return (
                    <g key={s.key}>
                      {/* Invisible full-height hit area so hovering anywhere in the column works. */}
                      <rect x={cx(i) - band / 2} y={PAD.t} width={band} height={PLOT_H} fill="transparent"
                        onMouseMove={(e) => showTip(e, s)} />
                      <rect className="stc-bar" style={{ animationDelay: `${i * 18}ms`, pointerEvents: 'none' }}
                        x={cx(i) - barW / 2} y={yy} width={barW} height={h} rx="2"
                        fill={isEmpty ? 'rgb(var(--surface-border))' : 'rgb(var(--role-admin))'} fillOpacity={isEmpty ? 1 : 0.85} />
                    </g>
                  );
                })
              : (
                <>
                  {areaPath && <path className="stc-area" d={areaPath} fill="rgb(var(--role-admin))" fillOpacity="0.10" />}
                  <polyline className="stc-line" points={linePts} fill="none" stroke="rgb(var(--role-admin))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {slots.map((s, i) => (
                    <g key={s.key}>
                      <rect x={cx(i) - band / 2} y={PAD.t} width={band} height={PLOT_H} fill="transparent"
                        onMouseMove={(e) => showTip(e, s)} />
                      <circle className="stc-dot" style={{ animationDelay: `${400 + i * 25}ms`, pointerEvents: 'none' }}
                        cx={cx(i)} cy={y(s.total)} r="3" fill="rgb(var(--role-admin))" />
                    </g>
                  ))}
                </>
              )}
          </g>

          {slots.map((s, i) => (i % labelStep === 0 || i === slots.length - 1) ? (
            <text key={s.key} x={cx(i)} y={VB_H - 9} textAnchor="middle" fontSize="12" className="fill-ink" opacity="0.7">{s.label}</text>
          ) : null)}
        </svg>

        {/* In-app tooltip (not the browser's native title). */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs text-surface shadow-lg"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            <div className="font-medium text-surface/70">{hover.label}</div>
            <div className="font-display font-semibold text-surface">{formatMoney(hover.total)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
