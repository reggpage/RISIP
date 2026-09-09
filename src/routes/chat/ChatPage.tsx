import { useCallback, useEffect, useRef, useState } from 'react';
import { useFollowBottom } from '@/features/chat/useFollowBottom';
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Layers2, Menu, ScanLine, AlignLeft, X } from 'lucide-react';
import RisipLogo from '@/components/ui/RisipLogo';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getLang } from '@/lib/lang';
import { sw } from '@/i18n/sw';
import { businessDay, sendChat, type ChatMessage, type Membership, type Outbox, type Pending } from '@/features/chat/chat';
import { reconcileMessage, responseSeconds } from '@/features/chat/presentation';
import ChatMessageView, { toolLabel } from './ChatMessageView';
import ScanToSell from './ScanToSell';
import MessageFinder from './MessageFinder';
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
const locale = getLang() === 'sw' ? 'sw-TZ' : 'en-GB';
function dateLabel(day: string) { return new Date(`${day}T12:00:00+03:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' }); }
function Working({ started, label }: { started: number; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 100); return () => clearInterval(timer); }, [started]);
  return <div className="chat-working" role="status"><span className="chat-thinking-orbit" aria-hidden="true"><i /><i /><i /></span><div><strong>{label}</strong><span aria-live="off">{sw.chat.elapsed.replace('{time}', elapsed.toFixed(1))}</span></div></div>;
}
function Calendar({ days, day, pick, close }: { days: string[]; day: string; pick: (day: string) => void; close: () => void }) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const dialog = useRef<HTMLDialogElement>(null), c = sw.chat;
  const first = new Date(`${month}-01T12:00:00Z`), offset = (first.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const available = new Set(days);
  function move(by: number) { const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + by); setMonth(d.toISOString().slice(0, 7)); }
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="chat-calendar" aria-label={c.calendar} onCancel={(e) => { e.preventDefault(); close(); }}>
    <header><span>{c.earlier}</span><button aria-label={c.close} onClick={close}><X size={18} /></button></header>
    <div className="chat-month"><button aria-label={c.previousMonth} onClick={() => move(-1)}><ChevronLeft size={18} /></button><strong>{first.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button aria-label={c.nextMonth} disabled={month >= businessDay().slice(0, 7)} onClick={() => move(1)}><ChevronRight size={18} /></button></div>
    <div className="chat-calendar-grid">{c.weekdays.map((name) => <span key={name}>{name}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: total }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      return <button key={date} disabled={!available.has(date)} aria-pressed={date === day} aria-label={dateLabel(date)} onClick={() => { pick(date); close(); }}>{i + 1}{available.has(date) && <i />}</button>;
    })}</div>
  </dialog>;
}

export default function ChatPage() {
  const c = sw.chat, auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : '';
  const [style, setStyle] = useState<'cards' | 'plain'>(() => localStorage.getItem('risip.chat.style') === 'plain' ? 'plain' : 'cards');
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(0), [received, setReceived] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]), [company, setCompany] = useState('');
  const [day, setDay] = useState(businessDay()), [days, setDays] = useState<string[]>([]), [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending>(null), [usage, setUsage] = useState<{ messages_used: number; allowance: number } | null>(null);
  const [text, setText] = useState(''), [sending, setSending] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState<Outbox | null>(null), [calendar, setCalendar] = useState(false), [scan, setScan] = useState(false), [activeTool, setActiveTool] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [switching, setSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null), request = useRef(0), busy = useRef(false);
  // Following the newest message, the way ChatGPT and Claude do: on by
  // default, off the moment the reader scrolls up to look at something, back
  // on when they return to the bottom or send.
  const follow = useFollowBottom();
  const thread = follow.ref, messagesBox = follow.contentRef;
  const initialPositioned = useRef(false);
  const app = useRef<HTMLDivElement>(null);
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
      db.rpc('chat_days', { p_company: company }), db.rpc('chat_usage_now'), db.rpc('chat_pending', { p_company: company }),
    ]);
    if (run !== request.current || busy.current) return;
    if (results.some((r: { error: unknown }) => r.error)) {
      failures.current += 1;
      // The banner used to appear on the first failure and then never leave,
      // because nothing cleared it when the next refresh worked. It sat under
      // a conversation that had loaded perfectly well.
      if (failures.current >= 2) setError((current) => current || c.loadError);
      setLoading(false);
      return;
    }
    failures.current = 0;
    // Clear only this banner. A send error carries its own retry button and
    // must survive a background refresh.
    setError((current) => (current === c.loadError ? '' : current));
    setMessages((current) => [...(results[0].data ?? []), ...current.filter((m) => m.id.startsWith('local:') && m.chat_day === day && !results[0].data?.some((saved: ChatMessage) => saved.wa_message_id.endsWith(m.id.slice(6))))]); setDays((results[1].data ?? []).map((r: { chat_day: string }) => r.chat_day)); setUsage(results[2].data); setPending(results[3].data); setLoading(false);
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
  useEffect(() => { if (!busy.current) { setLoading(true); void refresh(); } const timer = setInterval(() => { if (!busy.current) void refresh(); }, 5000); return () => { clearInterval(timer); request.current++; }; }, [refresh]);
  useEffect(() => { localStorage.setItem('risip.chat.style', style); }, [style]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    // Soft keyboards resize the visual viewport without changing 100dvh.
    // Keep the composer visible without scrolling the rail off the screen.
    const resize = () => { if (viewport.scale === 1) app.current?.style.setProperty('--chat-height', `${viewport.height}px`); };
    resize(); viewport.addEventListener('resize', resize);
    return () => viewport.removeEventListener('resize', resize);
  }, []);
  const { onScroll: userScrolled, grow, goToLatest, followNow, stopFollowing, showLatest } = follow;
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
  async function send(value: string, saved?: Outbox) {
    if (busy.current || switching || !company || !value.trim() || !online || (retry && !saved)) return;
    const outgoing = saved ?? { id: crypto.randomUUID(), text: value.trim(), companyId: company };
    const outgoingDay = pending?.day ?? businessDay();
    request.current++; busy.current = true; setSending(true); setLoading(false); if (!saved) setText(''); setError(''); setActiveTool(c.reading); setStarted(Date.now()); setReceived(false); followNow(); setDay(outgoingDay); setCalendar(false);
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
      });
      sessionStorage.removeItem(outboxKey); setRetry(null);
    } catch (cause) { setRetry(outgoing); setError(cause instanceof Error && cause.message === 'pending' ? c.workingElsewhere : c.error); }
    finally { busy.current = false; setSending(false); setActiveTool(''); void latestRefresh.current(); composer.current?.focus({ preventScroll: true }); }
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
      request.current++; setCompany(id); setMessages([]); setPending(null); setSelectedDay(businessDay()); setError(''); setMenuOpen(false);
    } catch { setError(c.switchError); }
    finally { busy.current = false; setSwitching(false); }
  }
  function jump(id: string) { stopFollowing(); document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); }
  const controlsDisabled = sending || switching || !online || !company || Boolean(retry);
  const activeMembership = memberships.find((membership) => membership.company_id === company);
  return <div ref={app} className={`chat-app chat-style-${style}`}>
    <main className="chat-main">
      <header className="chat-header"><div><h1>{c.nav}</h1><p><i />{c.subtitle}</p></div><button className="chat-menu-trigger" aria-label={c.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={21} /></button></header>
      {menuOpen && <><button className="chat-menu-backdrop" aria-label={c.closeMenu} onClick={() => setMenuOpen(false)} /><section className="chat-menu-panel" aria-label={c.menu}>
        <div className="chat-menu-panel-head"><span>{c.menu}</span><button aria-label={c.closeMenu} onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
        <div className="chat-menu-business"><span>{c.business}</span><strong>{activeMembership?.company_name ?? c.business}</strong><label><span>{c.changeBusiness}</span><select value={company} disabled={sending || switching || Boolean(retry)} onChange={(e) => void switchBusiness(e.target.value)}>{memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company_name}</option>)}</select></label></div>
        <div className="chat-menu-section"><span>{c.responseStyle}</span><div className="chat-style-switch" role="group" aria-label={c.responseStyle}><button aria-pressed={style === 'cards'} title={c.cards} onClick={() => { setStyle('cards'); setMenuOpen(false); }}><Layers2 size={15} /><span>{c.cards}</span></button><button aria-pressed={style === 'plain'} title={c.plain} onClick={() => { setStyle('plain'); setMenuOpen(false); }}><AlignLeft size={15} /><span>{c.plain}</span></button></div></div>
        <div className="chat-menu-allowance"><div><span>{c.allowance}</span>{usage && <strong>{usage.messages_used.toLocaleString()} <small>/ {usage.allowance.toLocaleString()}</small></strong>}</div>{usage ? <progress aria-label={c.allowance} max={usage.allowance} value={Math.min(usage.messages_used, usage.allowance)} /> : <p>{c.noPlan}</p>}<p>{c.allowanceNote}</p></div>
        <nav className="chat-menu-days" aria-label={c.earlier}>{[c.today, c.yesterday, c.beforeYesterday].map((label, index) => <button key={label} aria-current={day === businessDay(-index) ? 'date' : undefined} onClick={() => { setSelectedDay(businessDay(-index)); setMenuOpen(false); }}><span>{label}</span>{days.includes(businessDay(-index)) && <i />}</button>)}<button className="chat-calendar-trigger" onClick={() => { setCalendar(true); setMenuOpen(false); }}><CalendarDays size={18} /><span>{c.calendar}</span></button></nav>
      </section></>}
      {pending && pending.day !== day && <button className="chat-pending-link" onClick={() => setSelectedDay(pending.day)}>{c.pendingDay}<ChevronRight size={16} /></button>}
      <div className="chat-thread-wrap"><div ref={thread} className="chat-thread" onScroll={userScrolled}>
        <div className="chat-date-divider"><span /><time dateTime={day}>{dateLabel(day)}</time><span /></div>
        {loading && <p className="chat-status" role="status">{c.loading}</p>}
        {!loading && messages.length === 0 && <div className="chat-empty"><RisipLogo className="chat-empty-logo" /><span>{c.greetingLabel}</span><h2>{day === businessDay() ? c.greeting : c.emptyDay}</h2>{day === businessDay() && <p>{c.emptyBody}</p>}</div>}
        <div className="chat-messages" ref={messagesBox} aria-live="polite" aria-relevant="additions">
          {messages.map((message) => <ChatMessageView key={message.id} message={message} plain={style === 'plain'} active={pending?.message_id === message.id} disabled={controlsDisabled} animate={liveIds.has(message.id)} seconds={responseSeconds(message, messages)} send={sendReply} edit={editReply} onRevealed={revealed} onGrow={grow} />)}
        </div>
        {sending && !received && <Working started={started} label={activeTool || c.thinkingNow} />}
      </div>
      {messages.length > 0 && <MessageFinder messages={messages} jump={jump} />}
      </div>
      {showLatest && <button className="chat-jump-latest" aria-label={c.returnLatest} onClick={goToLatest}><ArrowDown size={16} />{c.returnLatest}</button>}
      <div className="chat-composer-area">
        {!online && <p role="status" className="chat-error">{c.offline}</p>}
        {error && <div className="chat-error" role="alert"><span>{error}</span>{retry ? <button disabled={sending || !online} onClick={() => void send(retry.text, retry)}>{c.retry}</button> : error === c.loadError && <button onClick={() => { setError(''); void refresh(); }}>{c.reload}</button>}</div>}
        <div className="chat-quick-actions">{[c.questionSales, c.questionProfit, c.questionStock].map((question) => <button key={question} disabled={controlsDisabled} onClick={() => void send(question)}>{question}</button>)}</div>
        <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <textarea ref={composer} rows={1} maxLength={2000} aria-label={c.placeholder} placeholder={c.placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} />
          <button type="button" className="chat-scan-button" aria-label={c.scan} title={c.scan} disabled={controlsDisabled} onClick={() => setScan(true)}><ScanLine size={21} /></button>
          <button className="chat-send" aria-label={c.send} title={c.send} disabled={controlsDisabled || !text.trim()}><ArrowUp size={21} /></button>
        </form>
      </div>
    </main>
    {calendar && <Calendar days={days} day={day} pick={setSelectedDay} close={() => setCalendar(false)} />}
    {scan && <ScanToSell close={() => setScan(false)} send={(value) => void send(value)} />}
  </div>;
}
