import { useEffect, useRef, useState } from 'react';
import { Loader2, Printer, ScanLine, Trash2, Upload, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import {
  acquireA3Scan,
  isScannerSdkAvailable,
  listScannerSources,
  type ScannerSource,
} from '@/features/batchScan/scannerService';
import {
  importBatch,
  scanA3AndExtract,
  type ExtractedReceipt,
} from '@/features/batchScan/batchScan';
import { formatMoney } from '@/lib/format';

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent', 'Communication', 'Consulting', 'Other',
];

type Phase = 'config' | 'processing' | 'review';

// A3 batch scanner panel. Config → Scan/Upload → AI split → Batch Review → Import All.
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('config');
  const [sources, setSources] = useState<ScannerSource[]>([]);
  const [sourceId, setSourceId] = useState<string>('');
  const [dpi, setDpi] = useState<'400' | '600'>('600');
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<ExtractedReceipt[]>([]);
  const [scannedDocId, setScannedDocId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const sdkAvailable = isScannerSdkAvailable();

  useEffect(() => {
    void listScannerSources().then((s) => {
      setSources(s);
      if (s[0]) setSourceId(s[0].id);
    });
  }, []);

  async function processFile(file: File) {
    setPhase('processing');
    setBusy(true);
    try {
      const result = await scanA3AndExtract(file, {
        project_id: projectId,
        user_id: userId,
        model: dpi === '600' ? 'claude-sonnet-5' : undefined, // higher-effort model for dense pages
      });
      setScannedDocId(result.scannedDocId);
      setImageUrl(result.storagePath);
      setRows(result.receipts);
      if (result.receipts.length === 0) {
        toast.info('No receipts were detected on the scan.');
      }
      setPhase('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scan failed');
      setPhase('config');
    } finally {
      setBusy(false);
    }
  }

  async function scanAndProcess() {
    // Try the hardware scanner first; fall back to the file picker.
    try {
      const blob = await acquireA3Scan({ sourceId: sourceId || null, pageSize: 'A3', dpi: Number(dpi) as 400 | 600 });
      await processFile(new File([blob], 'a3-scan.jpg', { type: blob.type || 'image/jpeg' }));
    } catch {
      fileInput.current?.click();
    }
  }

  async function importAll() {
    if (!scannedDocId || !imageUrl) return;
    // Guard: VAT must not exceed total on any row (matches the DB trigger).
    const bad = rows.find((r) => (r.tax_amount ?? 0) > (r.total_amount ?? 0));
    if (bad) {
      toast.error('One row has VAT greater than its total. Please fix it before importing.');
      return;
    }
    setBusy(true);
    try {
      const n = await importBatch(rows, {
        project_id: projectId,
        user_id: userId,
        scanned_doc_id: scannedDocId,
        image_url: imageUrl,
      });
      toast.success(`Imported ${n} receipt${n === 1 ? '' : 's'}.`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function patchRow(i: number, patch: Partial<ExtractedReceipt>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

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
                Place up to ~15 receipts on the A3 flatbed glass, then scan. The AI reads
                the whole page and splits it into individual receipts for review.
              </p>

              <div className="rounded-lg border border-surface-border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Printer className="h-4 w-4 text-ink-muted" /> Scanner settings
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    label="Source"
                    value={sourceId}
                    onChange={setSourceId}
                    placeholder={sdkAvailable ? 'Select scanner' : 'No scanner detected'}
                    options={sources.map((s) => ({ value: s.id, label: s.name }))}
                  />
                  <Select label="Page size" value="A3" onChange={() => {}} options={[{ value: 'A3', label: 'A3' }]} disabled />
                  <Select
                    label="Resolution"
                    value={dpi}
                    onChange={(v) => setDpi(v as '400' | '600')}
                    options={[{ value: '400', label: '400 DPI' }, { value: '600', label: '600 DPI (best)' }]}
                  />
                </div>
                {!sdkAvailable && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No TWAIN scanner service detected on this computer. You can still scan on
                    your office printer, save the A3 page as an image/PDF, and upload it below.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button tint="admin" fullWidth disabled={busy} onClick={() => void scanAndProcess()}>
                  <ScanLine className="h-4 w-4" /> Scan &amp; Process
                </Button>
                <Button variant="secondary" tint="admin" fullWidth disabled={busy} onClick={() => fileInput.current?.click()}>
                  <Upload className="h-4 w-4" /> Upload A3 image
                </Button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); }}
              />
            </div>
          )}

          {phase === 'processing' && (
            <div className="flex flex-col items-center gap-3 py-16 text-ink-muted">
              <Loader2 className="h-8 w-8 animate-spin text-role-admin" />
              <p className="text-sm">Reading the A3 page and splitting receipts…</p>
            </div>
          )}

          {phase === 'review' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Batch review · {rows.length} receipts</h3>
                <span className="text-xs text-ink-muted">Edit any field, then import.</span>
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
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-surface-border/60">
                        <td className="py-1.5 pr-2">
                          <input value={r.vendor ?? ''} onChange={(e) => patchRow(i, { vendor: e.target.value })}
                            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input type="date" value={r.receipt_date ?? ''} onChange={(e) => patchRow(i, { receipt_date: e.target.value })}
                            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <select value={r.category ?? 'Other'} onChange={(e) => patchRow(i, { category: e.target.value })}
                            className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm">
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <input inputMode="numeric" value={r.tax_amount ?? ''} onChange={(e) => patchRow(i, { tax_amount: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, '')) : null })}
                            className="w-24 rounded border border-surface-border bg-surface px-2 py-1 text-right text-sm tabular-nums" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input inputMode="numeric" value={r.total_amount ?? ''} onChange={(e) => patchRow(i, { total_amount: e.target.value ? Number(e.target.value.replace(/[^\d.]/g, '')) : null })}
                            className="w-28 rounded border border-surface-border bg-surface px-2 py-1 text-right text-sm tabular-nums" />
                        </td>
                        <td className="py-1.5 text-right">
                          <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600">
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
              Approve &amp; Import All ({rows.length})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
