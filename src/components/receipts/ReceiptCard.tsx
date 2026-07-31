import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { formatDate, formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { Receipt } from '@/types/db';

const STATUS_META = {
  processing: { label: sw.receipts.processing, icon: Loader2, className: 'text-amber-600', spin: true },
  confirmed: { label: sw.receipts.confirmed, icon: CheckCircle2, className: 'text-emerald-600', spin: false },
  duplicate: { label: sw.receipts.duplicate, icon: AlertTriangle, className: 'text-orange-600', spin: false },
  error: { label: sw.receipts.error, icon: XCircle, className: 'text-red-600', spin: false },
} as const;

export default function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const meta = STATUS_META[receipt.status];
  const StatusIcon = meta.icon;

  useEffect(() => {
    let cancelled = false;
    receiptImageUrl(receipt.image_url)
      .then((u) => !cancelled && setThumb(u))
      .catch(() => !cancelled && setThumb(null));
    return () => {
      cancelled = true;
    };
  }, [receipt.image_url]);

  return (
    <Card className="flex gap-3 p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">
              {receipt.vendor_name ?? '—'}
            </div>
            <div className="text-xs text-ink-muted">
              {formatDate(receipt.receipt_date ?? receipt.created_at)}
              {receipt.category && <> · {receipt.category}</>}
            </div>
          </div>
          <div className={`flex items-center gap-1 text-xs ${meta.className}`}>
            <StatusIcon className={`h-4 w-4 ${meta.spin ? 'animate-spin' : ''}`} />
            <span>{meta.label}</span>
          </div>
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="text-base font-semibold text-ink">
            {formatMoney(receipt.total_amount)}
          </div>
          {receipt.tax_amount !== null && (
            <div className="text-xs text-ink-muted">
              {sw.receipts.tax}: {formatMoney(receipt.tax_amount)}
            </div>
          )}
        </div>

        {receipt.low_confidence_fields.length > 0 && receipt.status === 'confirmed' && (
          <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            {sw.receipts.lowConfidence} {receipt.low_confidence_fields.join(', ')}
          </div>
        )}
      </div>
    </Card>
  );
}
