import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Receipt as ReceiptGlyph } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useProjects } from '@/features/projects/useProjects';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { supabase } from '@/lib/supabase';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { Receipt } from '@/types/db';

const STATUS_META = {
  processing: { label: sw.receipts.processing, icon: Loader2, className: 'text-amber-600', spin: true },
  confirmed: { label: sw.receipts.confirmed, icon: CheckCircle2, className: 'text-emerald-600', spin: false },
  duplicate: { label: sw.receipts.duplicate, icon: AlertTriangle, className: 'text-orange-600', spin: false },
  error: { label: sw.receipts.error, icon: XCircle, className: 'text-red-600', spin: false },
} as const;

export default function ReceiptCard({
  receipt,
  onOpen,
}: {
  receipt: Receipt;
  onOpen?: (r: Receipt) => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [uploader, setUploader] = useState<string | null>(null);
  const { state: projectsState } = useProjects();
  const meta = STATUS_META[receipt.status];
  const StatusIcon = meta.icon;

  const project =
    projectsState.status === 'ready'
      ? projectsState.projects.find((p) => p.id === receipt.project_id) ?? null
      : null;

  useEffect(() => {
    if (!receipt.image_url) return;
    let cancelled = false;
    receiptImageUrl(receipt.image_url)
      .then((u) => !cancelled && setThumb(u))
      .catch(() => !cancelled && setThumb(null));
    return () => {
      cancelled = true;
    };
  }, [receipt.image_url]);

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
    return () => {
      cancelled = true;
    };
  }, [receipt.uploaded_by]);

  return (
    <Card className="flex gap-3 p-3">
      {/* Thumbnail slot — image if present, otherwise a bare (bg-less) receipt
          glyph, bigger than before so it reads at a glance on mobile lists. */}
      {thumb ? (
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center text-ink-muted">
          <ReceiptGlyph className="h-10 w-10" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">
              {receipt.vendor_name ?? '—'}
            </div>
            <div className="text-xs text-ink-muted">
              {formatDate(receipt.receipt_date ?? receipt.created_at)}
              {/* Upload clock time so the team can see exactly when it came in. */}
              <> · {formatTime(receipt.created_at)}</>
              {receipt.category && <> · {receipt.category}</>}
            </div>
          </div>
          <div className={`flex items-center gap-1 whitespace-nowrap text-xs ${meta.className}`}>
            <StatusIcon className={`h-4 w-4 ${meta.spin ? 'animate-spin' : ''}`} />
            <span>{meta.label}</span>
          </div>
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="font-display text-base font-semibold text-ink">
            {formatMoney(receipt.total_amount)}
          </div>
          {receipt.tax_amount !== null && (
            <div className="text-xs text-ink-muted">
              {sw.receipts.tax}: {formatMoney(receipt.tax_amount)}
            </div>
          )}
        </div>

        {/* Meta line: bold uploader name (no "by") + project chip. Payment method
            badges removed per feedback — that context lives in the Details modal. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {uploader && <span className="font-semibold text-ink">{uploader}</span>}
          {project && <span>· {project.name}</span>}
        </div>

        {onOpen && (
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" onClick={() => onOpen(receipt)} className="!px-2 !py-1 text-xs">
              Details
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
