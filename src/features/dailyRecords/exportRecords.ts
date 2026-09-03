import type { DailyRecordKind, DailyRecordStatus } from '@/types/db';
import type { DailyRecordWithDetails } from './dailyRecords';

// The shop's records, as a spreadsheet.
//
// CSV, not a real .xlsx: Excel, Google Sheets and LibreOffice all open a CSV
// straight, it is one small dependency-free function to build, and a
// shopkeeper who wants their numbers wants them portable, not locked in one
// program's format.
//
// NOTHING IS COMPUTED HERE. Every value is a field already on the record,
// which a signed confirmation put there. An export that does its own
// arithmetic is an export that can disagree with the books it copies.

export type ExportLabels = {
  headers: { date: string; kind: string; party: string; description: string; amount: string; payment: string; status: string };
  kind: Record<DailyRecordKind, string>;
  status: Record<DailyRecordStatus, string>;
  payment: Record<string, string>;
};

/**
 * One CSV field, escaped.
 *
 * A product name with a comma, a customer note with a quote, a description that
 * ran onto a second line: each of these breaks a naive join, and each is normal
 * in a real shop. Quote-wrap anything with a comma, a quote or a newline, and
 * double the quotes inside, which is the rule every spreadsheet reads back.
 */
function field(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The day a record happened, as YYYY-MM-DD in East Africa time. */
function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Dar_es_Salaam',
  }).format(d);
}

export function recordsToCsv(records: DailyRecordWithDetails[], labels: ExportLabels): string {
  const h = labels.headers;
  const header = [h.date, h.kind, h.party, h.description, h.amount, h.payment, h.status];

  // Oldest first, the way a ledger is read and the way a shopkeeper expects to
  // scroll it. The screen shows newest first; a statement does not.
  const ordered = [...records].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const rows = ordered.map((r) => [
    day(r.occurred_at),
    labels.kind[r.kind] ?? r.kind,
    r.party_name ?? '',
    r.description ?? '',
    // A plain number, no "TSh" and no thousands separator, so the cell stays a
    // number Excel can sum rather than text it cannot.
    String(r.amount),
    r.payment_method ? (labels.payment[r.payment_method] ?? r.payment_method) : '',
    labels.status[r.status] ?? r.status,
  ].map(field).join(','));

  // A BOM so Excel on Windows reads the Swahili characters as UTF-8 instead of
  // mangling them. Without it, "ng'ombe" and "Zimechukuliwa" come out wrong.
  return '﻿' + [header.map(field).join(','), ...rows].join('\r\n');
}

/** Hand the CSV to the browser as a file. Frontend-only; the data is already loaded. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** risip-rekodi-2026-09-03.csv — dated so a folder of them sorts and never collides. */
export function exportFilename(prefix = 'risip-rekodi'): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date());
  return `${prefix}-${today}.csv`;
}
