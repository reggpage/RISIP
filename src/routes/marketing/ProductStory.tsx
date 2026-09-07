import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, CheckCheck, ChevronRight, MessageCircle, Package, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import landingShop from '@/assets/landing-shop.jpg';
import RisipLogo from '@/components/ui/RisipLogo';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import type { LangCode } from '@/lib/lang';
import { DEMO, DEMO_PRODUCTS, demoProfit, tsh } from './landingDemo';

const text = {
  en: {
    eyebrow: 'YOUR BUSINESS. ONE CONVERSATION.', hero: 'You run the shop.', accent: 'Risip keeps up.',
    lead: 'A sale. A delivery. A customer who pays later. Just tell Risip on WhatsApp. Keep your stock, money and daily decisions in view.',
    start: 'Start on WhatsApp', watch: 'See it in action', trial: '7 days free', noCard: 'No card needed', languages: 'Kiswahili & English',
    example: 'Illustrative demo', conversation: 'Business assistant', confirmed: 'Sale confirmed', revenue: 'Sales', profit: 'Gross profit',
    raw: 'nimeuza nguvu ya sala 2 rejareja, printer 3, biblia 4 jumla',
    received: 'Got it. Retail for Nguvu ya sala, wholesale for Biblia.', total: 'Total sale', confirm: 'You confirm. Risip records.',
    scroll: 'SCROLL TO FOLLOW THE STORY', built: 'Built for the way you work.', business: 'From the shop counter to the bigger picture.',
    storyLabel: 'FROM A MESSAGE TO A CLEARER BUSINESS', storyTitle: 'A little conversation.\nA lot more clarity.',
    storyLead: 'Follow one example business day. Every message connects to the records behind it.',
    chapters: [
      ['Just say what sold.', 'Write the way you speak. Risip brings the products, quantities and prices together for you to confirm.'],
      ['See what earns.', 'Sales are only half the picture. Know what sold most and the gross profit after product costs.'],
      ['Know what is left.', 'Ask a follow-up. Risip keeps the product in context and checks the stock and prices behind its answer.'],
      ['Keep track of who owes.', 'Record a payment against the right customer. Keep debt collections separate from new sales.'],
      ['Close with a clear picture.', 'Sales, expenses, profit and low stock, brought together in your daily summary.'],
    ],
    choose: 'Choose a story chapter', saleQuestion: 'Record this sale?', yes: '1 · Yes', no: '2 · Cancel', saved: 'Recorded after your confirmation',
    topQuestion: 'What sold most today?', topAnswer: 'Biblia leads by quantity: 4 copies, followed by Printer (3) and Nguvu ya sala (2).',
    top: 'Best-selling products', units: 'units sold', costs: 'Cost of goods sold',
    stockQuestion: 'How many Nguvu ya sala are left? What are the prices?', stockAnswer: '3 copies left. Retail: TSh 10,600. Wholesale: TSh 9,500, from 5 copies.',
    followup: 'And if I sell two retail?', estimate: 'Revenue: TSh 21,200. Gross profit: TSh 5,200. This is an estimate; no sale has been recorded.',
    stock: 'Stock remaining', low: 'Running low', before: 'Before', sold: 'Sold', left: 'Left',
    debtQuestion: 'Musa has paid 20,000 towards his debt', debtAnswer: 'Musa owed TSh 70,000. Apply TSh 20,000 to leave TSh 50,000?',
    balance: 'Customer balance after confirmation', debtNote: 'A collection against an earlier sale.',
    daily: 'Today’s summary', expenses: 'Expenses', net: 'Profit after recorded expenses', dailyAnswer: 'Printer brought in the most revenue. Nguvu ya sala is running low with 3 copies left. Plan your next restock.',
    dailyNote: 'Based on this example day’s confirmed records.',
    messyLabel: 'ORDINARY WORDS. USEFUL RECORDS.', messyTitle: 'Less form filling.\nMore getting on with it.',
    messyLead: 'Mixed languages, follow-ups and retail or wholesale prices. Risip works with your message, checks your records and asks when something is unclear.',
    rawLabel: '01 / YOU WRITE', understanding: '02 / RISIP UNDERSTANDS', validated: '03 / YOU REVIEW',
    interpretation: ['Sale · 3 products', 'Retail and wholesale kept separate', 'Prices checked against your product records'],
    validatedNote: 'Review the quantities and total before confirming.',
    opsLabel: 'BEHIND THE CONVERSATION', opsTitle: 'Care goes into every answer.',
    opsLead: 'The Risip team’s internal console brings conversation issues into view, so they can be investigated and reviewed.',
    internal: 'Internal team console · illustrative preview', issue: 'A price needs clarification', detected: 'Flagged for review', context: 'Conversation context', contextValue: 'Retail / wholesale choice', review: 'Review before release', reviewValue: 'Correction → regression check',
  },
  sw: {
    eyebrow: 'BIASHARA YAKO. MAZUNGUMZO MOJA.', hero: 'Wewe endesha duka.', accent: 'Risip ifuatilie.',
    lead: 'Mauzo. Mzigo mpya. Mteja anayelipa baadaye. Iambie Risip kwenye WhatsApp. Jua bidhaa zilizobaki, pesa yako na hatua ya kuchukua.',
    start: 'Anza WhatsApp', watch: 'Ona inavyofanya kazi', trial: 'Siku 7 bure', noCard: 'Bila kadi', languages: 'Kiswahili na English',
    example: 'Mfano wa matumizi', conversation: 'Msaidizi wa biashara', confirmed: 'Mauzo yamethibitishwa', revenue: 'Mauzo', profit: 'Faida ghafi',
    raw: 'nimeuza nguvu ya sala 2 rejareja, printer 3, biblia 4 jumla',
    received: 'Nimeelewa. Nguvu ya sala kwa rejareja, Biblia kwa jumla.', total: 'Jumla ya mauzo', confirm: 'Unathibitisha. Risip inarekodi.',
    scroll: 'SHUKA UONE MTIRIRIKO', built: 'Imejengwa kwa kazi zako za kila siku.', business: 'Kutoka kaunta ya duka hadi picha nzima ya biashara.',
    storyLabel: 'KUTOKA UJUMBE HADI BIASHARA INAYOELEWEKA', storyTitle: 'Mazungumzo machache.\nUelewa zaidi.',
    storyLead: 'Fuata mfano wa siku moja ya biashara. Kila ujumbe unaunganishwa na rekodi zake.',
    chapters: [
      ['Sema tu kilichouzwa.', 'Andika unavyozungumza. Risip inaunganisha bidhaa, idadi na bei, kisha inakuonyesha uthibitishe.'],
      ['Jua kinacholeta faida.', 'Mauzo ni sehemu moja tu. Ona bidhaa zinazouza zaidi na faida ghafi baada ya gharama ya bidhaa.'],
      ['Jua kilichobaki.', 'Uliza swali la kufuatilia. Risip inakumbuka bidhaa mnayozungumzia na kuangalia stoo pamoja na bei zake.'],
      ['Fuatilia anayekudaiwa.', 'Rekodi malipo ya mteja husika. Malipo ya deni yanatofautishwa na mauzo mapya.'],
      ['Funga siku ukiwa na picha kamili.', 'Mauzo, matumizi, faida na bidhaa zinazokaribia kuisha katika muhtasari wako wa siku.'],
    ],
    choose: 'Chagua hatua ya mfano', saleQuestion: 'Nirekodi mauzo haya?', yes: '1 · Ndiyo', no: '2 · Ghairi', saved: 'Imerekodiwa baada ya kuthibitisha',
    topQuestion: 'Leo nimeuza nini zaidi?', topAnswer: 'Kwa idadi, Biblia inaongoza: 4, ikifuatiwa na Printer (3) na Nguvu ya sala (2).',
    top: 'Bidhaa zilizouzwa zaidi', units: 'vilivyouzwa', costs: 'Gharama ya bidhaa zilizouzwa',
    stockQuestion: 'Nguvu ya sala zimebaki ngapi, na bei zake?', stockAnswer: 'Zimebaki 3. Rejareja: TSh 10,600. Jumla: TSh 9,500, kuanzia nakala 5.',
    followup: 'na nikiuza viwili rejareja?', estimate: 'Mapato: TSh 21,200. Faida ghafi: TSh 5,200. Ni makisio tu; hayajaandika mauzo mapya.',
    stock: 'Bidhaa zilizobaki', low: 'Zinakaribia kuisha', before: 'Awali', sold: 'Zimeuzwa', left: 'Zimebaki',
    debtQuestion: 'Musa amelipa elfu 20 kwenye deni lake', debtAnswer: 'Musa alikuwa anadaiwa TSh 70,000. Niweke malipo ya TSh 20,000, abaki na TSh 50,000?',
    balance: 'Salio la mteja baada ya kuthibitisha', debtNote: 'Malipo ya deni la mauzo yaliyopita.',
    daily: 'Muhtasiri wa leo', expenses: 'Matumizi', net: 'Faida baada ya matumizi yaliyorekodiwa', dailyAnswer: 'Printer imeleta mapato mengi zaidi. Nguvu ya sala zinakaribia kuisha: zimebaki 3. Panga kuongeza stoo.',
    dailyNote: 'Kutokana na rekodi zilizothibitishwa za siku hii ya mfano.',
    messyLabel: 'MANENO YA KAWAIDA. REKODI ZINAZOFAA.', messyTitle: 'Fomu chache.\nNafasi zaidi ya biashara.',
    messyLead: 'Lugha mchanganyiko, maswali ya kufuatilia, bei za rejareja au jumla. Risip inasoma ujumbe wako, inakagua rekodi na kuuliza kama kuna utata.',
    rawLabel: '01 / UNAANDIKA', understanding: '02 / RISIP INAELEWA', validated: '03 / UNAKAGUA',
    interpretation: ['Mauzo · bidhaa 3', 'Rejareja na jumla zimetofautishwa', 'Bei zimeangaliwa kwenye rekodi za bidhaa'],
    validatedNote: 'Kagua idadi na jumla kabla ya kuthibitisha.',
    opsLabel: 'NYUMA YA MAZUNGUMZO', opsTitle: 'Kila jibu linahitaji umakini.',
    opsLead: 'Console ya ndani ya timu ya Risip inaonyesha changamoto za mazungumzo ili zichunguzwe na kukaguliwa.',
    internal: 'Console ya timu ya ndani · mfano', issue: 'Bei inahitaji ufafanuzi', detected: 'Imewekwa kwa ukaguzi', context: 'Muktadha wa mazungumzo', contextValue: 'Chaguo la rejareja / jumla', review: 'Ukaguzi kabla ya kutolewa', reviewValue: 'Marekebisho → jaribio la kurudia',
  },
} as const;

