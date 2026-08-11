// Pure, dependency-free helpers for the WhatsApp Cloud API integration.
//
// Everything here is deliberately free of Deno globals and network calls so the
// same code runs in the edge functions and under vitest. Uses Web Crypto, which
// is global in both Deno and Node 18+.

export const WHATSAPP_LINK_KEYWORD = 'LINK';

/** Media we accept as a receipt image, mirroring extract-receipt's own list. */
export const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Cloud API caps images at 5MB; stay under it so we fail fast and clearly. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(digest);
}

/**
 * Length-independent, constant-time comparison of two hex strings. Returns false
 * for length mismatches without leaking where the difference is.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the RAW request body,
 * keyed by the app secret). The body must be the exact bytes Meta sent — parsing
 * and re-serialising the JSON first will not verify.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(provided)) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return timingSafeEqualHex(toHex(mac), provided);
}

/**
 * Normalise a WhatsApp `wa_id` (digits, no plus) or a typed number into E.164.
 * Tanzanian local forms (0xxxxxxxxx / 255xxxxxxxxx) are handled explicitly; other
 * international numbers are accepted when already in a plausible E.164 shape.
 */
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (!digits) return null;

  // 0754123456 -> 255754123456 (national trunk prefix for Tanzania)
  if (digits.length === 10 && digits.startsWith('0')) digits = `255${digits.slice(1)}`;
  // 754123456 -> 255754123456
  else if (digits.length === 9 && !digits.startsWith('0')) digits = `255${digits}`;

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Show only the last 3 digits, e.g. +255754123456 -> +255*******456. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const trimmed = String(e164);
  if (trimmed.length <= 7) return '***';
  const cc = trimmed.slice(0, 4);
  const tail = trimmed.slice(-3);
  return `${cc}${'*'.repeat(Math.max(0, trimmed.length - 7))}${tail}`;
}

/**
 * Extract a linking token from a text message. Accepts "LINK abc123" in any case
 * with flexible whitespace. Returns null when the message is not a link attempt.
 */
export function parseLinkToken(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = String(text).trim().match(/^link[\s:]+([A-Za-z0-9_-]{16,128})$/i);
  return match ? match[1] : null;
}

export type LinkTokenRow = {
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
} | null;

export type LinkTokenVerdict =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'revoked' | 'used' | 'expired' };

/**
 * Decide whether a linking token may be redeemed. Single-use and short-lived: a
 * token that was already used, superseded by a newer one, or is past its expiry
 * is refused, which is what stops a leaked or replayed code from binding a number.
 */
export function evaluateLinkToken(row: LinkTokenRow, now: Date = new Date()): LinkTokenVerdict {
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.used_at) return { ok: false, reason: 'used' };
  const expiry = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true };
}

const LINK_FAILURE_MESSAGES: Record<'unknown' | 'revoked' | 'used' | 'expired', string> = {
  unknown: 'That link code is not valid. Generate a new one in Risip → Settings → WhatsApp.',
  revoked: 'That link code was replaced by a newer one. Use the latest code from Risip.',
  used: 'That link code has already been used. Generate a new one in Risip.',
  expired: 'That link code has expired. Generate a new one in Risip → Settings → WhatsApp.',
};

export function linkFailureMessage(reason: 'unknown' | 'revoked' | 'used' | 'expired'): string {
  return LINK_FAILURE_MESSAGES[reason];
}

export type MediaCheck = { ok: true; mediaType: string } | { ok: false; reason: string };

export function validateMedia(mimeType: string | null | undefined, sizeBytes?: number | null): MediaCheck {
  const normalized = String(mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (!(SUPPORTED_MEDIA_TYPES as readonly string[]).includes(normalized)) {
    return { ok: false, reason: 'unsupported_type' };
  }
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_MEDIA_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true, mediaType: normalized };
}

function formatTzs(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  return `TZS ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * The single confirmation message. One message, never a thread of them — every
 * template outside the 24h service window is billable.
 */
export function buildReceiptReply(input: {
  vendor?: string | null;
  total?: number | null;
  reviewUrl: string;
}): string {
  const lines = ['Receipt received.', ''];
  if (input.vendor) lines.push(`Merchant: ${input.vendor}`);
  const total = formatTzs(input.total);
  if (total) lines.push(`Amount: ${total}`);
  if (input.vendor || total) lines.push('');
  lines.push('It needs your confirmation before it counts as a project expense.');
  lines.push('');
  lines.push(`Review and complete it here:\n${input.reviewUrl}`);
  return lines.join('\n');
}

export function buildFailureReply(reviewUrl: string, reason?: string): string {
  const detail =
    reason === 'unsupported_type'
      ? 'That file type is not supported. Send the receipt as a photo (JPEG, PNG or WebP).'
      : reason === 'too_large'
        ? 'That image is too large. Send a smaller photo (under 5MB).'
        : 'I could not read that receipt automatically.';
  return `${detail}\n\nYou can upload and review it here:\n${reviewUrl}`;
}

export function buildUnlinkedReply(): string {
  return [
    'This number is not connected to a Risip account.',
    '',
    'Open Risip on the web, go to Settings → WhatsApp, and tap "Connect WhatsApp" to get your one-time link.',
  ].join('\n');
}

/** Deep link into the existing authenticated receipt view. No public bypass token. */
export function buildReviewUrl(appUrl: string, receiptId?: string | null): string {
  const base = String(appUrl || '').replace(/\/+$/, '');
  return receiptId ? `${base}/receipts?receipt=${receiptId}` : `${base}/receipts`;
}
