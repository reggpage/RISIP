import { useEffect, useState } from 'react';
import { X, Receipt as ReceiptGlyph } from 'lucide-react';
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
}: {
  title: string;
  receipts: AuditReceipt[];
  onClose: () => void;
  authed?: boolean;
  // When set, images are fetched via the anon get-public-receipt-image edge function
  // (public invoice page). Otherwise the in-app signed-URL path is used.
  publicToken?: string;
}) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of receipts) {
        if (!r.image_url) continue;
        try {
          if (publicToken) {
            const { data } = await supabase.functions.invoke<{ signed_url: string | null }>(
              'get-public-receipt-image',
              { body: { public_token: publicToken, receipt_id: r.id } },
            );
            if (!cancelled && data?.signed_url) {
              setImages((prev) => ({ ...prev, [r.id]: data.signed_url! }));
            }
          } else if (authed) {
            const url = await receiptImageUrl(r.image_url);
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
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {receipts.map((r) => (
            <div key={r.id} className="rounded-xl border border-surface-border p-3">
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

              <div className="mt-3 h-40 overflow-hidden rounded-lg bg-surface-muted">
                {images[r.id] ? (
                  <img src={images[r.id]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-muted">
                    <ReceiptGlyph className="h-7 w-7" />
                    <span className="text-xs">No image</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
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
