import { useState } from 'react';
import { Building2, FileSpreadsheet, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import ReceiptAuditModal from '@/components/invoices/ReceiptAuditModal';
import { formatDate, formatMoney } from '@/lib/format';
import type { Invoice, InvoiceLineItem, Receipt } from '@/types/db';

type LineItemComputed = InvoiceLineItem & { total: number; tax: number; net: number };

// The digital invoice as the client sees it. Each line total is clickable — it opens
// the audit trail (the underlying receipts with TIN/VRN/verification code + image).
export default function InvoiceView({
  invoice,
  lineItems,
  totals,
  receipts,
  company,
  project,
  onRespond,
  onDisputeReceipt,
  onExportPdf,
  onExportExcel,
  authed = true,
  publicToken,
}: {
  invoice: Pick<Invoice, 'invoice_number' | 'client_name' | 'custom_notes' | 'period_start' | 'period_end' | 'signature_url' | 'status'>;
  lineItems: LineItemComputed[];
  totals: { net: number; tax: number; total: number };
  receipts: Array<Partial<Receipt> & { id: string }>;
  company?: { name: string; logo_url: string | null; hq_location?: string };
  project?: { name: string; site_location?: string | null };
  onRespond?: (action: 'accept' | 'dispute') => void;
  onDisputeReceipt?: (receiptId: string, message: string) => void | Promise<void>;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  authed?: boolean;
  publicToken?: string;
}) {
  const [auditCategory, setAuditCategory] = useState<LineItemComputed | null>(null);

  return (
    <Card className="p-6 sm:p-8">
      {/* Header: company logo + name top-LEFT, invoice number + export buttons top-right. */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <img src={company.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-surface-border object-contain" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-muted text-ink-muted">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div>
            <div className="text-lg font-semibold text-ink">{company?.name ?? 'Invoice'}</div>
            {company?.hq_location && <div className="text-xs text-ink-muted">{company.hq_location}</div>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="font-display text-lg font-semibold text-ink">{invoice.invoice_number ?? '—'}</div>
            <div className="text-xs text-ink-muted">
              {formatDate(invoice.period_start)} — {formatDate(invoice.period_end)}
            </div>
          </div>
          {(onExportPdf || onExportExcel) && (
            <div className="flex gap-1.5">
              {onExportPdf && (
                <button type="button" onClick={onExportPdf}
                  className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </button>
              )}
              {onExportExcel && (
                <button type="button" onClick={onExportExcel}
                  className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-muted">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {(invoice.client_name || project) && (
        <div className="mb-6 grid gap-2 text-sm sm:grid-cols-2">
          {invoice.client_name && (
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Bill to</div>
              <div className="font-medium text-ink">{invoice.client_name}</div>
            </div>
          )}
          {project && (
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Project</div>
              <div className="font-medium text-ink">{project.name}</div>
            </div>
          )}
        </div>
      )}

      {/* Line items — total is a golden clickable link into the audit trail. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2 text-right">VAT</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li) => (
              <tr key={li.category} className="border-b border-surface-border/60">
                <td className="py-2.5 text-ink">{li.description}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-muted">{formatMoney(li.net)}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-muted">{formatMoney(li.tax)}</td>
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setAuditCategory(li)}
                    className="font-display font-semibold text-role-admin underline decoration-dotted underline-offset-2 hover:decoration-solid"
                    title="View receipts behind this amount"
                  >
                    {formatMoney(li.total)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 text-right font-medium text-ink" colSpan={3}>Grand total</td>
              <td className="pt-3 text-right font-display text-lg font-semibold text-ink">{formatMoney(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {invoice.custom_notes && (
        <div className="mt-6 whitespace-pre-line rounded-lg bg-surface-muted p-4 text-sm text-ink">
          {invoice.custom_notes}
        </div>
      )}

      {invoice.signature_url && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Approved & signed</div>
          <img src={invoice.signature_url} alt="signature" className="mt-1 h-16 object-contain" />
        </div>
      )}

      {onRespond && invoice.status === 'sent' && (
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => onRespond('accept')}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Accept Invoice
          </button>
          <button
            type="button"
            onClick={() => onRespond('dispute')}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Dispute
          </button>
        </div>
      )}

      {auditCategory && (
        <ReceiptAuditModal
          title={auditCategory.description}
          receipts={receipts.filter((r) => auditCategory.receiptIds.includes(r.id))}
          onClose={() => setAuditCategory(null)}
          authed={authed}
          publicToken={publicToken}
          onDispute={onDisputeReceipt}
        />
      )}
    </Card>
  );
}
