import type { Receipt } from '@/types/db';

// Dashboard periods follow the day the receipt entered Risip, not the date
// printed on the paper receipt. Date methods intentionally use the browser's
// local timezone so a receipt is grouped according to the user's local day.
export function receiptActivityDate(receipt: Pick<Receipt, 'created_at'>): Date | null {
  if (!receipt.created_at) return null;
  const date = new Date(receipt.created_at);
  return Number.isNaN(date.getTime()) ? null : date;
}
