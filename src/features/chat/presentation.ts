import type { ChatMessage } from './chat';

export type ReplyChoice = { label: string; value: string; detail?: string; cancel?: boolean };
export function lineCalculation(value: string): { calculation: string; total: string } | null {
  const match = /^(\d[\d,.]*\s*[×x]\s*TSh\s+[\d,.]+)\s*=\s*(TSh\s+[\d,.]+)$/.exec(value);
  return match ? { calculation: match[1], total: match[2] } : null;
}

/** Only turn choices actually offered by the current pending question into text replies. */
export function replyChoices(content: string, awaiting: string | null): ReplyChoice[] {
  if (!awaiting || /delete|logout|void/.test(awaiting)) return [];
  const clean = content.replace(/\*/g, '');
  const choices: ReplyChoice[] = [];
  const instruction = clean.match(/(?:Chagua|Choose|Unataka|Do you want)[\s\S]*$/i)?.[0];
  if (instruction && /\(a\)/i.test(instruction)) {
    for (const match of instruction.matchAll(/\(([a-z])\)\s*([^·\n,;?.(]+)/gi)) {
      const label = match[2].replace(/\s+(?:au|or|and)\s*$/i, '').trim();
      if (label.length > 60) continue;
      const detail = clean.split('\n').find((line) => new RegExp(`^[•\\-]?\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+TSh`, 'i').test(line.trim()))?.replace(/^[•\-]\s*/, '').replace(new RegExp(`^${label}\\s+`, 'i'), '');
      choices.push({ label, value: label, detail, cancel: /^(GHAIRI|CANCEL)$/i.test(label) });
    }
  }
  if (!choices.length && /choice|business|language|project|help_menu|category/.test(awaiting)) {
    for (const match of clean.matchAll(/^\s*(\d{1,2})[.)]\s+(.+)$/gm)) {
      if (match[2].length <= 100) choices.push({ label: match[2].trim(), value: match[1] });
    }
  }
  if (!choices.length && /(?:andika|write|type|jibu|reply)[^\n.]*\b(?:RUKA|SKIP)\b/i.test(clean)) {
    const value = /\bRUKA\b/.test(clean) ? 'RUKA' : 'SKIP';
    choices.push({ label: value, value });
  }
  if (!choices.length && /(?:Jibu|Reply)[^\n]*\b(?:NDIYO|YES|Ndiyo|Yes)\b/.test(clean) && /\b(?:HAPANA|NO|Hapana|No)\b/.test(clean)) {
    choices.push({ label: 'NDIYO', value: 'NDIYO' }, { label: 'HAPANA', value: 'HAPANA' });
  }
  if (choices.length && !choices.some((choice) => choice.cancel) && /\b(?:GHAIRI|CANCEL)\b/.test(clean)) {
    choices.push({ label: 'GHAIRI', value: 'GHAIRI', cancel: true });
  }
  return choices.slice(0, 12);
}

export function reconcileMessage(messages: ChatMessage[], incoming: ChatMessage, outgoingId: string): ChatMessage[] {
  return [...messages.filter((message) => message.id !== incoming.id && message.id !== `local:${outgoingId}` && message.chat_day === incoming.chat_day), incoming];
}

export function responseSeconds(message: ChatMessage, messages: ChatMessage[]): number | null {
  if (message.role !== 'assistant') return null;
  const first = messages.find((item) => item.role === 'assistant' && item.wa_message_id === message.wa_message_id);
  const input = messages.find((item) => item.role === 'user' && item.wa_message_id === message.wa_message_id);
  if (first?.id !== message.id || !input) return null;
  return Math.max(0.1, (Date.parse(message.created_at) - Date.parse(input.created_at)) / 1000);
}

export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
