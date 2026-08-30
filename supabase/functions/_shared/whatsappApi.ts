// Thin wrapper over the WhatsApp Cloud API. Network-only; all decision logic that
// deserves tests lives in ./whatsapp.ts instead.

import { typingIndicatorPayload } from './whatsappApiPayloads.ts';
import { toWhatsAppText } from './whatsappMarkdown.ts';
import { whatsappTextPayload } from './whatsappTextPayload.ts';

const DEFAULT_API_VERSION = 'v22.0';

function apiBase(): string {
  const version = Deno.env.get('WHATSAPP_API_VERSION') || DEFAULT_API_VERSION;
  return `https://graph.facebook.com/${version}`;
}

function accessToken(): string {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not set');
  return token;
}

/**
 * The number people write to, in the form a human can dial.
 *
 * The invite the owner forwards has to name it: whoever receives it has never
 * heard of Risip and needs somewhere to send the code. Only the phone_number_id
 * is configured, so the display number is asked of Meta once and kept for the
 * life of the worker — it changes about as often as the business does.
 */
let cachedDisplayNumber: string | null = null;

export async function whatsAppDisplayNumber(): Promise<string | null> {
  const configured = Deno.env.get('WHATSAPP_DISPLAY_NUMBER');
  if (configured) return configured;
  if (cachedDisplayNumber) return cachedDisplayNumber;
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) return null;
  try {
    const response = await fetch(
      `${apiBase()}/${phoneNumberId}?fields=display_phone_number`,
      { headers: { authorization: `Bearer ${accessToken()}` } },
    );
    if (!response.ok) return null;
    const body = await response.json() as { display_phone_number?: string };
    cachedDisplayNumber = body.display_phone_number ?? null;
    return cachedDisplayNumber;
  } catch {
    // An invite is still useful without it; the owner can add the number.
    return null;
  }
}

/**
 * Send a plain text message. Only valid inside the 24-hour customer service
 * window — every reply we send is a direct answer to the user's own message, so
 * this MVP never needs a paid template.
 */
/**
 * Messages whose answer is already on its way out.
 *
 * MEASURED, and it is the whole of the second bug: the last typing pulse for
 * the second message went out at 16:04:36.633 and its reply went out at
 * 16:04:37.047 — four tenths of a second apart. The reply is what dismisses an
 * indicator, so an indicator raised in that gap races its own dismissal, and on
 * the handset it won: "typing…" appeared AFTER the answer and stayed there.
 *
 * Once an answer is being sent, no further indicator may be raised for the
 * message it answers. Keyed by message id rather than a single flag, because
 * two turns can be in flight in one isolate and a global would cross them.
 */
const typingSealed = new Set<string>();

export function clearTypingSeal(messageId: string): void {
  typingSealed.delete(messageId);
}

export async function sendWhatsAppText(
  toE164: string,
  body: string,
  options: { replyToMessageId?: string | null } = {},
): Promise<void> {
  // Sealed BEFORE the request goes out, not after: the race is measured in
  // hundreds of milliseconds and the send itself takes longer than that.
  const answering = options.replyToMessageId?.trim();
  if (answering) typingSealed.add(answering);
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not set');

  const res = await fetch(`${apiBase()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(whatsappTextPayload(toE164, toWhatsAppText(body), options)),
  });
  if (!res.ok) {
    // Never echo the message body or number into logs.
    throw new Error(`whatsapp send failed: ${res.status}`);
  }
}

/** What Meta said. Null status means the call never got an answer at all. */
export type TypingOutcome = {
  status: number | null;
  /** Meta's own error code, which is what tells one refusal from another. */
  code: number | null;
};

/**
 * Mark the incoming message read and show the "typing…" bubble while we work.
 * This is a status update, not a message, so it costs nothing and does not count
 * against the one-reply budget. Best effort: never let it break processing.
 *
 * It RETURNS what happened now. It used to return void and write the status to
 * stderr, where it could not be reached afterwards — which is how four separate
 * fixes were aimed at this without one observation of the request that is
 * supposedly failing. The caller records the outcome; see migration 0153.
 */
export async function showTyping(messageId: string): Promise<TypingOutcome> {
  // The answer is already going out. Raising an indicator now is raising one
  // that arrives beside the reply and outlives it. Recorded as -1 so the audit
  // shows a pulse that was deliberately not sent, which is a different fact
  // from one that failed.
  if (typingSealed.has(messageId)) return { status: -1, code: null };
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) return { status: null, code: null };
  try {
    const res = await fetch(`${apiBase()}/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(3_000),
      headers: {
        authorization: `Bearer ${accessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(typingIndicatorPayload(messageId)),
    });
    if (res.ok) return { status: res.status, code: null };
    // The code is the whole point: "already read" and "expired token" are the
    // same 400 and mean completely different things.
    let code: number | null = null;
    try {
      const failure = await res.json();
      const raw = failure?.error?.code;
      code = typeof raw === 'number' ? raw : null;
    } catch {
      // A non-JSON body tells us nothing beyond the status.
    }
    console.error(`whatsapp typing indicator failed: ${res.status}`);
    return { status: res.status, code };
  } catch {
    // Cosmetic only.
    return { status: null, code: null };
  }
}

export type MediaMeta = { url: string; mimeType: string; fileSize: number | null };

/** Step 1 of media retrieval: resolve a media id to a short-lived download URL. */
export async function getMediaMeta(mediaId: string): Promise<MediaMeta> {
  const res = await fetch(`${apiBase()}/${mediaId}`, {
    headers: { authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok) throw new Error(`media meta failed: ${res.status}`);
  const json = await res.json();
  return {
    url: String(json.url ?? ''),
    mimeType: String(json.mime_type ?? ''),
    fileSize: json.file_size == null ? null : Number(json.file_size),
  };
}

/** Step 2: download the bytes. The URL requires the same bearer token. */
export async function downloadMedia(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken()}` } });
  if (!res.ok) throw new Error(`media download failed: ${res.status}`);
  const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim();
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
}
