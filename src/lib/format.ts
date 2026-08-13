const DEFAULT_CURRENCY = 'TZS';
const CURRENCY_PREFIX: Record<string, string> = { TZS: 'TSh' };

export function formatMoney(amount: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (amount === null || amount === undefined) return '—';
  const prefix = CURRENCY_PREFIX[currency] ?? currency;
  return `${prefix} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// en-GB gives day-first English month abbreviations ("1 Aug 2026"). The sw-TZ
// locale rendered August as "Ago" (Agosti), which read like "ago" and confused users.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatLongDate(value: string | Date | null | undefined, lang: 'en' | 'sw' = 'en'): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Just the clock time ("14:07") — used to show when a receipt was uploaded.
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
