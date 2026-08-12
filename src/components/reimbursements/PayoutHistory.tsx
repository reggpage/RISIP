import { useState } from 'react';
import { Loader2, Receipt as ReceiptIcon, Undo2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { PAYOUT_METHODS, usePayouts, voidPayout } from '@/features/reimbursements/payouts';
import { isMeaningfulReason, reasonProblem } from '@/features/receipts/reasonQuality';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, formatMoney } from '@/lib/format';

// Payments the company has made, and the only way to undo one.
//
// Undo used to be a silent toggle — mark_receipts_reimbursed(ids, false) — with
// no reason and no audit row, and because the petty-cash reversal block only read
// `reimbursed_at is not null`, un-pay then reverse walked straight through it. A
// void is the audited replacement: the payout is never deleted, it is stamped and
// stays visible, and every receipt on it gets its own history row.
export default function PayoutHistory({ onChanged }: { onChanged: () => void }) {
  const { payouts, names, loading, refresh } = usePayouts();
  const toast = useToast();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (payouts.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">No payments recorded yet.</p>;
  }

  async function submitVoid(payoutId: string) {
    setBusy(true);
    try {
      await voidPayout(payoutId, reason);
      toast.success('Payment cancelled. Those receipts are owed again.');
      setVoiding(null);
      setReason('');
      await refresh();
      onChanged();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold text-ink">Payments</h2>
      <p className="mb-3 text-sm text-ink-muted">
        Every payment made to staff, including cancelled ones. Nothing is ever deleted.
      </p>

      <div className="space-y-3">
        {payouts.map((p) => {
          const method = PAYOUT_METHODS.find((m) => m.value === p.method);
          const voided = p.voided_at !== null;
          return (
            <Card key={p.id} className={voided ? 'opacity-70' : ''}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {names.get(p.paid_to) ?? 'Staff member'}
                    {voided && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-normal text-red-700">
                        cancelled
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(p.paid_at)} · paid by {names.get(p.paid_by) ?? 'finance'}
                    {method ? ` · ${method.label}` : ''}
                  </p>
                  {p.reference && (
                    <p className="mt-0.5 font-mono text-xs text-ink">Ref {p.reference}</p>
                  )}
                  {p.note && <p className="mt-1 text-xs text-ink-muted">{p.note}</p>}
                  {voided && p.void_reason && (
                    <p className="mt-1 rounded bg-surface-muted px-2 py-1 text-xs text-ink">
                      Cancelled: {p.void_reason}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className={`font-display text-lg font-semibold ${voided ? 'text-ink-muted line-through' : 'text-ink'}`}>
                    {formatMoney(p.total_amount)}
                  </p>
                  {!voided && (
                    <Button
                      variant="secondary"
                      className="mt-2 !border-red-300 !text-red-600 hover:!bg-red-50"
                      onClick={() => { setVoiding(p.id); setReason(''); }}
                    >
                      <Undo2 className="h-4 w-4" />
                      Cancel payment
                    </Button>
                  )}
                </div>
              </div>

              {voiding === p.id && (
                <div className="mt-3 border-t border-surface-border pt-3">
                  <p className="text-xs text-ink-muted">
                    <ReceiptIcon className="mr-1 inline h-3.5 w-3.5" />
                    The receipts on this payment go back into the owed queue and the employee is told.
                  </p>
                  <label className="mt-2 block text-sm font-medium text-ink">Why is this being cancelled?</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="Say what happened, in a full sentence."
                    className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      tint="admin"
                      disabled={busy || !isMeaningfulReason(reason)}
                      onClick={() => void submitVoid(p.id)}
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Cancel this payment
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => { setVoiding(null); setReason(''); }}>
                      Keep it
                    </Button>
                  </div>
                  {reasonProblem(reason) && (
                    <p className="mt-2 text-xs text-ink-muted">{reasonProblem(reason)}</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
