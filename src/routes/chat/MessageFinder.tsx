import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { sw } from '@/i18n/sw';
import type { ChatMessage } from '@/features/chat/chat';

/**
 * The rail down the right edge: one tick per message, and a preview of the
 * message the pointer is on.
 *
 * Pointer events, not mouse events. A phone has no hover, so onMouseEnter left
 * the preview unreachable on the device most of these shops use: dragging a
 * finger down the rail did nothing at all. One pointer handler on the rail
 * covers a mouse moving across it and a finger sliding down it, and hit-tests
 * the tick under the cursor rather than relying on the pointer entering each
 * button, which touch never does.
 *
 * Tapping still jumps, through the buttons' own click, so a tap is not
 * handled twice.
 */
export default function MessageFinder({ messages, jump }: { messages: ChatMessage[]; jump: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const ticksRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const preview = hover === null ? null : messages[hover];
  const amount = preview?.content.match(/TSh\s+[\d,]+(?:\.\d+)?/g)?.at(-1);

  /** Which tick sits under this screen Y, clamped to the ends of the rail. */
  function indexAt(clientY: number): number | null {
    const rail = ticksRef.current;
    if (!rail) return null;
    const ticks = Array.from(rail.children) as HTMLElement[];
    if (ticks.length === 0) return null;
    for (let index = 0; index < ticks.length; index += 1) {
      const box = ticks[index].getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) return index;
    }
    return clientY < ticks[0].getBoundingClientRect().top ? 0 : ticks.length - 1;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    dragging.current = true;
    // Capture so the preview keeps following a finger that strays sideways off
    // the narrow rail, which is most of them.
    event.currentTarget.setPointerCapture(event.pointerId);
    setHover(indexAt(event.clientY));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' && !dragging.current) return;
    setHover(indexAt(event.clientY));
  }

  function endDrag() {
    dragging.current = false;
    setHover(null);
  }

  return <nav
    className="chat-finder"
    aria-label={sw.chat.minimap}
    onMouseLeave={() => setHover(null)}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(null); }}
    onKeyDown={(e) => { if (e.key === 'Escape') setHover(null); }}
  >
    <div
      className="chat-finder-ticks"
      ref={ticksRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {messages.map((message, index) => <button key={message.id}
        style={{ '--proximity': hover === null ? 0 : Math.max(0, 1 - Math.abs(index - hover) / 4) } as CSSProperties}
        className={`${message.role}${hover === index ? ' is-active' : ''}`}
        aria-label={`${sw.chat.jump} ${index + 1}: ${message.content.slice(0, 65)}`}
        onFocus={() => setHover(index)} onClick={() => jump(message.id)}><i /></button>)}
    </div>
    {preview && <aside key={preview.id} className="chat-finder-card" style={{ top: `${Math.max(12, Math.min(75, (hover! + .5) / messages.length * 100))}%` }} aria-hidden="true">
      <header><strong>{preview.role === 'user' ? sw.chat.you : sw.chat.assistant}</strong><time>{new Date(preview.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' })}</time></header>
      <p>{preview.content.replace(/\*/g, '').slice(0, 240)}</p>{amount && <span className="chat-finder-amount">{amount}</span>}
    </aside>}
  </nav>;
}
