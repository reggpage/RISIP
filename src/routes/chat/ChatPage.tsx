import { useCallback, useEffect, useRef, useState } from 'react';
import { useFollowBottom } from '@/features/chat/useFollowBottom';
import { ArrowDown, ArrowUp, Bot, ChevronRight, Square } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getLang } from '@/lib/lang';
import { sw } from '@/i18n/sw';
import { businessDay, sendChat, type ChatMessage, type Membership, type Outbox, type Pending } from '@/features/chat/chat';
import { reconcileMessage, responseSeconds } from '@/features/chat/presentation';
import ChatMessageView, { toolLabel } from './ChatMessageView';
import './chat.css';
import './premium.css';

const db = supabase as any;
async function loadDayMessages(company: string, day: string) {
  const messages: ChatMessage[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from('chat_messages').select('*').eq('company_id', company).eq('chat_day', day)
      .order('created_at').order('id').range(start, start + 999);
    if (error) return { data: null, error };
    messages.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: messages, error: null };
  }
}
function Working({ started, label }: { started: number; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 100); return () => clearInterval(timer); }, [started]);
  return <div className="chat-working" role="status"><span className="chat-thinking-orbit" aria-hidden="true"><i /><i /><i /></span><div><strong>{label}</strong><span aria-live="off">{sw.chat.elapsed.replace('{time}', elapsed.toFixed(1))}</span></div></div>;
}

/**
 * The customer-facing Virtual Assistant.
 *
 * One thread with a helper identity at the top: the shopkeeper types what
 * happened (sales, costs, questions) and Risip answers, recording everything
 * against today's business day. Multi-business members pick their business
 * from a small selector; everyone else never sees it.
 */