function Bubble({ children, outgoing = false }: { children: ReactNode; outgoing?: boolean }) {
  return <div className={`rp-bubble ${outgoing ? 'rp-bubble-out' : 'rp-bubble-in'}`}>{children}<span className="rp-bubble-meta" aria-hidden="true">{outgoing ? <CheckCheck size={14} /> : <span>Risip</span>}</span></div>;
}

function ChatHeader({ lang }: { lang: LangCode }) {
  return <div className="rp-chat-header"><span className="rp-avatar">r<span>.</span></span><div><strong>Risip</strong><small>{text[lang].conversation}</small></div><WhatsAppIcon className="rp-chat-icon" /></div>;
}

export function ProductHero({ lang }: { lang: LangCode }) {
  const c = text[lang];
  return <section className="rp-hero">
    <img className="rp-hero-image" src={landingShop} alt="" fetchPriority="high" width="1408" height="768" />
    <div className="rp-hero-shade" />
    <div className="rp-wrap rp-hero-grid">
      <div className="rp-hero-copy">
        <p className="rp-eyebrow"><span className="rp-status-dot" />{c.eyebrow}</p>
        <h1>{c.hero}<br /><span>{c.accent}</span></h1>
        <p className="rp-lead">{c.lead}</p>
        <div className="rp-hero-actions"><Link to="/signup" className="rp-button rp-button-red"><WhatsAppIcon className="h-5 w-5" />{c.start}<ArrowRight size={17} /></Link><a href="#product-story" className="rp-watch">{c.watch}<ArrowDown size={17} /></a></div>
        <div className="rp-hero-assurances"><span><Check size={14} />{c.trial}</span><span>{c.noCard}</span><span>{c.languages}</span></div>
      </div>
      <div className="rp-hero-product">
        <div className="rp-demo-label"><span className="rp-status-dot" />{c.example} / WhatsApp</div>
        <div className="rp-hero-chat"><ChatHeader lang={lang} /><div className="rp-chat-body">
          <Bubble outgoing>{c.raw}</Bubble>
          <Bubble><strong>{c.received}</strong><div className="rp-chat-total"><span>{c.total}</span><b>{tsh(DEMO.revenue)}</b></div><small>{c.confirm}</small></Bubble>
        </div></div>
        <div className="rp-hero-receipt"><span className="rp-check-circle"><Check size={18} /></span><div><small>{c.confirmed} · {c.example}</small><strong>{tsh(DEMO.revenue)}</strong></div><span className="rp-receipt-profit"><TrendingUp size={16} /><b>{tsh(demoProfit)}</b><small>{c.profit}</small></span></div>
      </div>
    </div>
    <div className="rp-wrap rp-hero-bottom"><span>{c.built}</span><a href="#product-story">{c.scroll}<ArrowDown size={14} /></a><span>01 — 05</span></div>
  </section>;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const STACKED_QUERY = '(max-width: 959px), (max-height: 899px), (prefers-reduced-motion: reduce)';

export function ProductStory({ lang }: { lang: LangCode }) {
  const c = text[lang];
  const sections = useRef<(HTMLElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [stacked, setStacked] = useState(() => typeof window === 'undefined' || window.matchMedia(STACKED_QUERY).matches);

  useEffect(() => {
    const compact = window.matchMedia(STACKED_QUERY);
    let frame = 0;
    const read = () => {
      frame = 0;
      if (compact.matches) return;
      const focus = window.innerHeight * 0.48;
      let next = 0;
      sections.current.forEach((el, index) => { if (el && el.getBoundingClientRect().top <= focus) next = index; });
      setActive(next);
      const rect = sections.current[next]?.getBoundingClientRect();
      if (rect && stage.current) stage.current.style.setProperty('--chapter-progress', String(clamp((focus - rect.top) / rect.height)));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(read); };
    const resize = () => { setStacked(compact.matches); queue(); };
    resize();
    compact.addEventListener('change', resize);
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); compact.removeEventListener('change', resize); window.removeEventListener('scroll', queue); window.removeEventListener('resize', resize); };
  }, []);

  return <section id="product-story" className="rp-story">
    <div className="rp-wrap">
      <div className="rp-section-head"><div><p className="rp-eyebrow">{c.storyLabel}</p><h2>{c.storyTitle}</h2></div><p>{c.storyLead}</p></div>
      <div className="rp-story-layout">
        <div className="rp-chapters">
          {c.chapters.map(([title, body], index) => <article id={`story-${index + 1}`} key={title} ref={el => { sections.current[index] = el; }} className={`rp-chapter ${active === index ? 'is-active' : ''}`}>
            <span className="rp-chapter-number">0{index + 1}<span> / 05</span></span><h3>{title}</h3><p>{body}</p>
            <a className="rp-chapter-link" href={index < 4 ? `#story-${index + 2}` : '#understanding'}>{index < 4 ? c.chapters[index + 1][0] : c.messyTitle.replace('\n', ' ')}<ArrowDown size={16} /></a>
            {stacked && <Scene index={index} lang={lang} />}
          </article>)}
        </div>
        {!stacked && <div className="rp-stage" ref={stage}>
          <div className="rp-stage-top"><RisipLogo className="h-7 w-auto" /><span>{c.example}</span></div>
          <div className="rp-scene-viewport">{c.chapters.map(([title], index) => <div key={title} className={`rp-scene-layer ${active === index ? 'is-active' : ''}`} aria-hidden={active !== index}><Scene index={index} lang={lang} /></div>)}</div>
          <nav className="rp-story-nav" aria-label={c.choose}>{c.chapters.map(([title], index) => <a key={title} href={`#story-${index + 1}`} aria-current={active === index ? 'step' : undefined} aria-label={`${index + 1}. ${title}`}><span>0{index + 1}</span><i /></a>)}</nav>
        </div>}
      </div>
    </div>
  </section>;
}

