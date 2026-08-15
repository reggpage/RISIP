import { useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { getLang } from '@/lib/lang';
import { formatMoney } from '@/lib/format';

const lang = getLang();
const ui = lang === 'sw' ? {
  label: 'Thibitisha na TRA',
  running: 'Inathibitisha…',
  none: 'Hakuna risiti mpya ya kuthibitisha.',
  failed: 'Sikuweza kuthibitisha sasa. Hakuna risiti iliyobadilishwa.',
  title: 'Matokeo ya uthibitisho',
  checked: 'Zimeangaliwa', verified: 'Zimethibitishwa', corrected: 'Zimerekebishwa',
  notFound: 'TRA haijui kodi', unreachable: 'TRA haikupatikana', locked: 'Kiasi kimefungwa',
  lockedHint: 'Risiti hizi tayari zimewekwa kwenye petty cash, kwa hiyo kiasi hakikubadilishwa. Rudisha (reverse) kwanza ndipo urekebishe.',
  nothingChanged: 'Hakuna kilichobadilika — usomaji ulikuwa sahihi.',
  close: 'Funga',
  from: 'ilikuwa', to: 'sasa',
} : {
  label: 'Verify with TRA',
  running: 'Verifying…',
  none: 'No new receipts to verify.',
  failed: 'Could not verify just now. No receipt was changed.',
  title: 'Verification results',
  checked: 'Checked', verified: 'Verified', corrected: 'Corrected',
  notFound: 'TRA does not know the code', unreachable: 'TRA unreachable', locked: 'Amount locked',
  lockedHint: 'These are already booked against petty cash, so the amount was not changed. Reverse the entry first, then correct it.',
  nothingChanged: 'Nothing changed — the reading was already right.',
  close: 'Close',
  from: 'was', to: 'now',
};

type Change = { field: string; from: unknown; to: unknown };
type Outcome = { receipt_id: string; vendor: string | null; result: string; changed: Change[] };
type Summary = {
  checked: number; verified: number; corrected: number;
  locked: number; not_found: number; unreachable: number; outcomes: Outcome[];
};

const MONEY_FIELDS = new Set(['totalInclTax', 'total_amount']);

function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  return MONEY_FIELDS.has(field) ? formatMoney(Number(value)) : String(value);
}

/**
 * Re-checks receipts filed before verification existed.
 *
 * Kept as an explicit action rather than something that runs on its own: it
 * rewrites stored figures, and the TRA portal is a public page that should not
 * be walked on a timer.
 */
export default function VerifyWithTraButton({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function run() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-receipts', { body: {} });
      if (error) { toast.error(ui.failed); return; }
      const result = data as Summary;
      if (!result || result.checked === 0) { toast.info(ui.none); return; }
      setSummary(result);
    } catch {
      toast.error(ui.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => void run()} disabled={busy}>
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{ui.running}</>
          : <><BadgeCheck className="h-4 w-4" aria-hidden />{ui.label}</>}
      </Button>

      {summary ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-lg">
            <h2 className="text-base font-semibold text-ink">{ui.title}</h2>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                [ui.checked, summary.checked, ''],
                [ui.corrected, summary.corrected, summary.corrected > 0 ? 'text-amber-600' : ''],
                [ui.notFound, summary.not_found, summary.not_found > 0 ? 'text-red-600' : ''],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-surface-border p-2">
                  <div className="text-[11px] text-ink-muted">{label}</div>
                  <div className={`font-display text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
                </div>
              ))}
            </div>

            {summary.locked > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-700">
                {ui.lockedHint}
              </p>
            ) : null}

            <div className="mt-4 space-y-3">
              {summary.outcomes.filter((outcome) => outcome.changed.length > 0).map((outcome) => (
                <div key={outcome.receipt_id} className="rounded-lg border border-surface-border p-3">
                  <div className="text-sm font-medium text-ink">{outcome.vendor ?? '—'}</div>
                  <ul className="mt-1 space-y-0.5">
                    {outcome.changed.map((change) => (
                      <li key={change.field} className="text-xs text-ink-muted">
                        <span className="text-ink">{change.field}</span>
                        {': '}
                        <span className="line-through">{showValue(change.field, change.from)}</span>
                        {' → '}
                        <span className="font-medium text-ink">{showValue(change.field, change.to)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {summary.corrected === 0 ? (
                <p className="text-sm text-ink-muted">{ui.nothingChanged}</p>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={() => { setSummary(null); onDone?.(); }}>{ui.close}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
