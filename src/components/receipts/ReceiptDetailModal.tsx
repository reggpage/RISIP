import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileText, Loader2, MailCheck, Pencil, Sparkles, Trash2, Wallet, X, XCircle,
  Receipt as ReceiptGlyph,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import ImageLightbox from '@/components/ui/ImageLightbox';
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

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent', 'Communication', 'Consulting', 'Other',
];

// Two-column details: portrait image on the left, metadata on the right. Stacks on mobile.
// Owner/uploader can delete; finance roles (owner/accountant) can correct AI mistakes and
// re-run extraction with the high-accuracy model.
export default function ReceiptDetailModal({
  receipt,
  onClose,
  onDeleted,
  onAliasChanged,
}: {
  receipt: Receipt;
  onClose: () => void;
  onDeleted?: (id: string) => void;
  onAliasChanged?: (receiptId: string, nickname: string | null) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const auth = useAuth();
  // Local copy so edits/approvals reflect immediately without waiting for a refetch.
  const [data, setData] = useState<Receipt>(receipt);
  const [uploader, setUploader] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [docPdfUrl, setDocPdfUrl] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(Boolean(receipt.image_url || receipt.scanned_doc_id));
  const [zoomOpen, setZoomOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameSaved, setNicknameSaved] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const { state: projectsState } = useProjects();
  const project = projectsState.status === 'ready'
    ? projectsState.projects.find((p) => p.id === data.project_id) ?? null
    : null;

  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isFinance = profile?.role === 'owner' || profile?.role === 'accountant';
  const canDelete = profile?.id === data.uploaded_by || profile?.role === 'owner';
  // Finance can edit any company receipt; the uploader can fix AI mistakes on their own.
  const canEdit = isFinance || profile?.id === data.uploaded_by;
  const canReview = data.status === 'pending_review' && isFinance;
  const canName = profile?.id === data.uploaded_by;

  // ── Edit mode (finance only) ──────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vendor_name: '', total_amount: '', tax_amount: '', category: '',
    receipt_date: '', receipt_number: '', verification_code: '', vendor_tin: '', vendor_vrn: '',
  });

  function startEdit() {
    setForm({
      vendor_name: data.vendor_name ?? '',
      total_amount: data.total_amount != null ? String(data.total_amount) : '',
      tax_amount: data.tax_amount != null ? String(data.tax_amount) : '',
      category: data.category ?? '',
      receipt_date: data.receipt_date ?? '',
      receipt_number: data.receipt_number ?? '',
      verification_code: data.verification_code ?? '',
      vendor_tin: data.vendor_tin ?? '',
      vendor_vrn: data.vendor_vrn ?? '',
    });
    setEditing(true);
  }

  async function saveEdits() {
    const total = form.total_amount.trim() ? Number(form.total_amount.replace(/[^\d.]/g, '')) : null;
    const tax = form.tax_amount.trim() ? Number(form.tax_amount.replace(/[^\d.]/g, '')) : null;
    if (tax != null && total != null && tax > total) {
      toast.error('VAT cannot be greater than the total.');
      return;
    }
    setSaving(true);
    const updates = {
      vendor_name: form.vendor_name.trim() || null,
      total_amount: total,
      tax_amount: tax,
      category: form.category || null,
      receipt_date: form.receipt_date || null,
      receipt_number: form.receipt_number.trim() || null,
      verification_code: form.verification_code.trim() || null,
      vendor_tin: form.vendor_tin.trim() || null,
      vendor_vrn: form.vendor_vrn.trim() || null,
    };
    const { error } = await supabase.from('receipts').update(updates).eq('id', data.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setData((d) => ({ ...d, ...updates }));
    setEditing(false);
    toast.success('Receipt updated.');
  }

  async function saveNickname() {
    if (!profile?.id || !canName) return;
    const value = nickname.trim();
    setSavingNickname(true);
    const result = value
      ? await supabase.from('receipt_aliases').upsert(
        { receipt_id: data.id, user_id: profile.id, nickname: value },
        { onConflict: 'receipt_id,user_id' },
      )
      : await supabase.from('receipt_aliases').delete()
        .eq('receipt_id', data.id)
        .eq('user_id', profile.id);
    setSavingNickname(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setNickname(value);
    setNicknameSaved(!!value);
    setNicknameEditing(false);
    onAliasChanged?.(data.id, value || null);
    toast.success(value ? 'Receipt name saved.' : 'Receipt name removed.');
  }

  // Re-run extraction with the high-accuracy model for hard-to-read photos.
  async function reanalyze() {
    if (!data.image_url) { toast.error('This receipt has no image to analyse.'); return; }
    setReanalyzing(true);
    setData((d) => ({ ...d, status: 'processing' }));
    // Flip to processing so the list shows the spinner while Claude re-reads it.
    await supabase.from('receipts').update({ status: 'processing' }).eq('id', data.id);
    const { error } = await supabase.functions.invoke('extract-receipt', {
      body: { receipt_id: data.id, storage_path: data.image_url, model: 'claude-sonnet-4-20250514' },
    });
    setReanalyzing(false);
    if (error) {
      setData((d) => ({ ...d, status: 'error' }));
      const context = (error as { context?: Response }).context;
      let detail = error.message;
      if (context) {
        const payload = await context.clone().json().catch(() => null) as { detail?: string; error?: string } | null;
        detail = payload?.detail || payload?.error || detail;
      }
      toast.error(detail);
      return;
    }
    const { data: refreshed } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', data.id)
      .maybeSingle();
    if (refreshed) setData(refreshed as Receipt);
    toast.success('Receipt re-analysed successfully.');
  }

  async function approve() {
    setReviewing(true);
    const { error } = await supabase.from('receipts').update({ status: 'confirmed' }).eq('id', data.id);
    setReviewing(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Receipt approved.');
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    if (!editing) setData(receipt);
    void supabase
      .from('profiles')
      .select('full_name')
      .eq('id', receipt.uploaded_by)
      .maybeSingle()
      .then(({ data: p }) => {
        if (!cancelled) setUploader((p?.full_name as string | null) ?? null);
      });
    if (receipt.image_url) {
      // An image page → show inline; a stored PDF → offer to open it.
      const isPdf = receipt.image_url.toLowerCase().endsWith('.pdf');
      receiptImageUrl(receipt.image_url)
        .then((u) => { if (!cancelled) (isPdf ? setDocPdfUrl : setImgUrl)(u); })
        .catch(() => !cancelled && setImgUrl(null))
        .finally(() => { if (!cancelled) setMediaLoading(false); });
    } else if (receipt.scanned_doc_id) {
      // Batch/inbound receipts with no own image: fall back to the scanned source page.
      void supabase
        .from('scanned_documents')
        .select('file_url')
        .eq('id', receipt.scanned_doc_id)
        .maybeSingle()
        .then(async ({ data: doc }) => {
          const path = doc?.file_url as string | undefined;
          if (!path || cancelled) { if (!cancelled) setMediaLoading(false); return; }
          const signed = await receiptImageUrl(path).catch(() => null);
           if (!signed || cancelled) { if (!cancelled) setMediaLoading(false); return; }
           if (path.toLowerCase().endsWith('.pdf')) setDocPdfUrl(signed);
           else setImgUrl(signed);
           setMediaLoading(false);
       });
    } else setMediaLoading(false);
    if (profile?.id) {
      void supabase
        .from('receipt_aliases')
        .select('nickname')
        .eq('receipt_id', receipt.id)
        .eq('user_id', profile.id)
        .maybeSingle()
        .then(({ data: alias }) => {
          if (!cancelled) {
            const value = (alias?.nickname as string | null) ?? '';
            setNickname(value);
            setNicknameSaved(!!value);
          }
        });
    }
    return () => { cancelled = true; };
  }, [profile?.id, receipt.id, receipt.uploaded_by, receipt.image_url, receipt.scanned_doc_id, editing]);

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete this receipt?',
      message: 'This permanently removes the receipt. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.from('receipts').delete().eq('id', data.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Receipt deleted.');
    onDeleted?.(data.id);
    onClose();
  }

  const meta = STATUS_META[data.status];
  const StatusIcon = meta.Icon;

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
            {canDelete && !editing && (
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
          <div>
            {mediaLoading ? (
              <div className="mx-auto aspect-[3/4] w-full max-w-[240px] animate-pulse rounded-xl bg-surface-muted" aria-label="Loading receipt image" />
            ) : imgUrl ? (
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="group mx-auto flex aspect-[3/4] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl bg-surface-muted"
              >
                <img src={imgUrl} alt="" className="h-full w-full object-cover transition group-hover:opacity-90" />
              </button>
            ) : docPdfUrl ? (
              <a
                href={docPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mx-auto flex aspect-[3/4] w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-xl bg-surface-muted text-role-admin transition hover:bg-role-admin/5"
              >
                <FileText className="h-10 w-10" />
                <span className="text-xs font-medium">View scanned PDF</span>
              </a>
            ) : (
              <div className="mx-auto flex aspect-[3/4] w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-xl bg-surface-muted text-ink-muted">
                <ReceiptGlyph className="h-10 w-10" />
                <span className="text-xs">Manual entry</span>
              </div>
            )}
            {imgUrl && <p className="mt-2 text-center text-xs text-ink-muted">Tap the image to zoom</p>}
            {docPdfUrl && !imgUrl && <p className="mt-2 text-center text-xs text-ink-muted">Batch-scanned page</p>}
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${meta.tone}`}>
                <StatusIcon className={`h-4 w-4 ${meta.spin ? 'animate-spin' : ''}`} />
                {meta.label}
              </div>
              {/* Correct AI mistakes or re-read with the strong model. */}
              {canEdit && !editing && data.status !== 'processing' && (
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={startEdit} className="!px-2 !py-1 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {data.image_url && (
                    <Button variant="ghost" onClick={() => void reanalyze()} disabled={reanalyzing}
                      className="!px-2 !py-1 text-xs">
                      {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Re-analyse
                    </Button>
                  )}
                </div>
              )}
            </div>

            {data.status === 'processing' ? (
              <ReceiptDetailsSkeleton />
            ) : <>
            {canReview && !editing && (
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

            {editing ? (
              // ── Edit form ──────────────────────────────────────────────
              <div className="flex flex-col gap-3">
                <Field label="Vendor">
                  <input value={form.vendor_name} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (total)">
                    <input inputMode="decimal" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Tax / VAT">
                    <input inputMode="decimal" value={form.tax_amount} onChange={(e) => setForm((f) => ({ ...f, tax_amount: e.target.value }))} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputCls}>
                      <option value="">—</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Date">
                    <input type="date" value={form.receipt_date} onChange={(e) => setForm((f) => ({ ...f, receipt_date: e.target.value }))} className={inputCls} />
                  </Field>
                </div>
                <Field label="Receipt #">
                  <input value={form.receipt_number} onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Verification code">
                  <input value={form.verification_code} onChange={(e) => setForm((f) => ({ ...f, verification_code: e.target.value }))} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="TIN">
                    <input value={form.vendor_tin} onChange={(e) => setForm((f) => ({ ...f, vendor_tin: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="VRN">
                    <input value={form.vendor_vrn} onChange={(e) => setForm((f) => ({ ...f, vendor_vrn: e.target.value }))} className={inputCls} />
                  </Field>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button tint="admin" disabled={saving} onClick={() => void saveEdits()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save changes
                  </Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              // ── Read-only view ─────────────────────────────────────────
              <>
                {canName && (
                  <div className="mb-4">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-ink">My receipt name</span>
                      {nicknameSaved && !nicknameEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-muted px-3 py-2 text-sm text-ink">{nickname}</span>
                          <Button type="button" variant="secondary" tint="admin" onClick={() => setNicknameEditing(true)}>Edit</Button>
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            maxLength={120}
                            placeholder="e.g. Fuel for Dodoma site"
                            className={`${inputCls} flex-1 bg-surface`}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            tint="admin"
                            onClick={() => void saveNickname()}
                            disabled={savingNickname || nickname.trim().length > 120}
                            className="shrink-0"
                          >
                            {savingNickname ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save name'}
                          </Button>
                        </div>
                      )}
                      <span className="text-xs text-ink-muted">Only you can see and search this name.</span>
                    </label>
                  </div>
                )}
                <Row label="Vendor" value={data.vendor_name ?? '—'} strong />
                <Row label="Amount" value={<span className="font-display font-semibold">{formatMoney(data.total_amount)}</span>} />
                <Row label="Tax / VAT" value={formatMoney(data.tax_amount)} />
                <Row label="Category" value={data.category ?? '—'} />
                <Row label="Date" value={formatDate(data.receipt_date ?? data.created_at)} />
                <Row label="Receipt #" value={data.receipt_number ?? '—'} mono />
                <Row label="Verification code" value={data.verification_code ?? '—'} mono />
                <Row label="TIN" value={data.vendor_tin ?? '—'} mono />
                <Row label="VRN" value={data.vendor_vrn ?? '—'} mono />

                <div className="my-4 h-px bg-surface-border" />

                <Row
                  label="Payment method"
                  value={
                    <span className="inline-flex items-center gap-1 text-sm text-ink">
                      {data.payment_method === 'petty_cash' && <Wallet className="h-3.5 w-3.5 text-role-admin" />}
                      {data.payment_method === 'petty_cash' ? 'Petty cash' : 'Cash / Personal'}
                    </span>
                  }
                />
                <Row label="Project" value={project?.name ?? '—'} />
                <Row label="Uploaded by" value={<span className="font-semibold">{uploader ?? '—'}</span>} />
                <Row label="Uploaded at" value={formatDateTime(data.created_at)} />

                {data.low_confidence_fields.length > 0 && (
                  <div className="mt-4 rounded-lg border border-surface-border bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                    <span className="font-medium text-ink">Needs review:</span>{' '}
                    {data.low_confidence_fields.join(', ')}
                    {canEdit && <span className="mt-1 block text-ink-muted">Tap “Edit” to correct, or “Re-analyse” for a fresh high-accuracy read.</span>}
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
              </>
            )}
            </>}
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end border-t border-surface-border bg-surface p-3 sm:hidden">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>

      {zoomOpen && imgUrl && (
        <ImageLightbox src={imgUrl} alt={data.vendor_name ?? 'Receipt'} onClose={() => setZoomOpen(false)} />
      )}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
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

function ReceiptDetailsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading receipt details">
      <div className="h-5 w-28 animate-pulse rounded bg-surface-muted" />
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}
