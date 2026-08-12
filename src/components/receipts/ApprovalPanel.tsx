import { useState } from 'react';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  canDecide,
  canSubmit,
  decideReceipt,
  missingBeforeSubmit,
  submitReceipt,
  type Decision,
} from '@/features/receipts/approvalFlow';
import { isMeaningfulReason, reasonProblem } from '@/features/receipts/reasonQuality';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import type { Receipt } from '@/types/db';

// Phase 1b panel. Rendered only when the company runs the approval flow, so with
// the flag off the receipt modal is exactly what it was before.
//
// Every rule here is mirrored server-side in submit_receipt / decide_receipt; the
// UI hides what a user may not do, the database refuses it regardless.
export default function ApprovalPanel({
  receipt,
  allowSelfApproval,
  onChanged,
  onEdit,
}: {
  receipt: Receipt;
  allowSelfApproval: boolean;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');

  const missing = missingBeforeSubmit(receipt);
  const mySubmit = canSubmit(receipt, profile?.id, profile?.role);
  const decide = canDecide(receipt, profile?.id, profile?.role, allowSelfApproval);
  const isUploader = receipt.uploaded_by === profile?.id;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setPending(null);
      setReason('');
      onChanged();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Terminal ─────────────────────────────────────────────────────────────
  if (receipt.status === 'rejected') {
    return (
      <Box tone="red" icon={<XCircle className="h-4 w-4" />} title="Rejected">
        {receipt.decision_reason && <p className="mt-1 text-sm text-ink">{receipt.decision_reason}</p>}
        <p className="mt-2 text-xs text-ink-muted">
          A rejected receipt is final. Upload a corrected receipt if you need to claim this expense.
        </p>
      </Box>
    );
  }

  if (receipt.status === 'confirmed') {
    return (
      <Box tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} title="Approved">
        <p className="mt-1 text-sm text-ink-muted">This receipt counts as approved project spend.</p>
      </Box>
    );
  }

  // ── Waiting on finance ───────────────────────────────────────────────────
  if (receipt.status === 'submitted') {
    return (
      <Box tone="indigo" icon={<Clock3 className="h-4 w-4" />} title="Waiting for finance approval">
        {!decide.approve && !decide.requestChanges && (
          <p className="mt-1 text-sm text-ink-muted">
            {decide.selfBlocked
              ? 'You submitted this receipt, so another member of your finance team must approve it.'
              : 'Your finance team will review it shortly.'}
          </p>
        )}

        {(decide.approve || decide.requestChanges) && (
          <>
            {pending && pending !== 'approve' ? (
              <div className="mt-3">
                <label className="block text-sm font-medium text-ink">
                  Reason ({pending === 'reject' ? 'rejection' : 'changes needed'})
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Explain what is wrong, in a full sentence, so the sender can fix it."
                  className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    tint="admin"
                    disabled={busy || !isMeaningfulReason(reason)}
                    onClick={() => void run(() => decideReceipt(receipt.id, pending, reason.trim()),
                      pending === 'reject'
                        ? 'Rejected. The sender has been told why.'
                        : 'Sent back. The sender has been told what to fix.')}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {pending === 'reject' ? 'Reject receipt' : 'Send back'}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => { setPending(null); setReason(''); }}>
                    Cancel
                  </Button>
                </div>
                {reasonProblem(reason) && (
                  <p className="mt-2 text-xs text-ink-muted">{reasonProblem(reason)}</p>
                )}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {decide.approve && (
                  <Button
                    tint="admin"
                    disabled={busy}
                    onClick={() => void run(() => decideReceipt(receipt.id, 'approve'), 'Receipt approved.')}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Approve
                  </Button>
                )}
                {decide.requestChanges && (
                  <Button variant="secondary" tint="neutral" disabled={busy} onClick={() => setPending('request_changes')}>
                    Request changes
                  </Button>
                )}
                {decide.reject && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setPending('reject')}
                    className="!border-red-300 !text-red-600 hover:!bg-red-50"
                  >
                    Reject
                  </Button>
                )}
              </div>
            )}
            {decide.selfBlocked && (
              <p className="mt-2 text-xs text-ink-muted">
                You submitted this receipt, so another finance user must approve it. You can still send it back.
              </p>
            )}
          </>
        )}
      </Box>
    );
  }

  // ── Sent back for changes ────────────────────────────────────────────────
  if (receipt.status === 'changes_requested') {
    return (
      <Box tone="amber" icon={<Clock3 className="h-4 w-4" />} title="Changes requested">
        {receipt.decision_reason && <p className="mt-1 text-sm text-ink">{receipt.decision_reason}</p>}
        {isUploader || mySubmit ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" tint="admin" disabled={busy} onClick={onEdit}>
              Edit details
            </Button>
            <Button
              tint="admin"
              disabled={busy || !mySubmit}
              onClick={() => void run(() => submitReceipt(receipt.id), 'Sent back to finance.')}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit again
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">Waiting for the sender to correct it.</p>
        )}
      </Box>
    );
  }

  // ── Needs completing, then submitting ────────────────────────────────────
  if (receipt.status === 'pending_review') {
    return (
      <Box tone="sky" icon={<Clock3 className="h-4 w-4" />} title="Not submitted yet">
        <p className="mt-1 text-sm text-ink-muted">
          {missing.length > 0
            ? `Choose ${missing.join(', ')}, then send it to your finance team for approval.`
            : 'Send this to your finance team for approval.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {missing.length > 0 && (
            <Button variant="secondary" tint="admin" disabled={busy} onClick={onEdit}>
              Complete details
            </Button>
          )}
          <Button
            tint="admin"
            disabled={busy || !mySubmit}
            onClick={() => void run(() => submitReceipt(receipt.id), 'Submitted for approval.')}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit for approval
          </Button>
        </div>
      </Box>
    );
  }

  return null;
}

const TONES = {
  sky: 'border-sky-200 bg-sky-50/70 text-sky-700',
  indigo: 'border-indigo-200 bg-indigo-50/70 text-indigo-700',
  amber: 'border-amber-200 bg-amber-50/70 text-amber-700',
  emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-700',
  red: 'border-red-200 bg-red-50/70 text-red-700',
} as const;

function Box({
  tone, icon, title, children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`mb-4 rounded-lg border p-4 ${TONES[tone]}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </p>
      <div className="text-ink">{children}</div>
    </div>
  );
}
