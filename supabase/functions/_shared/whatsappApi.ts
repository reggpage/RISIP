// Thin wrapper over the WhatsApp Cloud API. Network-only; all decision logic that
// deserves tests lives in ./whatsapp.ts instead.

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
 * Send a plain text message. Only valid inside the 24-hour customer service
 * window — every reply we send is a direct answer to the user's own message, so
 * this MVP never needs a paid template.
 */
export async function sendWhatsAppText(toE164: string, body: string): Promise<void> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not set');

  const res = await fetch(`${apiBase()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      // Cloud API accepts E.164 without the leading '+'.
      to: toE164.replace(/^\+/, ''),
      type: 'text',
      text: { preview_url: true, body },
    }),
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
      headers: {
        authorization: `Bearer ${accessToken()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
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
