import { useState } from 'react';
import { Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { scanReceiptToDataUrl } from '@/lib/documentScan';
import { formatDateTime } from '@/lib/format';
import type { Company, Project, Receipt } from '@/types/db';

type Props = {
  receipts: Receipt[];
  company: Company | null;
  projects: Project[];
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

// Progress screen shown inside the print window while every receipt is scanned.
function progressMarkup(total: number): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Preparing receipts…</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font: 14px/1.5 -apple-system, Segoe UI, Arial, sans-serif; color: #172033; background: #f8fafc; }
  .box { width: min(420px, 88vw); text-align: center; }
  .spinner { width: 40px; height: 40px; margin: 0 auto 18px; border: 4px solid #e2e8f0;
    border-top-color: #DD2D4A; border-radius: 50%; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { font-size: 16px; margin: 0 0 6px; }
  p { margin: 0 0 16px; color: #475569; }
  .track { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
  .fill { height: 100%; width: 0%; background: #DD2D4A; border-radius: 999px; transition: width .25s ease; }
  #count { margin-top: 10px; font-size: 12px; color: #64748b; }
</style></head><body>
  <div class="box">
    <div class="spinner"></div>
    <h1>Scanning receipts…</h1>
    <p>Cleaning and straightening each receipt for a print-ready page.</p>
    <div class="track"><div class="fill" id="fill"></div></div>
    <div id="count">0 / ${total}</div>
  </div>
</body></html>`;
}

function setProgress(win: Window, done: number, total: number): void {
  const pct = total ? Math.round((done / total) * 100) : 100;
  const fill = win.document.getElementById('fill');
  const count = win.document.getElementById('count');
  if (fill) (fill as HTMLElement).style.width = `${pct}%`;
  if (count) count.textContent = `${done} / ${total}`;
}

function buildPrintDocument(
  sorted: Receipt[],
  company: Company | null,
  scans: Map<string, string | null>,
): string {
  const generatedAt = formatDateTime(new Date().toISOString());
  const cells = sorted.map((receipt, index) => {
    const src = scans.get(receipt.id);
    const inner = src
      ? `<img class="scan" src="${escapeHtml(src)}" alt="Receipt ${index + 1}" />`
      : '<div class="scan missing">Image unavailable</div>';
    return `<figure class="cell"><span class="idx">#${index + 1}</span>${inner}</figure>`;
  });

  const pages: string[][] = [];
  for (let i = 0; i < cells.length; i += 2) pages.push(cells.slice(i, i + 2));

  const header = `<header class="doc-head">
    <div class="brand">${company?.logo_url ? `<img class="logo" src="${escapeHtml(company.logo_url)}" alt="" />` : ''}
      <div><div class="co">${safe(company?.name ?? 'Risip')}</div><div class="sub">Receipt register</div></div></div>
    <div class="meta"><strong>${sorted.length} receipt${sorted.length === 1 ? '' : 's'}</strong>Generated ${safe(generatedAt)}</div>
  </header>`;

  const pageMarkup = pages
    .map(
      (page, index) => `<section class="page">
      ${index === 0 ? header : ''}
      <div class="grid">${page.join('')}</div>
      <footer class="pf">${safe(company?.name ?? 'Risip')} — Receipt register · Page ${index + 1} of ${pages.length}</footer>
    </section>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt Register - ${safe(company?.name ?? 'Risip')}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font: 13px/1.45 Arial, Helvetica, sans-serif; background: #f1f5f9; }

  /* ── SCREEN (phone / preview): one receipt per row, full width, readable ── */
  .wrap { max-width: 820px; margin: 0 auto; padding: 14px; }
  .doc-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between;
    gap: 12px; padding-bottom: 8px; margin-bottom: 14px; border-bottom: 2px solid #172033; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 30px; height: 30px; object-fit: contain; border-radius: 50%; }
  .co { font-size: 17px; font-weight: 700; letter-spacing: -.2px; }
  .sub { margin-top: 2px; color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: 1.1px; }
  .meta { color: #667085; font-size: 11px; }
  .meta strong { display: block; color: #172033; font-size: 13px; }
  .grid { display: flex; flex-direction: column; gap: 14px; }
  .cell { position: relative; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
  .scan { display: block; width: 100%; height: auto; }
  .idx { position: absolute; top: 8px; left: 8px; color: #9ca3af; font-size: 11px; font-weight: 700; }
  .missing { display: flex; align-items: center; justify-content: center; min-height: 120px; color: #9ca3af; font-size: 12px; }
  .pf { display: none; }

  /* ── PRINT: exact A4, two receipts SIDE BY SIDE per sheet ── */
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .wrap { max-width: none; margin: 0; padding: 0; }
    .doc-head { margin-bottom: 4mm; padding-bottom: 6px; }
    .co { font-size: 15px; }
    /* One sheet per .page. Two receipts side by side, each filling the sheet
       height, so tall receipts print large. The grid height is fixed a little
       under the A4 printable area so a receipt never splits across sheets. */
    .page { page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .grid { flex-direction: row; gap: 6mm; height: 250mm; }
    .page:first-child .grid { height: 232mm; }
    .cell { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: center; justify-content: center;
      border: 1px solid #e5e7eb; border-radius: 4px; padding: 0; overflow: hidden;
      break-inside: avoid; page-break-inside: avoid; }
    .scan { width: auto; max-width: 100%; max-height: 100%; object-fit: contain; }
    .idx { top: 2mm; left: 2mm; font-size: 9px; }
    .pf { display: block; margin-top: 3mm; text-align: center; color: #9ca3af; font-size: 8px; }
  }
</style></head><body><div class="wrap">${pageMarkup}</div></body></html>`;
}

export default function ReceiptPrintButton({ receipts, company, projects: _projects }: Props) {
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
    printWindow.document.write(progressMarkup(receipts.length));
    printWindow.document.close();

    try {
      const sorted = [...receipts].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const scans = new Map<string, string | null>();
      setProgress(printWindow, 0, sorted.length);

      // Sequential so the progress bar advances smoothly and memory stays flat.
      for (let i = 0; i < sorted.length; i++) {
        if (printWindow.closed) return; // user bailed
        const receipt = sorted[i];
        if (!receipt.image_url) {
          scans.set(receipt.id, null);
        } else {
          try {
            const signed = await receiptImageUrl(receipt.image_url, 60 * 60);
            scans.set(receipt.id, await scanReceiptToDataUrl(signed));
          } catch {
            scans.set(receipt.id, null);
          }
        }
        setProgress(printWindow, i + 1, sorted.length);
      }

      if (printWindow.closed) return;
      printWindow.document.open();
      printWindow.document.write(buildPrintDocument(sorted, company, scans));
      printWindow.document.close();

      // Wait for the (already-decoded) data-URL images to attach, then print.
      const images = Array.from(printWindow.document.images);
      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) return resolve();
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
      );
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      if (!printWindow.closed) printWindow.close();
      window.alert(error instanceof Error ? error.message : 'Could not prepare the receipts for printing.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Button variant="secondary" tint="admin" disabled={receipts.length === 0 || printing} onClick={() => void handlePrint()}>
      <Printer className="h-4 w-4" />
      {printing ? 'Scanning…' : `Print all (${receipts.length})`}
    </Button>
  );
}
