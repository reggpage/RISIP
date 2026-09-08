import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCheck, Clock3, CornerDownLeft, ExternalLink, Pencil, ShieldCheck, X } from 'lucide-react';
import RisipLogo from '@/components/ui/RisipLogo';
import { sw } from '@/i18n/sw';
import { confirmationRows, isConfirmation, type ChatMessage } from '@/features/chat/chat';
import { compactChoiceCopy, hasMixedChoiceInstruction, lineCalculation, replyChoices, safeLink, type ReplyChoice } from '@/features/chat/presentation';

export function toolLabel(name: string, active = false) {
  const c = sw.chat;
  if (/propose|prepare|draft/.test(name)) return active ? c.preparing : c.draft;
  if (/profit|advice|summary/.test(name)) return active ? c.readingProfit : c.profit;
  if (/stock/.test(name)) return active ? c.readingStock : c.stock;
  if (/price|cost/.test(name)) return active ? c.readingPrices : c.prices;
  if (/sale|day_record|breakdown/.test(name)) return active ? c.readingSales : c.sales;
  return active ? c.checking : c.toolGeneric;
}

function inline(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g).map((part, index) => {
    if (/^https?:/.test(part)) {
      if (part.includes('[redacted]')) return <span key={index} className="chat-muted">{sw.chat.linkExpired}</span>;
      const href = safeLink(part);
      return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{new URL(href).hostname}<ExternalLink size={12} aria-label={sw.chat.openLink} /></a> : part;
    }
    if (/^\*/.test(part)) return <strong key={index}>{part.replace(/^\*+|\*+$/g, '')}</strong>;
    if (/^_.*_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function RichText({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => {
    const lines = paragraph.split('\n');
    if (lines.every((line) => /^\s*[-•]\s/.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-•]\s*/, ''))}</li>)}</ul>;
    return <p key={index}>{lines.map((line, i) => <span key={i}>{i > 0 && <br />}{inline(line)}</span>)}</p>;
  })}</>;
}

function choiceLabel(choice: ReplyChoice) {
  const c = sw.chat;
  const labels: Record<string, string> = { REJAREJA: c.retail, RETAIL: c.retail, JUMLA: c.wholesale, WHOLESALE: c.wholesale, GHAIRI: c.cancel, CANCEL: c.cancel, RUKA: c.skip, SKIP: c.skip, NDIYO: c.yes, YES: c.yes, HAPANA: c.no, NO: c.no };
  return labels[choice.label.toUpperCase()] ?? choice.label;
}

type Props = {
  message: ChatMessage; active: boolean; disabled: boolean; animate: boolean; seconds: number | null; plain: boolean;
  send: (text: string) => void; edit: () => void; onRevealed: (id: string) => void; onGrow: () => void;
};