function Scene({ index, lang }: { index: number; lang: LangCode }) {
  const c = text[lang];
  const unit = lang === 'sw' ? 'nakala' : 'copies';
  return <div className={`rp-scene rp-scene-${index}`}>
    <div className="rp-scene-chat"><ChatHeader lang={lang} /><div className="rp-chat-body">
      {index === 0 && <><Bubble outgoing>{c.raw}</Bubble><Bubble><strong>{c.received}</strong><div className="rp-sale-lines">{DEMO_PRODUCTS.map(p => <div key={p.name}><span>{p.name} × {p.quantity}<small>{p.tier === 'retail' ? (lang === 'sw' ? 'Rejareja' : 'Retail') : p.tier === 'wholesale' ? (lang === 'sw' ? 'Jumla' : 'Wholesale') : ''} · {tsh(p.price)}</small></span><b>{tsh(p.price * p.quantity)}</b></div>)}</div><div className="rp-chat-total"><span>{c.total}</span><b>{tsh(DEMO.revenue)}</b></div><p>{c.saleQuestion}</p><div className="rp-demo-options"><span>{c.yes}</span><span>{c.no}</span></div></Bubble><Bubble outgoing>1 <span className="rp-muted">— {lang === 'sw' ? 'Ndiyo' : 'Yes'}</span></Bubble></>}
      {index === 1 && <><Bubble outgoing>{c.topQuestion}</Bubble><Bubble>{c.topAnswer}</Bubble></>}
      {index === 2 && <><Bubble outgoing>{c.stockQuestion}</Bubble><Bubble>{c.stockAnswer}</Bubble><Bubble outgoing>{c.followup}</Bubble><Bubble>{c.estimate}</Bubble></>}
      {index === 3 && <><Bubble outgoing>{c.debtQuestion}</Bubble><Bubble>{c.debtAnswer}<div className="rp-demo-options"><span>{c.yes}</span><span>{c.no}</span></div></Bubble><Bubble outgoing>1</Bubble></>}
      {index === 4 && <Bubble><strong className="rp-daily-title">{c.daily}</strong><span className="rp-muted">{lang === 'sw' ? 'Duka lako · Siku ya mfano' : 'Your shop · Example day'}</span><div className="rp-daily-lines"><div><span>{c.revenue}</span><b>{tsh(DEMO.revenue)}</b></div><div><span>{c.costs}</span><b>{tsh(DEMO.cost)}</b></div><div><span>{c.profit}</span><b>{tsh(demoProfit)}</b></div><div><span>{c.expenses}</span><b>{tsh(DEMO.expenses)}</b></div></div><div className="rp-net"><span>{c.net}</span><strong>{tsh(demoProfit - DEMO.expenses)}</strong></div><p>{c.dailyAnswer}</p><small>{c.dailyNote}</small></Bubble>}
    </div></div>
    <div className="rp-insight">
      {index === 0 && <><div className="rp-insight-label"><Check size={16} />{c.saved}</div><div className="rp-inline-metrics"><div><small>{c.revenue}</small><strong>{tsh(DEMO.revenue)}</strong></div><div><small>{c.units}</small><strong>{DEMO.quantity}</strong></div></div></>}
      {index === 1 && <><div className="rp-insight-label"><TrendingUp size={16} />{c.top}</div><div className="rp-bars">{[...DEMO_PRODUCTS].sort((a, b) => b.quantity - a.quantity).map(p => <div key={p.name}><span>{p.name}<b>{p.quantity}</b></span><i style={{ '--bar-width': `${p.quantity / 4 * 100}%` } as CSSProperties} /></div>)}</div><div className="rp-insight-footer"><span>{c.profit}</span><strong>{tsh(demoProfit)}</strong></div></>}
      {index === 2 && <><div className="rp-insight-label"><Package size={16} />{c.stock} <span className="rp-low">{c.low}</span></div><strong className="rp-stock-name">Nguvu ya sala</strong><div className="rp-stock-flow"><div><strong>5</strong><small>{c.before}</small></div><ArrowRight size={20} /><div><strong>−2</strong><small>{c.sold}</small></div><ArrowRight size={20} /><div><strong>3</strong><small>{unit} · {c.left}</small></div></div></>}
      {index === 3 && <><div className="rp-insight-label"><Wallet size={16} />Musa</div><small>{c.balance}</small><strong className="rp-big-value">{tsh(DEMO.priorDebt - DEMO.debtPayment)}</strong><div className="rp-debt-equation">{tsh(DEMO.priorDebt)} − {tsh(DEMO.debtPayment)}</div><p className="rp-muted">{c.debtNote}</p></>}
      {index === 4 && <><div className="rp-insight-label"><MessageCircle size={16} />{lang === 'sw' ? 'Siku yako, kwa ufupi.' : 'Your day, understood.'}</div><div className="rp-summary-tags"><span>{DEMO.quantity} {c.units}</span><span>3 {lang === 'sw' ? 'aina za bidhaa' : 'product types'}</span><span>1 {lang === 'sw' ? 'tahadhari ya stoo' : 'stock alert'}</span></div></>}
    </div>
  </div>;
}

