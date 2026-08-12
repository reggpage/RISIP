import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  MIN_REVERSAL_REASON,
  canRequestReversal,
  canReverse,
  fetchLiveExpense,
  reasonIsLongEnough,
  requestReversal,
  reverseReceipt,
  type LiveExpense,
  type ReversalMode,
} from '@/features/receipts/reversal';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

// Shown only for a receipt that actually has money booked against it, and only
// when the company has reversal_enabled. With the flag off this renders nothing
// and a booked receipt stays frozen exactly as it is today.
export default function ReversalPanel({
  receipt,
  reversalEnabled,
  allowSelfApproval,
  onChanged,
}: {
  receipt: Receipt;
  reversalEnabled: boolean;
  allowSelfApproval: boolean;
  onChanged: () => void;
}) {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const toast = useToast();
  const [live, setLive] = useState<LiveExpense | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<ReversalMode | 'request' | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (receipt.payment_method !== 'petty_cash' || receipt.status !== 'confirmed') {
      setLoaded(true);
      return;
    }
    void fetchLiveExpense(receipt.id)
      .then((row) => { if (!cancelled) setLive(row); })
      .catch(() => { /* a worker cannot read another float; treat as nothing booked */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [receipt.id, receipt.payment_method, receipt.status]);

  if (!loaded) return null;

  const { allowed, blockedReason } = canReverse(
    receipt, profile?.id, profile?.role, reversalEnabled, allowSelfApproval, live,
  );
  const mayAsk = canRequestReversal(receipt, profile?.id, profile?.role) && !allowed;

  if (!allowed && !blockedReason && !mayAsk) return null;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setMode(null);
      setReason('');
      setAmount('');
      onChanged();
    } catch (err) {
      // The RPC's message is written for the person reading it — show it whole.
      toast.error(err instanceof Error ? err.message : 'Could not complete that.');
    } finally {
      setBusy(false);
    }
  }

  const corrected = Number(amount.replace(/[^\d.]/g, ''));
  const correctionValid = amount.trim() !== '' && corrected > 0 && corrected !== receipt.total_amount;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
        <RotateCcw className="h-4 w-4" />
        Petty cash booked
      </p>

      {live && (
        <p className="mt-1 text-sm text-ink-muted">
          {formatMoney(Math.abs(live.amount))} was taken off this employee&apos;s float when the receipt was
          approved. Reversing puts it back and returns the receipt for review.
        </p>
      )}

      {blockedReason && (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          {blockedReason}
        </p>
      )}

      {/* ── Finance: reverse or correct ─────────────────────────────────── */}
      {allowed && live && mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" tint="admin" onClick={() => setMode('void')}>
            Reverse
          </Button>
          <Button variant="secondary" tint="neutral" onClick={() => setMode('correct')}>
            Correct the amount
          </Button>
        </div>
      )}

      {/* ── Staff: ask for one ──────────────────────────────────────────── */}
      {mayAsk && mode === null && (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            If something is wrong with this receipt, ask your finance team to reverse it.
          </p>
          <Button variant="secondary" tint="neutral" className="mt-2" onClick={() => setMode('request')}>
            Ask for a reversal
          </Button>
        </div>
      )}

      {mode !== null && (
        <div className="mt-3">
          {mode === 'correct' && (
            <>
              <label className="block text-sm font-medium text-ink">Corrected amount</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoFocus
                placeholder={receipt.total_amount != null ? String(receipt.total_amount) : '0'}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              />
              <p className="mt-1 text-xs text-ink-muted">
                Currently {formatMoney(receipt.total_amount)}. The old entry is reversed and the corrected
                figure is booked; both stay visible in the float&apos;s history.
              </p>
            </>
          )}

          <label className="mt-3 block text-sm font-medium text-ink">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus={mode !== 'correct'}
            placeholder={mode === 'request'
              ? 'Say what is wrong with this receipt.'
              : 'Say why this posting is being undone. The employee sees this.'}
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              tint="admin"
              disabled={
                busy
                || !reasonIsLongEnough(reason)
                || (mode === 'correct' && !correctionValid)
              }
              onClick={() => {
                if (mode === 'request') {
                  void run(() => requestReversal(receipt.id, reason), 'Your finance team has been told.');
                } else if (live) {
                  void run(
                    () => reverseReceipt(receipt.id, live.id, mode, reason,
                      mode === 'correct' ? corrected : undefined),
                    mode === 'correct' ? 'Amount corrected.' : 'Petty cash entry reversed.',
                  );
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'request' ? 'Send request' : mode === 'correct' ? 'Correct it' : 'Reverse it'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setMode(null); setReason(''); setAmount(''); }}>
              Cancel
            </Button>
            {!reasonIsLongEnough(reason) && (
              <span className="text-xs text-ink-muted">At least {MIN_REVERSAL_REASON} characters.</span>
            )}
            {mode === 'correct' && reasonIsLongEnough(reason) && !correctionValid && (
              <span className="text-xs text-ink-muted">Enter a new amount, different from the current one.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