export default memo(function ChatMessageView({ message, active, disabled, animate, seconds, plain, send, edit, onRevealed, onGrow }: Props) {
  const c = sw.chat, assistant = message.role === 'assistant';
  const confirm = assistant && isConfirmation(message.awaiting);
  const rows = assistant ? confirmationRows(message.content) : [];
  const metrics = !plain && !confirm && rows.length >= 2 && rows.length <= 4 && rows.every(([, value]) => /^TSh\s+[\d,.]+$/.test(value));
  const hasTable = confirm && rows.length > 0;
  const choices = !confirm ? replyChoices(message.content, message.awaiting) : [];
  const structuredBody = hasTable || metrics ? message.content.split('\n').filter((line) => confirmationRows(line).length === 0 && !/^(Jibu|Reply)\s+\*?1\b/.test(line)).join('\n').replace(/^\s*(?:Bidhaa|Products):\s*$/gm, '').trim() : message.content;
  const body = compactChoiceCopy(choices.some((choice) => choice.detail) ? structuredBody.split('\n').filter((line) => !/^(?:Chagua|Choose)\s+\(a\)/i.test(line.trim()) && !choices.some((choice) => choice.detail && line.replace(/\*/g, '').includes(choice.detail))).join('\n').trim() : structuredBody, choices);
  const hasMixedChoice = hasMixedChoiceInstruction(message.content, choices);
  const hasPriceChoice = choices.some((choice) => /^(REJAREJA|RETAIL)$/i.test(choice.label)) && choices.some((choice) => /^(JUMLA|WHOLESALE)$/i.test(choice.label));
  const [visible, setVisible] = useState(animate ? 0 : body.length);
  const callbacks = useRef({ onRevealed, onGrow }); callbacks.current = { onRevealed, onGrow };
  useEffect(() => {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(body.length); if (animate) callbacks.current.onRevealed(message.id); return; }
    // Presentation of an already guarded reply, never unverified model tokens.
    const started = performance.now(), duration = Math.min(1800, Math.max(280, body.length * 3));
    let frame = 0, last = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      if (now - last >= 30 || progress === 1) { setVisible(Math.ceil(body.length * progress)); last = now; }
      if (progress < 1) frame = requestAnimationFrame(tick);
      else callbacks.current.onRevealed(message.id);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, body, message.id]);
  useLayoutEffect(() => { callbacks.current.onGrow(); }, [visible]);
  const revealing = visible < body.length;
  const optimistic = message.id.startsWith('local:');
  return <article id={`message-${message.id}`} className={`chat-message ${message.role}${animate || optimistic ? ' chat-new-message' : ''}`} tabIndex={-1}>
    <div className="chat-message-meta">
      {assistant ? <RisipLogo className="chat-reply-logo" /> : <strong>{c.you}</strong>}
      <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' })}</time>
      {assistant && revealing && <span className="chat-writing-label" role="status">{c.writing}</span>}
      {!assistant && <span className="chat-delivery" aria-label={optimistic ? c.sending : c.sent}>{optimistic ? <Clock3 size={12} /> : <CheckCheck size={13} />}</span>}
    </div>
    <div className={confirm ? 'chat-confirmation' : 'chat-message-body'}>
      {confirm && <div className="chat-confirmation-heading"><ShieldCheck size={17} /><span>{c.confirmation}</span></div>}
      <div className={`chat-prose${revealing ? ' chat-revealing' : ''}`} aria-busy={revealing}>
        <RichText text={body.slice(0, visible)} />{revealing && <i className="chat-type-cursor" aria-hidden="true" />}
      </div>
      {(hasTable || metrics) && <div className={`chat-structured${revealing ? ' chat-structured-wait' : ''}`} aria-hidden={revealing}>
        {metrics ? <dl className="chat-metrics">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          : <table><caption className="sr-only">{c.confirmation}</caption><thead><tr><th>{c.detail}</th><th>{c.amount}</th></tr></thead><tbody>{rows.map(([label, value], i) => { const line = lineCalculation(value); return <tr className={/jumla|total/i.test(label) ? 'chat-total' : ''} key={i}><td>{label}{line && <small className="chat-line-calculation">{line.calculation}</small>}</td><td>{line?.total ?? value}</td></tr>; })}</tbody></table>}
      </div>}
      {active && confirm && <div className="chat-confirm-footer"><div className="chat-confirm-actions">
        <button className="chat-primary" disabled={disabled || revealing} onClick={() => send('NDIYO')}><Check size={15} />{c.confirm}</button>
        <button disabled={disabled || revealing} onClick={edit}><Pencil size={14} />{c.edit}</button>
        <button disabled={disabled || revealing} onClick={() => send('GHAIRI')}><X size={14} />{c.cancel}</button>
      </div><p>{c.reviewNote}</p></div>}
      {choices.length > 0 && <div className="chat-choice-area"><span>{c.chooseReply}</span><div className="chat-choices">{choices.map((choice) => <button key={choice.value} className={choice.cancel ? 'chat-choice-cancel' : ''} disabled={disabled || revealing || !active} onClick={() => send(choice.value)}><span>{choiceLabel(choice)}{choice.detail && <small>{choice.detail}</small>}</span>{choice.cancel ? <X size={14} /> : <CornerDownLeft size={14} />}</button>)}</div>{hasPriceChoice && <div className="chat-choice-notes"><p>{c.samePriceChoiceNote}</p>{hasMixedChoice && <p>{c.mixedChoiceNote}</p>}</div>}</div>}
    </div>
    {assistant && seconds !== null && !revealing && <div className="chat-response-footer"><span className="chat-answer-time"><Clock3 size={11} />{c.answerTime.replace('{time}', seconds.toFixed(1))}</span></div>}
  </article>;
});
