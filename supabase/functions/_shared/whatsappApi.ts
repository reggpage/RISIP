// Thin wrapper over the WhatsApp Cloud API. Network-only; all decision logic that
// deserves tests lives in ./whatsapp.ts instead.

import { typingIndicatorPayload } from './whatsappApiPayloads.ts';
import { toWhatsAppText } from './whatsappMarkdown.ts';
import { whatsappTextPayload } from './whatsappTextPayload.ts';

const DEFAULT_API_VERSION = 'v21.0';

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
export async function sendWhatsAppText(
  toE164: string,
  body: string,
  options: { replyToMessageId?: string | null } = {},
): Promise<void> {
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

/**
 * Mark the incoming message read and show the "typing…" bubble while we work.
 * This is a status update, not a message, so it costs nothing and does not count
 * against the one-reply budget. Best effort: never let it break processing.
 */
export async function showTyping(messageId: string): Promise<void> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) return;
  try {
    await fetch(`${apiBase()}/${phoneNumberId}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(3_000),
      headers: {
        authorization: `Bearer ${accessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(typingIndicatorPayload(messageId)),
    });
  } catch {
    // Cosmetic only.
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
