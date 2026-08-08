import { useState } from 'react';
import { Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { Company, Project, Receipt } from '@/types/db';

type Props = {
  receipts: Receipt[];
  company: Company | null;
  projects: Project[];
};

const STATUS_LABEL: Record<Receipt['status'], string> = {
  processing: 'Processing',
  confirmed: 'Confirmed',
  duplicate: 'Duplicate',
  error: 'Error',
  pending_review: 'Needs review',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safe(value: string | null | undefined): string {
  return escapeHtml(value || '—');
}

function printDocument(printWindow: Window, receipts: Receipt[], company: Company | null, projects: Project[], imageUrls: Record<string, string>) {

  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const sorted = [...receipts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = sorted.reduce((sum, receipt) => sum + Number(receipt.total_amount || 0), 0);
  const confirmedTotal = sorted
    .filter((receipt) => receipt.status === 'confirmed')
    .reduce((sum, receipt) => sum + Number(receipt.total_amount || 0), 0);
  const generatedAt = formatDateTime(new Date().toISOString());

  const rows = sorted.map((receipt, index) => {
    const image = imageUrls[receipt.id]
      ? `<img class="receipt-thumb" src="${escapeHtml(imageUrls[receipt.id])}" alt="" />`
      : '<div class="receipt-thumb receipt-placeholder">No image</div>';
    const statusClass = receipt.status === 'confirmed' ? 'status-confirmed' : 'status-other';
    return `<tr>
      <td class="number">${index + 1}</td>
      <td class="image-cell">${image}</td>
      <td><strong>${safe(receipt.vendor_name)}</strong><div class="muted">${safe(receipt.receipt_number ? `Receipt #${receipt.receipt_number}` : null)}</div></td>
      <td>${safe(receipt.category)}<div class="muted">${safe(projectNames.get(receipt.project_id))}</div></td>
      <td>${safe(formatDate(receipt.receipt_date))}<div class="muted">Recorded ${safe(formatDateTime(receipt.created_at))}</div></td>
      <td class="amount">${safe(formatMoney(receipt.total_amount))}<div class="muted">VAT ${safe(formatMoney(receipt.tax_amount))}</div></td>
      <td><span class="status ${statusClass}">${STATUS_LABEL[receipt.status]}</span></td>
    </tr>`;
  }).join('');

  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8" /><title>Receipt Register - ${safe(company?.name ?? 'Risip')}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font: 10px/1.4 Arial, Helvetica, sans-serif; background: white; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 12px; border-bottom: 2px solid #172033; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 34px; height: 34px; object-fit: contain; border-radius: 50%; }
  .company { margin: 0; font-size: 17px; letter-spacing: -.2px; }
  .title { margin: 3px 0 0; color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: 1.1px; }
  .meta { color: #667085; text-align: right; font-size: 9px; }
  .meta strong { display: block; color: #172033; font-size: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
  .summary-card { border: 1px solid #d9e0ea; border-radius: 6px; padding: 8px 10px; }
  .summary-label { color: #667085; font-size: 8px; text-transform: uppercase; letter-spacing: .7px; }
  .summary-value { margin-top: 2px; font-size: 14px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { padding: 7px 5px; border-bottom: 1px solid #aab4c3; color: #667085; font-size: 8px; text-align: left; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 7px 5px; border-bottom: 1px solid #e5e9ef; vertical-align: middle; overflow-wrap: anywhere; }
  tr { page-break-inside: avoid; }
  th:nth-child(1), td:nth-child(1) { width: 4%; }
  th:nth-child(2), td:nth-child(2) { width: 14%; }
  th:nth-child(3), td:nth-child(3) { width: 18%; }
  th:nth-child(4), td:nth-child(4) { width: 15%; }
  th:nth-child(5), td:nth-child(5) { width: 21%; }
  th:nth-child(6), td:nth-child(6) { width: 15%; }
  th:nth-child(7), td:nth-child(7) { width: 13%; }
  .number { color: #667085; text-align: center; }
  .image-cell { padding-right: 2px; }
  .receipt-thumb { display: block; width: 26mm; height: 31mm; border-radius: 3px; object-fit: cover; background: #f2f4f7; }
  .receipt-placeholder { padding-top: 13mm; color: #98a2b3; font-size: 8px; text-align: center; }
  .muted { margin-top: 2px; color: #667085; font-size: 8px; }
  .amount { font-weight: 700; white-space: nowrap; }
  .status { display: inline-block; border-radius: 10px; padding: 3px 6px; font-size: 8px; font-weight: 700; white-space: nowrap; }
  .status-confirmed { color: #087443; background: #e7f6ee; }
  .status-other { color: #8a4b08; background: #fff3df; }
  .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #d9e0ea; color: #667085; font-size: 8px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <header class="header">
    <div class="brand">${company?.logo_url ? `<img class="logo" src="${escapeHtml(company.logo_url)}" alt="" />` : ''}<div><h1 class="company">${safe(company?.name ?? 'Risip')}</h1><p class="title">Receipt register</p></div></div>
    <div class="meta"><strong>${sorted.length} receipt${sorted.length === 1 ? '' : 's'}</strong>Generated ${safe(generatedAt)}</div>
  </header>
  <section class="summary">
    <div class="summary-card"><div class="summary-label">Total value shown</div><div class="summary-value">${safe(formatMoney(total))}</div></div>
    <div class="summary-card"><div class="summary-label">Confirmed value</div><div class="summary-value">${safe(formatMoney(confirmedTotal))}</div></div>
    <div class="summary-card"><div class="summary-label">Records</div><div class="summary-value">${sorted.length}</div></div>
  </section>
  <table><thead><tr><th>#</th><th>Image</th><th>Supplier</th><th>Category / Project</th><th>Dates</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="footer">Receipt date is the date printed on the source receipt. “Recorded” is the day and time the receipt entered Risip.</div>
</body></html>`);
  printWindow.document.close();

  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };
  const images = Array.from(printWindow.document.images);
  if (images.length === 0) {
    window.setTimeout(print, 120);
  } else {
    let remaining = images.length;
    const done = () => { remaining -= 1; if (remaining <= 0) print(); };
    images.forEach((image) => {
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      if (image.complete) done();
    });
    window.setTimeout(print, 2500);
  }
}

export default function ReceiptPrintButton({ receipts, company, projects }: Props) {
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    if (receipts.length === 0 || printing) return;
    setPrinting(true);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setPrinting(false);
      window.alert('Please allow pop-ups to print receipts.');
      return;
    }
    printWindow.opener = null;
    printWindow.document.write('<p style="font:14px Arial;padding:24px">Preparing receipt register…</p>');
    try {
      const entries = await Promise.all(receipts.map(async (receipt) => {
        if (!receipt.image_url) return [receipt.id, ''] as const;
        try { return [receipt.id, await receiptImageUrl(receipt.image_url, 60 * 60)] as const; }
        catch { return [receipt.id, ''] as const; }
      }));
      printDocument(printWindow, receipts, company, projects, Object.fromEntries(entries));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not open the print preview.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Button variant="secondary" tint="admin" disabled={receipts.length === 0 || printing} onClick={() => void handlePrint()}>
      <Printer className="h-4 w-4" />
      {printing ? 'Preparing…' : `Print all (${receipts.length})`}
    </Button>
  );
}
