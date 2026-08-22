export function normalizeWhatsAppNumber(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (/^0[67]\d{8}$/.test(digits)) digits = `255${digits.slice(1)}`;
  else if (/^[67]\d{8}$/.test(digits)) digits = `255${digits}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}
