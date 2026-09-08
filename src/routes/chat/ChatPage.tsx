import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, MessageCircle, ScanLine, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getLang } from '@/lib/lang';
import { sw } from '@/i18n/sw';
import { businessDay, confirmationRows, isConfirmation, sendChat, type ChatMessage, type Membership, type Outbox, type Pending } from '@/features/chat/chat';
import ScanToSell from './ScanToSell';
import './chat.css';

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
function toolLabel(name: string) {
  const c = sw.chat;
  if (/propose|prepare|draft/.test(name)) return c.draft;
  if (/profit|advice|summary/.test(name)) return c.profit;
  if (/stock/.test(name)) return c.stock;
  if (/price|cost/.test(name)) return c.prices;
  if (/sale|day_record|breakdown/.test(name)) return c.sales;
  return c.toolGeneric;
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
  const [memberships, setMemberships] = useState<Membership[]>([]), [company, setCompany] = useState('');
  const [day, setDay] = useState(businessDay()), [days, setDays] = useState<string[]>([]), [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending>(null), [usage, setUsage] = useState<{ messages_used: number; allowance: number } | null>(null);
  const [text, setText] = useState(''), [sending, setSending] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState<Outbox | null>(null), [calendar, setCalendar] = useState(false), [scan, setScan] = useState(false), [activeTool, setActiveTool] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [switching, setSwitching] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null), request = useRef(0), nearBottom = useRef(true), busy = useRef(false);
  const outboxKey = `risip.chat.outbox:${userId}:${company}`;
  const setSelectedDay = (value: string) => { if (value === day) return; nearBottom.current = true; request.current++; setMessages([]); setLoading(true); setDay(value); };
  const refresh = useCallback(async () => {
    if (!company) return;
    const run = ++request.current;
    const results = await Promise.all([
      loadDayMessages(company, day),
      db.rpc('chat_days', { p_company: company }), db.rpc('chat_usage_now'), db.rpc('chat_pending', { p_company: company }),
    ]);
    if (run !== request.current) return;
    if (results.some((r: { error: unknown }) => r.error)) { setError(c.loadError); setLoading(false); return; }
    setMessages(results[0].data ?? []); setDays((results[1].data ?? []).map((r: { chat_day: string }) => r.chat_day)); setUsage(results[2].data); setPending(results[3].data); setLoading(false);
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
  useEffect(() => { setLoading(true); void refresh(); const timer = setInterval(() => { if (!busy.current) void refresh(); }, 5000); return () => { clearInterval(timer); request.current++; }; }, [refresh]);
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
  useEffect(() => { if (nearBottom.current) thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [messages, sending]);
  async function send(value: string, saved?: Outbox) {
    if (busy.current || switching || !company || !value.trim() || !online || (retry && !saved)) return;
    const outgoing = saved ?? { id: crypto.randomUUID(), text: value.trim(), companyId: company };
    sessionStorage.setItem(outboxKey, JSON.stringify(outgoing)); busy.current = true; setSending(true); setError(''); setActiveTool(''); nearBottom.current = true;
    try {
      await sendChat(outgoing, ({ event, data }) => {
        if (event === 'message') {
          const message = data as ChatMessage;
          setDay(message.chat_day);
          setMessages((current) => [...current.filter((m) => m.id !== message.id && m.chat_day === message.chat_day), message]);
        }
        if (event === 'tool') setActiveTool(toolLabel(data.name));
        if (event === 'done' && data.status === 'failed') setError(c.failed);
      });
      sessionStorage.removeItem(outboxKey); setRetry(null); setText('');
    } catch (cause) { setRetry(outgoing); setError(cause instanceof Error && cause.message === 'pending' ? c.workingElsewhere : c.error); }
    finally { busy.current = false; setSending(false); setActiveTool(''); void latestRefresh.current(); composer.current?.focus(); }
  }
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
  function jump(id: string) { document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); }
  const controlsDisabled = sending || switching || !online || !company || Boolean(retry);
  return <div className="chat-app">
    <aside className="chat-rail">
      <Link to="/dashboard" className="chat-brand" aria-label={c.back}><span className="chat-brand-mark">r</span>{c.title}<ArrowLeft size={17} /></Link>
      <label className="chat-business"><span>{c.business}</span><select value={company} disabled={sending || switching || Boolean(retry)} onChange={(e) => void switchBusiness(e.target.value)}>{memberships.map((m) => <option key={m.company_id} value={m.company_id}>{m.company_name}</option>)}</select></label>
      <nav className="chat-days" aria-label={c.earlier}>{[c.today, c.yesterday, c.beforeYesterday].map((label, index) => <button key={label} aria-current={day === businessDay(-index) ? 'date' : undefined} onClick={() => setSelectedDay(businessDay(-index))}><span>{label}</span>{days.includes(businessDay(-index)) && <i />}</button>)}<button className="chat-calendar-trigger" aria-label={c.calendar} onClick={() => setCalendar(true)}><CalendarDays size={19} /><span>{c.calendar}</span></button></nav>
      <div className="chat-allowance"><div><span>{c.allowance}</span>{usage && <strong>{usage.messages_used.toLocaleString()} <small>/ {usage.allowance.toLocaleString()}</small></strong>}</div>{usage ? <progress aria-label={c.allowance} max={usage.allowance} value={Math.min(usage.messages_used, usage.allowance)} /> : <p>{c.noPlan}</p>}<p>{c.allowanceNote}</p></div>
    </aside>
    <main className="chat-main">
      <header className="chat-header"><div><h1>{c.nav}</h1><p>{c.subtitle}</p></div><time dateTime={day}>{dateLabel(day)}</time></header>
      {pending && pending.day !== day && <button className="chat-pending-link" onClick={() => setSelectedDay(pending.day)}>{c.pendingDay}<ChevronRight size={16} /></button>}
      <div className="chat-thread-wrap"><div ref={thread} className="chat-thread" onScroll={() => { const el = thread.current!; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
        {loading && <p className="chat-status" role="status">{c.loading}</p>}
        {!loading && messages.length === 0 && <div className="chat-empty"><div><MessageCircle size={25} strokeWidth={1.4} /></div><h2>{day === businessDay() ? c.emptyTitle : c.emptyDay}</h2>{day === businessDay() && <p>{c.emptyBody}</p>}</div>}
        <div className="chat-messages" aria-live="polite" aria-relevant="additions">
          {messages.map((message) => {
            const confirm = message.role === 'assistant' && isConfirmation(message.awaiting), rows = confirm ? confirmationRows(message.content) : [];
            const active = confirm && pending?.message_id === message.id;
            return <article id={`message-${message.id}`} key={message.id} className={`chat-message ${message.role}`} tabIndex={-1}>
              <div className="chat-message-meta"><strong>{message.role === 'user' ? c.you : c.assistant}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' })}</time></div>
              <div className={confirm ? 'chat-confirmation' : 'chat-message-body'}>
                {confirm && <div className="chat-confirmation-heading"><Check size={15} />{c.confirmation}</div>}
                <div className="chat-prose">{(rows.length ? message.content.split('\n').filter((line) => confirmationRows(line).length === 0 && !/^(Jibu|Reply)\s+\*?1\b/.test(line)).join('\n').trim() : message.content).replace(/\*/g, '').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2')}</div>
                {rows.length > 0 && <table><caption className="sr-only">{c.confirmation}</caption><thead><tr><th>{c.detail}</th><th>{c.amount}</th></tr></thead><tbody>{rows.map(([label, value], index) => <tr key={index}><td>{label}</td><td>{value}</td></tr>)}</tbody></table>}
                {active && <div className="chat-confirm-actions"><button className="chat-primary" disabled={controlsDisabled} onClick={() => void send('NDIYO')}><Check size={16} />{c.confirm}</button><button disabled={controlsDisabled} onClick={() => { setText(''); composer.current?.focus(); setError(c.editPrompt); }}>{c.edit}</button><button disabled={controlsDisabled} onClick={() => void send('GHAIRI')}>{c.cancel}</button></div>}
              </div>
              {message.tools.length > 0 && <details className="chat-tools"><summary>{c.tools}</summary><p>{[...new Set(message.tools.map(toolLabel))].join(', ')}</p></details>}
            </article>;
          })}
        </div>
        {sending && <div className="chat-working" role="status"><span />{activeTool || c.thinking}</div>}
      </div>
      {messages.length > 0 && <nav className="chat-minimap" aria-label={c.minimap}>{messages.map((message, index) => <button key={message.id} className={message.role} aria-label={`${c.jump} ${index + 1}: ${message.content.slice(0, 65)}`} onClick={() => jump(message.id)}><i /><span className="chat-minimap-preview"><strong>{message.role === 'user' ? c.you : c.assistant}</strong>{message.content.slice(0, 180).replace(/\*/g, '')}</span></button>)}</nav>}
      </div>
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
