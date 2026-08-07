import { useEffect, useRef, useState } from 'react';
import { Eye, FileText, Loader2, Pencil, Save, ScanLine, Trash2, Upload, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  applyMerchantMemory as applySavedMerchantMemory,
  loadMerchantMemory,
  rememberMerchantCorrection as rememberSavedMerchantCorrection,
} from '@/features/receipts/merchantMemory';
import {
  importBatch,
  normalizeExtractedReceipt,
  scanA3AndExtract,
  type ExtractedReceipt,
} from '@/features/batchScan/batchScan';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { formatMoney } from '@/lib/format';
import ImageLightbox from '@/components/ui/ImageLightbox';

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent', 'Communication', 'Consulting', 'Other',
];

type Phase = 'config' | 'processing' | 'review';

// A review row is an extracted receipt; when it carries an `id` it's an already-persisted
// inbound (scan-to-email) receipt we approve in place, not a new one we insert.
type ReviewRow = ExtractedReceipt & { id?: string };
// Batch panel. Upload one A4/A3 page (image or PDF) with several receipts; the AI splits
// it into individual receipts for review.
export default function BatchScanPanel({
  projectId,
  userId,
  onClose,
  onImported,
}: {
  projectId: string;
  userId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const auth = useAuth();
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('config');
  const [busy, setBusy] = useState(false);

  const [reviewSource, setReviewSource] = useState<'upload' | 'inbound'>('upload');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [scannedDocId, setScannedDocId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [detailDraft, setDetailDraft] = useState<ReviewRow | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailImageUrl, setDetailImageUrl] = useState<string | null>(null);
  const [detailImageLoading, setDetailImageLoading] = useState(false);
  const [detailZoomOpen, setDetailZoomOpen] = useState(false);

  const selectedRow = selectedIndex === null ? null : rows[selectedIndex] ?? null;

  async function processFile(file: File) {
    setReviewSource('upload');
    setPhase('processing');
    setBusy(true);
    try {
      const result = await scanA3AndExtract(file, { project_id: projectId, user_id: userId });
      setScannedDocId(result.scannedDocId);
      setImageUrl(result.storagePath);
      const memory = await loadMerchantMemory().catch(() => []); // A scan still works without memory.
      setRows(result.receipts.map((receipt) => {
        const normalized = normalizeExtractedReceipt(receipt);
        const remembered = applySavedMerchantMemory({
          vendor_name: normalized.vendor,
          vendor_tin: normalized.vendor_tin,
          vendor_vrn: normalized.vendor_vrn,
          category: normalized.category,
        }, memory);
        return { ...normalized, vendor: remembered.vendor_name, vendor_tin: remembered.vendor_tin, vendor_vrn: remembered.vendor_vrn, category: remembered.category };
      }));
      if (result.receipts.length === 0) {
        toast.info('No receipts were detected on the page.');
      }
      setPhase('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scan failed');
      setPhase('config');
    } finally {
      setBusy(false);
    }
  }

  async function importAll() {
    const bad = rows.find((r) => (r.tax_amount ?? 0) > (r.total_amount ?? 0));
    if (bad) {
      toast.error('One row has VAT greater than its total. Please fix it before importing.');
      return;
    }
    setBusy(true);
    try {
      if (reviewSource === 'inbound') {
        for (const r of rows) {
          if (!r.id) continue;
          const { error } = await supabase
            .from('receipts')
            .update({
              vendor_name: r.vendor,
              vendor_tin: r.vendor_tin,
              vendor_vrn: r.vendor_vrn,
              receipt_date: r.receipt_date,
              category: r.category,
              verification_code: r.verification_code,
              tax_amount: r.tax_amount,
              total_amount: r.total_amount,
              status: 'confirmed',
            })
            .eq('id', r.id);
          if (error) throw error;
        }
        toast.success(`Approved ${rows.length} receipt${rows.length === 1 ? '' : 's'}.`);
      } else {
        if (!scannedDocId || !imageUrl) return;
        const n = await importBatch(rows, {
          project_id: projectId,
          user_id: userId,
          scanned_doc_id: scannedDocId,
          image_url: imageUrl,
        });
        toast.success(`Imported ${n} receipt${n === 1 ? '' : 's'}.`);
      }
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function patchRow(i: number, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function openDetails(i: number) {
    setSelectedIndex(i);
    setDetailDraft({ ...rows[i] });
    setDetailEditing(false);
    setDetailZoomOpen(false);
  }
  function closeDetails() {
    setSelectedIndex(null);
    setDetailDraft(null);
    setDetailEditing(false);
    setDetailImageUrl(null);
    setDetailZoomOpen(false);
  }
  async function saveDetails() {
    if (selectedIndex === null || !detailDraft) return;
    const profile = auth.status === 'signed-in' ? auth.profile : null;
    if (profile) {
      try {
        await rememberSavedMerchantCorrection({
          companyId: profile.company_id,
          userId: profile.id,
          receiptId: detailDraft.id ?? '',
          before: {
            vendor_name: rows[selectedIndex].vendor,
            vendor_tin: rows[selectedIndex].vendor_tin,
            vendor_vrn: rows[selectedIndex].vendor_vrn,
            category: rows[selectedIndex].category,
          },
          after: {
            vendor_name: detailDraft.vendor,
            vendor_tin: detailDraft.vendor_tin,
            vendor_vrn: detailDraft.vendor_vrn,
            category: detailDraft.category,
          },
        });
      } catch (memoryError) {
        console.error('merchant memory save failed', memoryError);
      }
    }
    patchRow(selectedIndex, detailDraft);
    setDetailEditing(false);
  }
  async function removeRow(i: number) {
    const r = rows[i];
    if (reviewSource === 'inbound' && r.id) {
      const { error } = await supabase.from('receipts').delete().eq('id', r.id);
      if (error) { toast.error(error.message); return; }
    }
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  useEffect(() => {
    if (detailDraft?.image_preview_url) {
      setDetailImageUrl(detailDraft.image_preview_url);
      setDetailImageLoading(false);
      return;
    }
    const path = detailDraft?.image_url ?? imageUrl;
    if (!path || path.toLowerCase().endsWith('.pdf')) {
      setDetailImageUrl(null);
      return;
    }
    let alive = true;
    setDetailImageLoading(true);
    void receiptImageUrl(path)
      .then((url) => {
        if (!alive) return;
        setDetailImageUrl(url);
      })
      .catch(() => {
        if (!alive) return;
        setDetailImageUrl(null);
      })
      .finally(() => {
        if (alive) setDetailImageLoading(false);
      });
    return () => { alive = false; };
  }, [detailDraft?.image_preview_url, detailDraft?.image_url, imageUrl]);

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ScanLine className="h-4 w-4" /> Batch Scan
          </h2>
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {phase === 'config' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-muted">
                Upload one A4 or A3 page (image or PDF) printed or scanned with several
                receipts. The AI reads the whole page and splits it into individual
                receipts for review.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="primary"
                  tint="admin"
                  fullWidth
                  disabled={busy}
                  onClick={() => imageInput.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Upload image
                </Button>
                <Button variant="secondary" tint="admin" fullWidth disabled={busy} onClick={() => pdfInput.current?.click()}>
                  <FileText className="h-4 w-4" /> Upload PDF
                </Button>
              </div>

              <input ref={imageInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); e.target.value = ''; }} />
              <input ref={pdfInput} type="file" accept="application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); e.target.value = ''; }} />
            </div>
          )}

          {phase === 'processing' && (
            <div className="flex flex-col items-center gap-3 py-16 text-ink-muted">
              <Loader2 className="h-8 w-8 animate-spin text-role-admin" />
              <p className="text-sm">Reading the page and splitting receipts…</p>
            </div>
          )}

          {phase === 'review' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Batch review · {rows.length} receipts</h3>
                <span className="text-xs text-ink-muted">View details, edit inside the card, then approve.</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-2">Vendor</th>
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2">Category</th>
                      <th className="py-2 pr-2 text-right">VAT</th>
                      <th className="py-2 pr-2 text-right">Total</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id ?? i} className="border-b border-surface-border/60">
                        <td className="max-w-[210px] py-2 pr-2 font-medium text-ink">
                          <span className="block truncate">{r.vendor ?? 'Unknown vendor'}</span>
                        </td>
                        <td className="py-2 pr-2 text-ink-muted">{r.receipt_date ?? '—'}</td>
                        <td className="py-2 pr-2 text-ink-muted">{r.category ?? 'Other'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-ink-muted">{r.tax_amount ?? '—'}</td>
                        <td className="py-2 pr-2 text-right font-medium tabular-nums text-ink">{r.total_amount ?? '—'}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => openDetails(i)}
                            className="mr-1 rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                            aria-label="View receipt details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void removeRow(i)} className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600" aria-label="Remove receipt">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.length > 0 && (
                <div className="text-right text-sm text-ink-muted">
                  Batch total:{' '}
                  <span className="font-display font-semibold text-ink">
                    {formatMoney(rows.reduce((s, r) => s + (r.total_amount ?? 0), 0))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {phase === 'review' && (
          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
            <Button variant="ghost" onClick={() => setPhase('config')} disabled={busy}>Back</Button>
            <Button tint="admin" disabled={busy || rows.length === 0} onClick={() => void importAll()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {reviewSource === 'inbound'
                ? `Approve & Confirm All (${rows.length})`
                : `Approve & Import All (${rows.length})`}
            </Button>
          </div>
        )}
      </div>

      {selectedRow && detailDraft && (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
              <div>
                <h3 className="text-base font-semibold text-ink">Receipt details</h3>
                <p className="text-xs text-ink-muted">{detailDraft.vendor ?? 'Unknown vendor'}</p>
              </div>
              <button type="button" onClick={closeDetails} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-muted">
                  {detailImageLoading ? (
                    <div className="flex h-56 items-center justify-center text-ink-muted">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : detailImageUrl ? (
                    <button
                      type="button"
                      onClick={() => setDetailZoomOpen(true)}
                      className="group relative block h-56 w-full"
                      aria-label="View receipt image"
                    >
                      <img src={detailImageUrl} alt="Receipt crop" className="h-full w-full object-contain transition group-hover:opacity-90" />
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                        View image
                      </span>
                    </button>
                  ) : (
                    <div className="flex h-56 items-center justify-center px-4 text-center text-xs text-ink-muted">
                      Receipt crop preview is unavailable for this scan.
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2 text-xs font-medium text-ink-muted">
                    Vendor
                    <input disabled={!detailEditing} value={detailDraft.vendor ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, vendor: e.target.value })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="text-xs font-medium text-ink-muted">
                    Date
                    <input disabled={!detailEditing} type="date" value={detailDraft.receipt_date ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, receipt_date: e.target.value })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="text-xs font-medium text-ink-muted">
                    Category
                    <select disabled={!detailEditing} value={detailDraft.category ?? 'Other'} onChange={(e) => setDetailDraft({ ...detailDraft, category: e.target.value })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-ink-muted">
                    TIN
                    <input disabled={!detailEditing} value={detailDraft.vendor_tin ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, vendor_tin: e.target.value })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="text-xs font-medium text-ink-muted">
                    VRN
                    <input disabled={!detailEditing} value={detailDraft.vendor_vrn ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, vendor_vrn: e.target.value })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="sm:col-span-2 text-xs font-medium text-ink-muted">
                    Verification code
                    <input disabled={!detailEditing} value={detailDraft.verification_code ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, verification_code: e.target.value })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="text-xs font-medium text-ink-muted">
                    Net
                    <input disabled={!detailEditing} inputMode="numeric" value={detailDraft.net_amount ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, net_amount: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, '')) : null })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="text-xs font-medium text-ink-muted">
                    VAT
                    <input disabled={!detailEditing} inputMode="numeric" value={detailDraft.tax_amount ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, tax_amount: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, '')) : null })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-surface-muted" />
                  </label>
                  <label className="sm:col-span-2 text-xs font-medium text-ink-muted">
                    Total
                    <input disabled={!detailEditing} inputMode="numeric" value={detailDraft.total_amount ?? ''} onChange={(e) => setDetailDraft({ ...detailDraft, total_amount: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, '')) : null })}
                      className="mt-1 w-full rounded border border-surface-border bg-surface px-2 py-2 text-sm font-semibold text-ink disabled:bg-surface-muted" />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
              <Button variant="ghost" onClick={closeDetails}>Close</Button>
              {detailEditing ? (
                <Button tint="admin" onClick={() => void saveDetails()}>
                  <Save className="h-4 w-4" /> Save
                </Button>
              ) : (
                <Button tint="admin" onClick={() => setDetailEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {detailZoomOpen && detailImageUrl && (
        <ImageLightbox
          src={detailImageUrl}
          alt={detailDraft?.vendor ?? 'Receipt'}
          onClose={() => setDetailZoomOpen(false)}
        />
      )}
    </div>
  );
}
