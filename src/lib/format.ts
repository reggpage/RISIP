const DEFAULT_CURRENCY = 'TZS';
const CURRENCY_PREFIX: Record<string, string> = { TZS: 'TSh' };

export function formatMoney(amount: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (amount === null || amount === undefined) return '—';
  const prefix = CURRENCY_PREFIX[currency] ?? currency;
  return `${prefix} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sw-TZ', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' });
}
