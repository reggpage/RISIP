import { supabase } from '@/lib/supabase';
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; chat_day: string; created_at: string; awaiting: string | null; tools: string[]; wa_message_id: string };
export type Membership = { company_id: string; company_name: string; is_active: boolean };
export type Pending = { day: string; awaiting: string; message_id: string } | null;
export type Outbox = { id: string; text: string; companyId: string };
export type ChatEvent = { event: string; data: any };
export function businessDay(offset = 0, now = new Date()): string {
  const shifted = new Date(now.getTime() + 3 * 3600000);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}
export function saleSentence(template: string, product: string, quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('invalid_quantity');
  return template.replace('{product}', product).replace('{quantity}', String(quantity));
}
export function confirmationRows(content: string): Array<[string, string]> {
  return content.split('\n').flatMap((line) => {
    const clean = line.replace(/\*/g, '').trim().replace(/^[-•]\s*/, '');
    const colon = clean.indexOf(':');
    return colon > 0 && /\d/.test(clean.slice(colon + 1)) ? [[clean.slice(0, colon), clean.slice(colon + 1).trim()] as [string, string]] : [];
  });
}
export function isConfirmation(kind: string | null): boolean {
  return Boolean(kind && /confirmation|_confirm$|price_batch|stock_intake|stock_count/.test(kind));
}
export function parseSse(frame: string): ChatEvent | null {
  const event = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
  const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
  return event && data ? { event, data: JSON.parse(data) } : null;
}
export async function sendChat(input: Outbox, receive: (event: ChatEvent) => void) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('unauthorized');
  const endpoint = import.meta.env.DEV && import.meta.env.VITE_CHAT_TEST_ENDPOINT
    ? import.meta.env.VITE_CHAT_TEST_ENDPOINT
    : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/chat`;
  const response = await fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (response.status === 202) throw new Error('pending');
  if (!response.ok) throw new Error('send_failed');
  if (response.headers.get('content-type')?.includes('application/json')) {
    const data = await response.json();
    for (const message of data.messages ?? []) receive({ event: 'message', data: message });
    receive({ event: 'done', data: { status: data.status } });
    return;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing_stream');
  const decoder = new TextDecoder();
  let buffer = '', done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const parsed = parseSse(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
        if (!parsed) continue;
        if (parsed.event === 'error') throw new Error('processing_failed');
        if (parsed.event === 'done') done = true;
        receive(parsed);
      }
    }
    if (!done) throw new Error('interrupted_stream');
  } finally { reader.releaseLock(); }
}