export default function ChatPage() {
  const c = sw.chat, auth = useAuth();
  const isSw = getLang() === 'sw';
  const userId = auth.status === 'signed-in' ? auth.session.user.id : '';
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(0), [received, setReceived] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]), [company, setCompany] = useState('');
  const [day, setDay] = useState(businessDay());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<Outbox | null>(null);
  const [activeTool, setActiveTool] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [switching, setSwitching] = useState(false);
  const [stopped, setStopped] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null), request = useRef(0), busy = useRef(false);
  /** Set while a reply is in flight, so the send button can become a stop button. */
  const stopper = useRef<AbortController | null>(null);
  // Following the newest message, the way ChatGPT and Claude do: on by
  // default, off the moment the reader scrolls up, back on when they return
  // to the bottom or send.
  const follow = useFollowBottom();
  const thread = follow.ref, messagesBox = follow.contentRef;
  const initialPositioned = useRef(false);
  // Consecutive failed refreshes. The thread reloads every five seconds, so a
  // single blip is not worth a banner; two in a row means something is wrong.
  const failures = useRef(0);
  const outboxKey = `risip.chat.outbox:${userId}:${company}`;
  const setSelectedDay = (value: string) => { if (value === day) return; request.current++; setMessages([]); setLoading(true); setDay(value); };

  const refresh = useCallback(async () => {
    if (!company) return;
    const run = ++request.current;
    const results = await Promise.all([
      loadDayMessages(company, day),
      db.rpc('chat_pending', { p_company: company }),
    ]);
    if (run !== request.current || busy.current) return;
    if (results.some((r: { error: unknown }) => r.error)) {
      failures.current += 1;
      // The banner used to appear on the first failure and then never leave,
      // because nothing cleared it when the next refresh worked.
      if (failures.current >= 2) setError((current) => current || c.loadError);
      setLoading(false);
      return;
    }
    failures.current = 0;
    setError((current) => (current === c.loadError ? '' : current));
    setMessages((current) => [...(results[0].data ?? []), ...current.filter((m) => m.id.startsWith('local:') && m.chat_day === day && !results[0].data?.some((saved) => saved.wa_message_id.endsWith(m.id.slice(6))))]);
    setPending(results[1].data);
    setLoading(false);
  }, [company, day, c.loadError]);
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;

  useEffect(() => {
    let alive = true;
    void db.rpc('ensure_chat_identity').then(async ({ error: identityError }: { error: unknown }) => {
      if (identityError) throw identityError;
      const { data, error: memberError } = await db.rpc('my_memberships');
      if (memberError) throw memberError;
      if (alive) { setMemberships(data ?? []); setCompany(data?.find((m: Membership) => m.is_active)?.company_id ?? ''); }
    }).catch(() => { if (alive) { setError(c.loadError); setLoading(false); } });
    return () => { alive = false; };
  }, [userId, c.loadError]);

  useEffect(() => {
    if (!busy.current) { setLoading(true); void refresh(); }
    const timer = setInterval(() => { if (!busy.current) void refresh(); }, 5000);
    return () => { clearInterval(timer); request.current++; };
  }, [refresh]);

  const { onScroll: userScrolled, grow, goToLatest, followNow, showLatest } = follow;

  useEffect(() => {
    if (!company || loading || initialPositioned.current) return;
    const frame = requestAnimationFrame(() => {
      if (!thread.current) return;
      thread.current.scrollTo({ top: thread.current.scrollHeight, behavior: 'instant' });
      initialPositioned.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [company, loading]);

  const revealed = useCallback((id: string) => setLiveIds((ids) => { const next = new Set(ids); next.delete(id); return next; }), []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    if (!company) return;
    try { const saved = sessionStorage.getItem(outboxKey); setRetry(saved ? JSON.parse(saved) : null); } catch { setRetry(null); }
    setText(sessionStorage.getItem(`${outboxKey}:draft`) ?? '');
  }, [company, outboxKey]);
  useEffect(() => { if (company) sessionStorage.setItem(`${outboxKey}:draft`, text); }, [text, company, outboxKey]);
  useEffect(() => { grow(); }, [messages, sending, grow]);
  // The notice has done its job once the reply it warned about arrives.
  useEffect(() => { if (stopped && messages.at(-1)?.role === 'assistant') setStopped(false); }, [messages, stopped]);

  async function send(value: string, saved?: Outbox) {
    if (busy.current || switching || !company || !value.trim() || !online || (retry && !saved)) return;
    const outgoing = saved ?? { id: crypto.randomUUID(), text: value.trim(), companyId: company };
    const outgoingDay = pending?.day ?? businessDay();
    const controller = new AbortController(); stopper.current = controller;
    request.current++; busy.current = true; setSending(true); setStopped(false); setLoading(false); if (!saved) setText(''); setError(''); setActiveTool(c.reading); setStarted(Date.now()); setReceived(false); followNow(); setDay(outgoingDay);
    if (!saved) setMessages((current) => [...current.filter((m) => m.chat_day === outgoingDay), { id: `local:${outgoing.id}`, wa_message_id: outgoing.id, role: 'user', content: outgoing.text, chat_day: outgoingDay, created_at: new Date().toISOString(), awaiting: null, tools: [] }]);
    sessionStorage.setItem(outboxKey, JSON.stringify(outgoing));
    try {
      await sendChat(outgoing, ({ event, data }) => {
        if (event === 'message') {
          const message = data as ChatMessage;
          setDay(message.chat_day);
          setMessages((current) => reconcileMessage(current, message, outgoing.id));
          if (message.role === 'assistant') { setReceived(true); setPending(message.awaiting ? { day: message.chat_day, awaiting: message.awaiting, message_id: message.id } : null); if (!saved) setLiveIds((ids) => new Set(ids).add(message.id)); }
          else setActiveTool(c.thinkingNow);
        }
        if (event === 'phase') setActiveTool(data.name ? toolLabel(data.name, true) : c.thinkingNow);
        if (event === 'tool') setActiveTool(c.thinkingNow);
        if (event === 'done' && data.status === 'failed') setError(c.failed);
      }, controller.signal);
      sessionStorage.removeItem(outboxKey); setRetry(null);
    } catch (cause) {
      // Stopping is the reader's own doing, so it gets no error: the turn was
      // accepted and is still running on the server.
      if (controller.signal.aborted) sessionStorage.removeItem(outboxKey);
      else { setRetry(outgoing); setError(cause instanceof Error && cause.message === 'pending' ? c.workingElsewhere : c.error); }
    }
    finally { if (stopper.current === controller) stopper.current = null; busy.current = false; setSending(false); setActiveTool(''); void latestRefresh.current(); composer.current?.focus({ preventScroll: true }); }
  }
  function stop() {
    if (!stopper.current) return;
    stopper.current.abort();
    setLiveIds(new Set());
    setStopped(true);
  }
  const latestSend = useRef(send); latestSend.current = send;
  const sendReply = useCallback((value: string) => { void latestSend.current(value); }, []);
  const editReply = useCallback(() => { setText(''); composer.current?.focus({ preventScroll: true }); setError(c.editPrompt); }, [c.editPrompt]);
  async function switchBusiness(id: string) {
    if (busy.current || retry) return;
    busy.current = true; setSwitching(true);
    try {
      const { error: switchError } = await db.rpc('switch_active_company', { p_company: id });
      if (switchError) throw switchError;
      request.current++; setCompany(id); setMessages([]); setPending(null); setSelectedDay(businessDay()); setError('');
    } catch { setError(c.switchError); }
    finally { busy.current = false; setSwitching(false); }
  }
  const controlsDisabled = sending || switching || !online || !company || Boolean(retry);

  return (
    <div className="chat-app chat-app-suite chat-style-cards">
      <main className="chat-main">
        {/* Assistant identity */}
        <section className="chat-va" aria-label={c.title}>
          <span className="chat-va-avatar" aria-hidden="true"><Bot size={22} /></span>
          <div className="min-w-0 flex-1">
            <strong className="chat-va-name">{isSw ? 'Msaidizi wa Risip' : 'Risip Virtual Assistant'}</strong>
            <span className="chat-va-status"><i aria-hidden="true" />{online ? (isSw ? 'Yuko tayari kukusaidia' : 'Ready when you are') : c.offline}</span>
          </div>
          {memberships.length > 1 ? (
            <select
              className="chat-va-business"
              aria-label={c.changeBusiness}
              value={company}
              disabled={sending || switching || Boolean(retry)}
              onChange={(e) => void switchBusiness(e.target.value)}
            >
              {memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company_name}</option>)}
            </select>
          ) : null}
          {pending && pending.day !== day ? (
            <button type="button" className="chat-va-pending" onClick={() => setSelectedDay(pending.day)}>{c.pendingDay}<ChevronRight size={16} /></button>
          ) : null}
        </section>

        <div className="chat-thread-wrap"><div ref={thread} className="chat-thread" onScroll={userScrolled}>
          {loading && <p className="chat-status" role="status">{c.loading}</p>}
          {!loading && messages.length === 0 && (
            <div className="chat-empty">
              <span>{c.greetingLabel}</span>
              <h2>{day === businessDay() ? c.greeting : c.emptyDay}</h2>
              {day === businessDay() && <p>{c.emptyBody}</p>}
            </div>
          )}
          <div ref={messagesBox}>
          <div className="chat-messages" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => <ChatMessageView key={message.id} message={message} plain={false} active={pending?.message_id === message.id} disabled={controlsDisabled} animate={liveIds.has(message.id)} seconds={responseSeconds(message, messages)} send={sendReply} edit={editReply} onRevealed={revealed} onGrow={grow} />)}
          </div>
          {sending && !received && <Working started={started} label={activeTool || c.thinkingNow} />}
          {stopped && !sending && <p className="chat-stopped" role="status">{c.stopped}</p>}
          </div>
        </div></div>

        {showLatest && <button className="chat-jump-latest" aria-label={c.returnLatest} onClick={goToLatest}><ArrowDown size={16} /><span>{c.returnLatest}</span></button>}

        <div className="chat-composer-area">
          {!online && <p role="status" className="chat-error">{c.offline}</p>}
          {error && <div className="chat-error" role="alert"><span>{error}</span>{retry ? <button disabled={sending || !online} onClick={() => void send(retry.text, retry)}>{c.retry}</button> : error === c.loadError && <button onClick={() => { setError(''); void refresh(); }}>{c.reload}</button>}</div>}
          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <textarea ref={composer} rows={1} maxLength={2000} aria-label={c.placeholder} placeholder={c.placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} />
            {sending
              ? <button type="button" className="chat-send chat-stop" aria-label={c.stop} title={c.stop} onClick={stop}><Square size={17} fill="currentColor" /></button>
              : <button className="chat-send" aria-label={c.send} title={c.send} disabled={controlsDisabled || !text.trim()}><ArrowUp size={21} /></button>}
          </form>
        </div>
      </main>
    </div>
  );
}