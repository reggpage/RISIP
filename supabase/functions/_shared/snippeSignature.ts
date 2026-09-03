// Proving a payment notification really came from Snippe.
//
// This is the only thing standing between "somebody paid" and "somebody typed
// a URL". Anyone who finds this function's address can POST to it; the
// signature is what separates a real payment from a stranger marking a shop as
// paid for the next twelve months.
//
// Snippe's rule, and it is the one people get wrong: the signature covers
// `{timestamp}.{rawBody}`, and rawBody means THE EXACT BYTES RECEIVED. Parsing
// the JSON and re-serialising it changes key order and whitespace, the HMAC no
// longer matches, and every real payment starts being rejected. Read the body
// as text once, verify, and only then parse.

import { timingSafeEqualHex } from './whatsapp.ts';

/** Snippe retries for 24 minutes; anything older than this is a replay. */
export const SNIPPE_TIMESTAMP_TOLERANCE_SECONDS = 60 * 60;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type SnippeVerification =
  | { ok: true }
  | { ok: false; reason: 'no_secret' | 'no_signature' | 'no_timestamp' | 'stale' | 'mismatch' };

/**
 * @param rawBody   the request body as received, never re-serialised
 * @param signature the X-Webhook-Signature header, 64 hex characters
 * @param timestamp the X-Webhook-Timestamp header, Unix seconds
 * @param nowMs     injectable so the staleness rule can be tested
 */
export async function verifySnippeSignature(
  rawBody: string,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  signingKey: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<SnippeVerification> {
  if (!signingKey) return { ok: false, reason: 'no_secret' };
  if (!signature) return { ok: false, reason: 'no_signature' };
  if (!timestamp) return { ok: false, reason: 'no_timestamp' };

  const provided = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return { ok: false, reason: 'mismatch' };

  // A REPLAY IS A VALID SIGNATURE ON AN OLD MESSAGE. Without this check, anyone
  // who ever captures one genuine "payment.completed" can send it back every
  // month forever and the signature will pass every time.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || sentAt <= 0) return { ok: false, reason: 'no_timestamp' };
  const ageSeconds = Math.abs(nowMs / 1000 - sentAt);
  if (ageSeconds > SNIPPE_TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${sentAt}.${rawBody}`),
  );
  return timingSafeEqualHex(toHex(mac), provided) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export type SnippeEvent = {
  id: string;
  type: string;
  created_at: string | null;
  reference: string | null;
  externalReference: string | null;
  status: string | null;
  amountValue: number | null;
  amountCurrency: string | null;
  netValue: number | null;
};

/**
 * Read only the fields we act on, and bound every one of them.
 *
 * The raw body is kept whole in subscription_events for evidence; this is the
 * part we are willing to make decisions from. Anything unexpected reads as
 * null rather than as a surprise later.
 */
export function readSnippeEvent(body: unknown): SnippeEvent | null {
  const top = (body ?? {}) as Record<string, unknown>;
  const id = String(top.id ?? '').trim().slice(0, 120);
  const type = String(top.type ?? '').trim().slice(0, 60);
  if (!id || !type) return null;

  const data = (top.data ?? {}) as Record<string, unknown>;
  const amount = (data.amount ?? {}) as Record<string, unknown>;
  const settlement = (data.settlement ?? {}) as Record<string, unknown>;
  const net = (settlement.net ?? {}) as Record<string, unknown>;
  const money = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n < 1_000_000_000 ? Math.round(n) : null;
  };

  return {
    id,
    type,
    created_at: typeof top.created_at === 'string' ? top.created_at.slice(0, 40) : null,
    reference: data.reference ? String(data.reference).trim().slice(0, 120) : null,
    externalReference: data.external_reference
      ? String(data.external_reference).trim().slice(0, 120)
      : null,
    status: data.status ? String(data.status).trim().slice(0, 40) : null,
    amountValue: money(amount.value),
    amountCurrency: amount.currency ? String(amount.currency).trim().slice(0, 8) : null,
    netValue: money(net.value),
  };
}