export function UnderstandingSection({ lang }: { lang: LangCode }) {
  const c = text[lang];
  return <section id="understanding" className="rp-understanding"><div className="rp-wrap">
    <div className="rp-section-head"><div><p className="rp-eyebrow">{c.messyLabel}</p><h2>{c.messyTitle}</h2></div><p>{c.messyLead}</p></div>
    <div className="rp-understanding-grid">
      <article><span className="rp-mini-label">{c.rawLabel}</span><div className="rp-raw-message">“{c.raw}”</div><span className="rp-understanding-bottom"><WhatsAppIcon className="h-4 w-4" />WhatsApp<ChevronRight size={16} /></span></article>
      <article><span className="rp-mini-label">{c.understanding}</span><ul>{c.interpretation.map(item => <li key={item}><Check size={16} />{item}</li>)}</ul><span className="rp-understanding-bottom"><RisipLogo className="h-6 w-auto" /><ChevronRight size={16} /></span></article>
      <article className="rp-understanding-result"><span className="rp-mini-label">{c.validated}</span><small>{c.total}</small><strong>{tsh(DEMO.revenue)}</strong><p>{c.validatedNote}</p><span className="rp-understanding-bottom"><ShieldCheck size={18} />{c.example}</span></article>
    </div>
  </div></section>;
}

export function OperationsPreview({ lang }: { lang: LangCode }) {
  const c = text[lang];
  return <section className="rp-operations"><div className="rp-wrap rp-operations-grid">
    <div><p className="rp-eyebrow">{c.opsLabel}</p><h2>{c.opsTitle}</h2><p className="rp-ops-lead">{c.opsLead}</p></div>
    <div className="rp-console"><div className="rp-console-top"><RisipLogo className="h-6 w-auto" /><span>{c.internal}</span></div><div className="rp-console-body"><div className="rp-console-alert"><span className="rp-console-dot" /><strong>{c.issue}</strong><span>{c.detected}</span></div><div className="rp-console-row"><span>{c.context}</span><b>{c.contextValue}</b></div><div className="rp-console-row"><span>{c.review}</span><b>{c.reviewValue}</b></div></div></div>
  </div></section>;
}
