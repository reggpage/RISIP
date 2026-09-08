import { useState, type CSSProperties } from 'react';
import { sw } from '@/i18n/sw';
import type { ChatMessage } from '@/features/chat/chat';

export default function MessageFinder({ messages, jump }: { messages: ChatMessage[]; jump: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const preview = hover === null ? null : messages[hover];
  const amount = preview?.content.match(/TSh\s+[\d,]+(?:\.\d+)?/g)?.at(-1);
  return <nav className="chat-finder" aria-label={sw.chat.minimap} onMouseLeave={() => setHover(null)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(null); }} onKeyDown={(e) => { if (e.key === 'Escape') setHover(null); }}>
    <div className="chat-finder-ticks">{messages.map((message, index) => <button key={message.id}
      style={{ '--proximity': hover === null ? 0 : Math.max(0, 1 - Math.abs(index - hover) / 4) } as CSSProperties}
      className={`${message.role}${hover === index ? ' is-active' : ''}`}
      aria-label={`${sw.chat.jump} ${index + 1}: ${message.content.slice(0, 65)}`}
      onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onClick={() => jump(message.id)}><i /></button>)}</div>
    {preview && <aside key={preview.id} className="chat-finder-card" style={{ top: `${Math.max(12, Math.min(75, (hover! + .5) / messages.length * 100))}%` }} aria-hidden="true">
      <header><strong>{preview.role === 'user' ? sw.chat.you : sw.chat.assistant}</strong><time>{new Date(preview.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' })}</time></header>
      <p>{preview.content.replace(/\*/g, '').slice(0, 240)}</p>{amount && <span className="chat-finder-amount">{amount}</span>}
    </aside>}
  </nav>;
}
