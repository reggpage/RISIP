import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PAYOUT_METHODS, createPayout, type PayoutMethod } from '@/features/reimbursements/payouts';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';

// Recording a payment. With payouts_enabled off this is a plain confirmation —
// exactly the button finance has today — and with it on the same action also
// records how the money moved.
export default function PayoutDialog({
  personName,
  receiptIds,
  amount,
  detailed,
  onDone,
  onCancel,
}: {
  personName: string;
  receiptIds: string[];
  amount: number;
  /** companies.payouts_enabled — shows method, reference and note. */
  detailed: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<PayoutMethod | ''>('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await createPayout(receiptIds, method || null, reference, note);
      toast.success(
        `${formatMoney(res.total_amount)} recorded as paid to ${personName}. They have been notified.`,
      );
      onDone();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-ink">Record payment</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Paying <span className="font-medium text-ink">{personName}</span> {formatMoney(amount)} for{' '}
          {receiptIds.length} receipt{receiptIds.length === 1 ? '' : 's'}.
        </p>
        <p className="mt-2 rounded bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          This records money leaving the company to settle what the employee already spent. It does not
          add a new expense — those receipts were counted when they were approved.
        </p>

        {detailed && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-ink">How was it paid?</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PayoutMethod | '')}
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="">Not recorded</option>
                {PAYOUT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Reference</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="M-Pesa code, bank reference, voucher number"
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Note</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional, for whoever reads this later"
                className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button tint="admin" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </div>
      </div>
    </div>
  );
}
