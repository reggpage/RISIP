import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Loader2, MailCheck, Trash2, Wallet, X, XCircle, Receipt as ReceiptGlyph,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useProjects } from '@/features/projects/useProjects';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

const STATUS_META = {
  processing: { label: 'Processing', tone: 'text-amber-600', Icon: Loader2, spin: true },
  confirmed: { label: 'Confirmed', tone: 'text-emerald-600', Icon: CheckCircle2, spin: false },
  duplicate: { label: 'Duplicate', tone: 'text-orange-600', Icon: AlertTriangle, spin: false },
  error: { label: 'Extraction failed', tone: 'text-red-600', Icon: XCircle, spin: false },
  pending_review: { label: 'Pending review (scan-to-email)', tone: 'text-sky-600', Icon: MailCheck, spin: false },
} as const;

// Two-column details: portrait image on the left, metadata on the right. Stacks
// on mobile. Owner or the uploader can delete via the trash button in the header.
export default function ReceiptDetailModal({
  receipt,
  onClose,
  onDeleted,
}: {
  receipt: Receipt;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const auth = useAuth();
  const [uploader, setUploader] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { state: projectsState } = useProjects();
  const project = projectsState.status === 'ready'
    ? projectsState.projects.find((p) => p.id === receipt.project_id) ?? null
    : null;

  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const canDelete =
    profile?.id === receipt.uploaded_by || profile?.role === 'owner';
  // Only finance roles approve scan-to-email receipts into the confirmed ledger.
  const canReview =
    receipt.status === 'pending_review' && (profile?.role === 'owner' || profile?.role === 'accountant');
  const [reviewing, setReviewing] = useState(false);

  const meta = STATUS_META[receipt.status];
  const StatusIcon = meta.Icon;

  async function approve() {
    setReviewing(true);
    const { error } = await supabase.from('receipts').update({ status: 'confirmed' }).eq('id', receipt.id);
    setReviewing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Receipt approved.');
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('full_name')
      .eq('id', receipt.uploaded_by)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setUploader((data?.full_name as string | null) ?? null);
      });
    if (receipt.image_url) {
      receiptImageUrl(receipt.image_url)
        .then((u) => !cancelled && setImgUrl(u))
        .catch(() => !cancelled && setImgUrl(null));
    }
    return () => {
      cancelled = true;
    };
  }, [receipt.uploaded_by, receipt.image_url]);

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete this receipt?',
      message: 'This permanently removes the receipt. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.from('receipts').delete().eq('id', receipt.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Receipt deleted.');
    onDeleted?.(receipt.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Receipt details</h2>
          <div className="flex items-center gap-1">
            {canDelete && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label="Delete receipt"
                title="Delete"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Two-column body: portrait image left, details right. Stacks on mobile. */}
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,240px)_1fr]">
          <div className="mx-auto flex aspect-[3/4] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
            {imgUrl ? (
              <img src={imgUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-ink-muted">
                <ReceiptGlyph className="h-10 w-10" />
                <span className="text-xs">Manual entry</span>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className={`mb-3 inline-flex items-center gap-1.5 text-sm font-medium ${meta.tone}`}>
              <StatusIcon className={`h-4 w-4 ${meta.spin ? 'animate-spin' : ''}`} />
              {meta.label}
            </div>

            {/* Scan-to-email receipts land here for the accountant to approve or discard
                before they count toward the project's spend. */}
            {canReview && (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs text-sky-800">
                  This receipt arrived by scanner email. Check the details against the image,
                  then approve it into the ledger or discard it.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button tint="admin" disabled={reviewing || deleting} onClick={() => void approve()}>
                    {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={reviewing || deleting}
                    onClick={() => void handleDelete()}
                    className="!border-red-300 !text-red-600 hover:!bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Discard
                  </Button>
                </div>
              </div>
            )}

            <Row label="Vendor" value={receipt.vendor_name ?? '—'} strong />
            <Row
              label="Amount"
              value={<span className="font-display font-semibold">{formatMoney(receipt.total_amount)}</span>}
            />
            <Row label="Tax / VAT" value={formatMoney(receipt.tax_amount)} />
            <Row label="Category" value={receipt.category ?? '—'} />
            <Row label="Date" value={formatDate(receipt.receipt_date ?? receipt.created_at)} />
            <Row label="Receipt #" value={receipt.receipt_number ?? '—'} mono />
            <Row label="Verification code" value={receipt.verification_code ?? '—'} mono />
            <Row label="TIN" value={receipt.vendor_tin ?? '—'} mono />
            <Row label="VRN" value={receipt.vendor_vrn ?? '—'} mono />

            <div className="my-4 h-px bg-surface-border" />

            <Row
              label="Payment method"
              value={
                <span className="inline-flex items-center gap-1 text-sm text-ink">
                  {receipt.payment_method === 'petty_cash' && (
                    <Wallet className="h-3.5 w-3.5 text-role-admin" />
                  )}
                  {receipt.payment_method === 'petty_cash' ? 'Petty cash' : 'Cash / Personal'}
                </span>
              }
            />
            <Row label="Project" value={project?.name ?? '—'} />
            <Row label="Uploaded by" value={<span className="font-semibold">{uploader ?? '—'}</span>} />
            <Row label="Uploaded at" value={formatDateTime(receipt.created_at)} />

            {receipt.low_confidence_fields.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-medium">Needs review:</span>{' '}
                {receipt.low_confidence_fields.join(', ')}
              </div>
            )}

            {canDelete && (
              <div className="mt-5 sm:hidden">
                <Button
                  variant="secondary"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="!border-red-300 !text-red-600 hover:!bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting…' : 'Delete receipt'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span
        className={
          'text-right text-sm text-ink ' +
          (mono ? 'font-mono ' : '') +
          (strong ? 'font-semibold ' : '')
        }
      >
        {value}
      </span>
    </div>
  );
}
