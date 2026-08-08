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

async function printDocument(
  printWindow: Window,
  receipts: Receipt[],
  company: Company | null,
  projects: Project[],
  imageUrls: Record<string, string>,
) {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const sorted = [...receipts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = sorted.reduce((sum, receipt) => sum + Number(receipt.total_amount || 0), 0);
  const confirmedTotal = sorted
    .filter((receipt) => receipt.status === 'confirmed')
    .reduce((sum, receipt) => sum + Number(receipt.total_amount || 0), 0);
  const generatedAt = formatDateTime(new Date().toISOString());

  const cards = sorted.map((receipt, index) => {
    const image = imageUrls[receipt.id]
      ? `<img class="receipt-thumb" src="${escapeHtml(imageUrls[receipt.id])}" alt="Receipt ${index + 1}" />`
      : '<div class="receipt-thumb receipt-placeholder">Image unavailable</div>';
    const statusClass = receipt.status === 'confirmed' ? 'status-confirmed' : 'status-other';
    return `<article class="receipt-card">
      <div class="card-top"><span class="receipt-number">#${index + 1}</span><span class="status ${statusClass}">${STATUS_LABEL[receipt.status]}</span></div>
      <div class="card-main">
        <div class="image-wrap">${image}</div>
        <div class="details">
          <h2>${safe(receipt.vendor_name)}</h2>
          <div class="amount">${safe(formatMoney(receipt.total_amount))}</div>
          <dl>
            <div><dt>VAT</dt><dd>${safe(formatMoney(receipt.tax_amount))}</dd></div>
            <div><dt>Category</dt><dd>${safe(receipt.category)}</dd></div>
            <div><dt>Project</dt><dd>${safe(projectNames.get(receipt.project_id))}</dd></div>
            <div><dt>Receipt date</dt><dd>${safe(formatDate(receipt.receipt_date))}</dd></div>
            <div><dt>Receipt #</dt><dd>${safe(receipt.receipt_number)}</dd></div>
            <div><dt>Recorded</dt><dd>${safe(formatDateTime(receipt.created_at))}</dd></div>
          </dl>
        </div>
      </div>
    </article>`;
  });
  const pages = Array.from({ length: Math.ceil(cards.length / 4) }, (_, index) => cards.slice(index * 4, index * 4 + 4));
  const pageMarkup = pages.map((page, index) => `<section class="print-page">
    ${index === 0 ? `<header class="header">
      <div class="brand">${company?.logo_url ? `<img class="logo" src="${escapeHtml(company.logo_url)}" alt="" />` : ''}<div><h1 class="company">${safe(company?.name ?? 'Risip')}</h1><p class="title">Receipt register</p></div></div>
      <div class="meta"><strong>${sorted.length} receipt${sorted.length === 1 ? '' : 's'}</strong>Generated ${safe(generatedAt)}</div>
    </header>
    <section class="summary">
      <div class="summary-card"><div class="summary-label">Total value shown</div><div class="summary-value">${safe(formatMoney(total))}</div></div>
      <div class="summary-card"><div class="summary-label">Confirmed value</div><div class="summary-value">${safe(formatMoney(confirmedTotal))}</div></div>
      <div class="summary-card"><div class="summary-label">Records</div><div class="summary-value">${sorted.length}</div></div>
    </section>` : `<header class="continuation"><strong>${safe(company?.name ?? 'Risip')} — Receipt register</strong><span>Page ${index + 1} of ${pages.length}</span></header>`}
    <div class="receipt-grid">${page.join('')}</div>
    <footer>Receipt date is the date printed on the source receipt. Recorded is when the receipt entered Risip.</footer>
  </section>`).join('');

  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8" /><title>Receipt Register - ${safe(company?.name ?? 'Risip')}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font: 10px/1.35 Arial, Helvetica, sans-serif; background: white; }
  .print-page { min-height: 273mm; page-break-after: always; break-after: page; }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 12px; border-bottom: 2px solid #172033; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 34px; height: 34px; object-fit: contain; border-radius: 50%; }
  .company { margin: 0; font-size: 17px; letter-spacing: -.2px; }
  .title { margin: 3px 0 0; color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: 1.1px; }
  .meta { color: #667085; text-align: right; font-size: 9px; }
  .meta strong { display: block; color: #172033; font-size: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
  .summary-card { border: 1px solid #d9e0ea; border-radius: 6px; padding: 8px 10px; }
  .summary-label { color: #667085; font-size: 8px; text-transform: uppercase; letter-spacing: .7px; }
  .summary-value { margin-top: 2px; font-size: 14px; font-weight: 700; }
  .continuation { display: flex; justify-content: space-between; margin-bottom: 8mm; padding-bottom: 3mm; border-bottom: 1px solid #d9e0ea; color: #475467; }
  .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 7mm; }
  .receipt-card { min-height: 112mm; border: 1px solid #d9e0ea; border-radius: 6px; padding: 4mm; break-inside: avoid; page-break-inside: avoid; }
  .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3mm; }
  .receipt-number { color: #667085; font-size: 9px; font-weight: 700; }
  .card-main { display: grid; grid-template-columns: 36mm 1fr; gap: 3.5mm; }
  .image-wrap { width: 36mm; height: 84mm; overflow: hidden; border-radius: 3px; background: #f2f4f7; }
  .receipt-thumb { display: block; width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .receipt-placeholder { display: flex; align-items: center; justify-content: center; padding: 8px; color: #98a2b3; font-size: 8px; text-align: center; }
  h2 { margin: 0 0 2mm; font-size: 11px; line-height: 1.2; overflow-wrap: anywhere; }
  .amount { margin-bottom: 3mm; font-family: Georgia, serif; font-size: 14px; font-weight: 700; white-space: nowrap; }
  dl { margin: 0; }
  dl div { display: grid; grid-template-columns: 42% 58%; gap: 2px; padding: 1.25mm 0; border-top: 1px solid #edf0f4; }
  dt { color: #667085; font-size: 7.5px; text-transform: uppercase; letter-spacing: .3px; }
  dd { margin: 0; font-size: 8px; font-weight: 600; overflow-wrap: anywhere; text-align: right; }
  .status { display: inline-block; border-radius: 10px; padding: 3px 6px; font-size: 8px; font-weight: 700; white-space: nowrap; }
  .status-confirmed { color: #087443; background: #e7f6ee; }
  .status-other { color: #8a4b08; background: #fff3df; }
  footer { margin-top: 5mm; color: #667085; font-size: 7.5px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${pageMarkup}</body></html>`);
  printWindow.document.close();

  const images = Array.from(printWindow.document.images);
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    let finished = false;
    let timeout = 0;
    const done = () => {
      if (finished) return;
      finished = true;
      printWindow.clearTimeout(timeout);
      resolve();
    };
    timeout = printWindow.setTimeout(done, 8_000);
    if (image.complete) done();
    else {
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    }
  })));
  printWindow.focus();
  printWindow.print();
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
      await printDocument(printWindow, receipts, company, projects, Object.fromEntries(entries));
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
