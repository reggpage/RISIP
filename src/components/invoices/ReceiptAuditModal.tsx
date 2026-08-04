import { useEffect, useState } from 'react';
import { X, Receipt as ReceiptGlyph } from 'lucide-react';
import ImageLightbox from '@/components/ui/ImageLightbox';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { supabase } from '@/lib/supabase';
import { formatDate, formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

type AuditReceipt = Partial<Receipt> & { id: string };

// The "golden link" audit trail: a client clicks an invoice amount and sees the exact
// receipts behind it — vendor, TIN, VRN, verification code, amounts and the scanned
// image. Works both in-app (authed) and on the public page (via a token-scoped edge fn).
export default function ReceiptAuditModal({
  title,
  receipts,
  onClose,
  authed = true,
  publicToken,
  onDispute,
}: {
  title: string;
  receipts: AuditReceipt[];
  onClose: () => void;
  authed?: boolean;
  // When set, images are fetched via the anon get-public-receipt-image edge function
  // (public invoice page). Otherwise the in-app signed-URL path is used.
  publicToken?: string;
  // When provided (public page), each receipt gets a "Report an issue" affordance.
  onDispute?: (receiptId: string, message: string) => void | Promise<void>;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [disputing, setDisputing] = useState<string | null>(null);
  const [disputeText, setDisputeText] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of receipts) {
        try {
          if (publicToken) {
            const { data } = await supabase.functions.invoke<{ signed_url: string | null }>(
              'get-public-receipt-image',
              { body: { public_token: publicToken, receipt_id: r.id } },
            );
            if (!cancelled && data?.signed_url) {
              setImages((prev) => ({ ...prev, [r.id]: data.signed_url! }));
            }
          } else if (authed && r.image_url) {
            const url = await receiptImageUrl(r.image_url);
            if (!cancelled) setImages((prev) => ({ ...prev, [r.id]: url }));
          } else if (authed && r.scanned_doc_id) {
            const { data: doc } = await supabase
              .from('scanned_documents')
              .select('file_url')
              .eq('id', r.scanned_doc_id)
              .maybeSingle();
            const path = doc?.file_url as string | undefined;
            if (!path || path.toLowerCase().endsWith('.pdf')) continue;
            const url = await receiptImageUrl(path);
            if (!cancelled) setImages((prev) => ({ ...prev, [r.id]: url }));
          }
        } catch {
          /* ignore — falls back to the glyph placeholder */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [receipts, authed, publicToken]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {receipts.map((r) => (
            <div key={r.id} className="grid gap-3 rounded-xl border border-surface-border p-3 sm:grid-cols-[150px_1fr]">
              <div className="overflow-hidden rounded-lg bg-surface-muted">
                {images[r.id] ? (
                  <button
                    type="button"
                    onClick={() => setZoom({ src: images[r.id], alt: r.vendor_name ?? 'Receipt' })}
                    className="group block aspect-[3/4] w-full"
                    aria-label="View receipt image"
                    title="View image"
                  >
                    <img src={images[r.id]} alt="" className="h-full w-full object-cover transition group-hover:opacity-90" />
                  </button>
                ) : (
                  <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 text-ink-muted">
                    <ReceiptGlyph className="h-7 w-7" />
                    <span className="text-xs">No image</span>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">{r.vendor_name ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{formatDate(r.receipt_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-semibold text-ink">{formatMoney(r.total_amount ?? null)}</div>
                    <div className="text-xs text-ink-muted">VAT {formatMoney(r.tax_amount ?? null)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <Meta label="TIN" value={r.vendor_tin ?? '—'} />
                  <Meta label="VRN" value={r.vendor_vrn ?? '—'} />
                  <Meta label="Verification code" value={r.verification_code ?? '—'} />
                  <Meta label="Category" value={r.category ?? '—'} />
                </div>

                {/* Per-receipt dispute (public page only). */}
                {onDispute && (
                  <div className="mt-3">
                  {sent.has(r.id) ? (
                    <p className="text-xs font-medium text-emerald-600">Issue reported. The accountant will review it.</p>
                  ) : disputing === r.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={disputeText}
                        onChange={(e) => setDisputeText(e.target.value)}
                        rows={2}
                        placeholder="e.g. This image is unreadable, please re-upload."
                        className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!disputeText.trim()}
                          onClick={async () => {
                            await onDispute(r.id, disputeText.trim());
                            setSent((s) => new Set(s).add(r.id));
                            setDisputing(null);
                            setDisputeText('');
                          }}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          Submit issue
                        </button>
                        <button type="button" onClick={() => { setDisputing(null); setDisputeText(''); }}
                          className="rounded-lg px-3 py-1.5 text-xs text-ink-muted hover:text-ink">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDisputing(r.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Report an issue with this receipt
                    </button>
                  )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {zoom && <ImageLightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="font-mono text-ink">{value}</div>
    </div>
  );
}
