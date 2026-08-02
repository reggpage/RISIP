import { useEffect, useRef, useState } from 'react';
import { Loader2, Printer, Radio, ScanLine, Trash2, Upload, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
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
import type { Receipt } from '@/types/db';

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent', 'Communication', 'Consulting', 'Other',
];

type Phase = 'config' | 'processing' | 'review';

// A review row is an extracted receipt; when it carries an `id` it's an already-persisted
// inbound (scan-to-email) receipt we approve in place, not a new one we insert.
type ReviewRow = ExtractedReceipt & { id?: string };

function toReviewRow(rc: Receipt): ReviewRow {
  return {
    id: rc.id,
    vendor: rc.vendor_name,
    vendor_tin: rc.vendor_tin,
    vendor_vrn: rc.vendor_vrn,
    receipt_date: rc.receipt_date,
    category: rc.category,
    verification_code: rc.verification_code,
    net_amount: null,
    tax_amount: rc.tax_amount,
    total_amount: rc.total_amount,
  };
}

// A3 batch panel. Two ways in: (1) Listen live for scans emailed from the office printer,
// or (2) Upload an A3 image directly. Both land in the same Batch Review table.
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
  const companyId = auth.status === 'signed-in' ? auth.profile.company_id : null;
  // The live scanner-email listener is a company-wide feature; staff just upload a page.
  const isFinance = auth.status === 'signed-in' && (auth.profile.role === 'owner' || auth.profile.role === 'accountant');
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('config');
  const [sources, setSources] = useState<ScannerSource[]>([]);
  const [sourceId, setSourceId] = useState<string>('');
  const [pageSize, setPageSize] = useState<'A4' | 'A3'>('A4');
  const [dpi, setDpi] = useState<'400' | '600'>('600');
  const [busy, setBusy] = useState(false);

  // Live listener state.
  const [isListening, setIsListening] = useState(false);
  const channelId = useRef(`batch-listen-${Math.random().toString(36).slice(2)}`);
  const debounceRef = useRef<number | null>(null);

  // Where the review rows came from decides what "Approve" does: insert (upload) vs
  // confirm-existing (inbound email).
  const [reviewSource, setReviewSource] = useState<'upload' | 'inbound'>('upload');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [scannedDocId, setScannedDocId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const sdkAvailable = isScannerSdkAvailable();

  useEffect(() => {
    void listScannerSources().then((s) => {
      setSources(s);
      if (s[0]) setSourceId(s[0].id);
    });
  }, []);

  // Pull the whole batch that shares a scanned_doc_id and drop it into the review table.
  async function loadInboundBatch(docId: string) {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('scanned_doc_id', docId)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true });
    if (error || !data || data.length === 0) return;
    const receipts = data as Receipt[];
    setRows(receipts.map(toReviewRow));
    setScannedDocId(docId);
    setImageUrl(receipts[0].image_url ?? null);
    setReviewSource('inbound');
    setIsListening(false);
    setPhase('review');
    toast.success(`${receipts.length} receipt${receipts.length === 1 ? '' : 's'} received from the scanner.`);
  }

  // Realtime: while listening, watch for pending_review receipts arriving via scan-to-email
  // for this company. Debounce so all rows of one A3 page (a single INSERT batch) collect
  // before we load them together.
  useEffect(() => {
    if (!isListening || !companyId) return;
    const channel = supabase
      .channel(channelId.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'receipts', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row = payload.new as Receipt;
          if (row.status !== 'pending_review' || !row.scanned_doc_id) return;
          const docId = row.scanned_doc_id;
          if (debounceRef.current) window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => { void loadInboundBatch(docId); }, 1200);
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, companyId]);

  async function processFile(file: File) {
    setIsListening(false);
    setReviewSource('upload');
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

  async function importAll() {
    // Guard: VAT must not exceed total on any row (matches the DB trigger).
    const bad = rows.find((r) => (r.tax_amount ?? 0) > (r.total_amount ?? 0));
    if (bad) {
      toast.error('One row has VAT greater than its total. Please fix it before importing.');
      return;
    }
    setBusy(true);
    try {
      if (reviewSource === 'inbound') {
        // Rows already exist as pending_review — confirm them in place.
        for (const r of rows) {
          if (!r.id) continue;
          const { error } = await supabase
            .from('receipts')
            .update({
              vendor_name: r.vendor,
              receipt_date: r.receipt_date,
              category: r.category,
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
  async function removeRow(i: number) {
    const r = rows[i];
    // Inbound rows are persisted — discarding one deletes it from the ledger.
    if (reviewSource === 'inbound' && r.id) {
      const { error } = await supabase.from('receipts').delete().eq('id', r.id);
      if (error) { toast.error(error.message); return; }
    }
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
                Upload one A4 or A3 page printed or scanned with several receipts. The AI
                reads the whole page and splits it into individual receipts for review.
              </p>

              <div className="rounded-lg border border-surface-border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Printer className="h-4 w-4 text-ink-muted" /> Page settings
                </div>
                <div className={`grid gap-3 ${sdkAvailable ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {sdkAvailable && (
                    <Select
                      label="Source"
                      value={sourceId}
                      onChange={setSourceId}
                      placeholder="Select scanner"
                      options={sources.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  )}
                  <Select
                    label="Page size"
                    value={pageSize}
                    onChange={(v) => setPageSize(v as 'A4' | 'A3')}
                    options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]}
                  />
                  <Select
                    label="Resolution"
                    value={dpi}
                    onChange={(v) => setDpi(v as '400' | '600')}
                    options={[{ value: '400', label: '400 DPI' }, { value: '600', label: '600 DPI (best)' }]}
                  />
                </div>
                {!sdkAvailable && (
                  <p className="mt-3 text-xs text-sky-700">
                    No TWAIN scanner service detected on this computer. You can still scan on
                    your office printer, save the A3 page as an image/PDF, and upload it below.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {/* Live listener — finance only. Sits open and waits for the printer to
                    email a scan, which lands here automatically. */}
                {isFinance && (!isListening ? (
                  <Button tint="admin" fullWidth disabled={busy} onClick={() => setIsListening(true)}>
                    <Radio className="h-4 w-4" /> 📡 Listen to Scanner
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    onClick={() => setIsListening(false)}
                    className="animate-pulse !bg-sky-600 !border-sky-600 !text-white hover:!bg-sky-700"
                  >
                    <Radio className="h-4 w-4" /> 📡 Waiting for scans…
                  </Button>
                ))}
                <Button
                  variant={isFinance ? 'secondary' : 'primary'}
                  tint="admin"
                  fullWidth
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Upload {pageSize} image
                </Button>
              </div>

              {/* Listener status card. */}
              {isListening && (
                <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-sky-600" />
                  <div>
                    <p className="text-sm font-medium text-sky-800">Risip is listening live</p>
                    <p className="mt-1 text-xs leading-relaxed text-sky-700">
                      Go to your Canon printer, tap “Scan to Email”, and send the document to your
                      scanner inbox. It will appear here instantly.
                    </p>
                  </div>
                </div>
              )}

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
                <span className="text-xs text-ink-muted">Edit any field, then approve.</span>
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
                      <tr key={r.id ?? i} className="border-b border-surface-border/60">
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
                          <button type="button" onClick={() => void removeRow(i)} className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600">
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
    </div>
  );
}
