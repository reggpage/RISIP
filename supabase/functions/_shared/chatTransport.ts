import { AsyncLocalStorage } from 'node:async_hooks';

export type ChatTurn = {
  db: any; identityId: string; companyId: string; messageId: string; phone: string;
  day: string; ordinal: number; tools: string[];
};
export type ChatTransport = {
  web?: { identityId: string; companyId: string; phone: string; messageId: string; text: string };
  emit?: (event: string, value: unknown) => void;
  turn?: ChatTurn;
  auditText?: string | null;
};
// Request-local, never a module-level current sink: isolates handle overlapping users.
export const chatTransport = new AsyncLocalStorage<ChatTransport>();
export const isWebChat = () => Boolean(chatTransport.getStore()?.web);
export function chatDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export async function beginChatTurn(db: any, identity: { id: string; company_id: string; profile_id: string }, messageId: string, phone: string, text: string) {
  const store = chatTransport.getStore();
  if (!store) return;
  const { data: pending, error } = await db.from('whatsapp_conversations').select('chat_day, company_id, expires_at').eq('identity_id', identity.id).maybeSingle();
  if (error) throw error;
  const day = pending?.company_id === identity.company_id && pending.expires_at > new Date().toISOString() ? pending.chat_day : chatDay();
  store.turn = { db, identityId: identity.id, companyId: identity.company_id, messageId, phone, day, ordinal: 0, tools: [] };
  const { error: scopeError } = await db.from('whatsapp_messages').update({ company_id: identity.company_id, profile_id: identity.profile_id, chat_identity_id: identity.id }).eq('wa_message_id', messageId);
  if (scopeError) throw scopeError;
  await appendChatMessage('user', text);
}
export async function appendChatMessage(role: 'user' | 'assistant', content: string) {
  const store = chatTransport.getStore();
  const turn = store?.turn;
  if (!turn) return;
  let awaiting: string | null = null;
  if (role === 'assistant') {
    const { data, error } = await turn.db.from('whatsapp_conversations').select('awaiting, options, expires_at').eq('identity_id', turn.identityId).eq('company_id', turn.companyId).maybeSingle();
    if (error) throw error;
    if (data?.expires_at > new Date().toISOString()) awaiting = String(data.options?.kind ?? data.awaiting);
  }
  const sensitive = /^\s*LINK\b/i.test(content) || /\/wa-login\?[^\s]*token=/i.test(content);
  const safeContent = content.replace(/^(\s*LINK)\s+.+/i, '$1 [redacted]').replace(/(\/wa-login\?[^\s]*token=)[^\s&]+/gi, '$1[redacted]');
  const row = { identity_id: turn.identityId, company_id: turn.companyId, wa_message_id: turn.messageId,
    ordinal: turn.ordinal++, role, content: safeContent.replace(/\u2014/g, ','), chat_day: turn.day, tools: turn.tools, awaiting, sensitive };
  const { data, error } = await turn.db.from('chat_messages').insert(row).select().single();
  if (error) throw error;
  store?.emit?.('message', sensitive ? { ...data, content: content.replace(/\u2014/g, ',') } : data);
}
export function recordChatTool(name: string) {
  const store = chatTransport.getStore();
  if (store?.turn && !store.turn.tools.includes(name)) store.turn.tools.push(name);
  store?.emit?.('tool', { name });
}
