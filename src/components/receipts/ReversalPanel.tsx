import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  canRequestReversal,
  canReverse,
  fetchLiveExpense,
  requestReversal,
  reverseReceipt,
  type LiveExpense,
  type ReversalMode,
} from '@/features/receipts/reversal';
import { isMeaningfulReason, reasonProblem } from '@/features/receipts/reasonQuality';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

// Shown only for a receipt that actually has money booked against it, and only
// when the company has reversal_enabled. With the flag off this renders nothing
// and a booked receipt stays frozen exactly as it is today.
//
// Every rule is re-checked in reverse_petty_cash_receipt / request_receipt_
// reversal, including the reason quality: this only saves a round trip.

type Panel = ReversalMode | 'request';

// Said before the button is pressed, because each of these does something
// different to the employee's money.
const EXPLAINER: Record<Panel, string> = {
  request: 'This sends a request to finance. It does not change the receipt, float, or totals.',
  void: "This returns the petty cash amount to the employee's float and sends the receipt back to review.",
  correct: 'This reverses the old petty cash posting and books the corrected amount.',
};

const ACTION_LABEL: Record<Panel, string> = {
  request: 'Send request',
  void: 'Reverse receipt',
  correct: 'Correct amount',
};

const DONE_MESSAGE: Record<Panel, string> = {
  request: 'Your finance team has been asked to look at this receipt.',
  void: "Reversed. The petty cash has gone back to the employee's float.",
  correct: 'Corrected. The float now reflects the new amount.',
};

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
  const [panel, setPanel] = useState<Panel | null>(null);
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
      setPanel(null);
      setReason('');
      setAmount('');
      onChanged();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const corrected = Number(amount.replace(/[^\d.]/g, ''));
  const correctionValid = amount.trim() !== '' && corrected > 0 && corrected !== receipt.total_amount;
  const problem = reasonProblem(reason);
  const canSend = !busy && isMeaningfulReason(reason)
    && (panel !== 'correct' || correctionValid);

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
        <RotateCcw className="h-4 w-4" />
        Petty cash booked
      </p>

      {live && (
        <p className="mt-1 text-sm text-ink-muted">
          {formatMoney(Math.abs(live.amount))} was taken off this employee&apos;s float when the receipt was
          approved.
        </p>
      )}

      {blockedReason && (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          {blockedReason}
        </p>
      )}

      {/* ── Finance ─────────────────────────────────────────────────────── */}
      {allowed && live && panel === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" tint="admin" onClick={() => setPanel('void')}>
            Reverse receipt
          </Button>
          <Button variant="secondary" tint="neutral" onClick={() => setPanel('correct')}>
            Correct amount
          </Button>
        </div>
      )}

      {/* ── Staff ───────────────────────────────────────────────────────── */}
      {mayAsk && panel === null && (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            If something is wrong with this receipt, tell your finance team.
          </p>
          <Button variant="secondary" tint="neutral" className="mt-2" onClick={() => setPanel('request')}>
            Ask finance to review this receipt
          </Button>
        </div>
      )}

      {panel !== null && (
        <div className="mt-3">
          <p className="rounded bg-surface/70 px-3 py-2 text-xs text-ink-muted">{EXPLAINER[panel]}</p>

          {panel === 'correct' && (
            <>
              <label className="mt-3 block text-sm font-medium text-ink">Corrected amount</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoFocus
                placeholder={receipt.total_amount != null ? String(receipt.total_amount) : '0'}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              />
              <p className="mt-1 text-xs text-ink-muted">
                Currently {formatMoney(receipt.total_amount)}. Both entries stay visible in the float&apos;s
                history.
              </p>
            </>
          )}

          <label className="mt-3 block text-sm font-medium text-ink">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus={panel !== 'correct'}
            placeholder={panel === 'request'
              ? 'Say what is wrong with this receipt, in a full sentence.'
              : 'Say why, in a full sentence. The employee sees this.'}
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              tint="admin"
              disabled={!canSend}
              onClick={() => {
                if (panel === 'request') {
                  void run(() => requestReversal(receipt.id, reason), DONE_MESSAGE.request);
                } else if (live) {
                  void run(
                    () => reverseReceipt(receipt.id, live.id, panel, reason,
                      panel === 'correct' ? corrected : undefined),
                    DONE_MESSAGE[panel],
                  );
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {ACTION_LABEL[panel]}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setPanel(null); setReason(''); setAmount(''); }}>
              Cancel
            </Button>
          </div>

          {problem && <p className="mt-2 text-xs text-ink-muted">{problem}</p>}
          {!problem && panel === 'correct' && !correctionValid && (
            <p className="mt-2 text-xs text-ink-muted">Enter a new amount, different from the current one.</p>
          )}
        </div>
      )}
    </div>
  );
}
