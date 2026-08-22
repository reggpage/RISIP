import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Barcode, BarChart3, Bot, Check, CheckCircle2, Mail, MapPin, Package, Phone, ScanLine, Send, ShieldCheck, Smartphone, WalletCards } from 'lucide-react';
import landingProductsBarcode from '@/assets/landing-products-barcode.jpg';
import landingCashFlow from '@/assets/landing-cash-flow.jpg';
import landingWhatsApp from '@/assets/landing-whatsapp.jpg';
import landingRisipAi from '@/assets/landing-risip-ai.jpg';
import Button from '@/components/ui/Button';
import RisipLogo from '@/components/ui/RisipLogo';
import WhatsAppFloatingButton from '@/components/whatsapp/WhatsAppFloatingButton';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { buildRisipWhatsAppUrl } from '@/features/whatsapp/publicWhatsApp';
import { useAuth } from '@/lib/auth';
import { getLang } from '@/lib/lang';

const COPY = {
  sw: {
    features: 'Uwezo', faqNav: 'Maswali', login: 'Ingia', start: 'Anza WhatsApp',
    eyebrow: 'Rekodi za mauzo na usimamizi wa biashara',
    hero: 'Rekodi biashara yako.', accent: 'Elewa pesa yako.',
    lead: 'Uza, hesabu stock, rekodi mapato na matumizi, kisha uliza Risip kuhusu biashara yako moja kwa moja kupitia WhatsApp.',
    primary: 'Sajili biashara', secondary: 'Nina akaunti',
    howTitle: 'Biashara yako kwa hatua tatu rahisi',
    howLead: 'Risip inafuata kazi zako za kila siku bila kukulazimisha kujaza fomu ndefu.',
    steps: [
      ['Sajili biashara', 'Anza kupitia WhatsApp. Risip itakuuliza jina lako, jina la biashara na bidhaa unazouza.'],
      ['Rekodi kinachotokea', 'Scan barcode au andika mauzo, matumizi, madeni na malipo kwa lugha unayotumia kila siku.'],
      ['Pata majibu yaliyo wazi', 'Uliza kilichouza, stock iliyobaki, pesa iliyoingia na matumizi ya biashara yako.'],
    ],
    featureTitle: 'Uza kwa urahisi. Elewa biashara yako.',
    featureLead: 'Risip inakuonyesha kilichouzwa, kilichobaki na pesa ilikoenda.',
    cards: [
      ['Bidhaa na barcode', 'Sajili bidhaa mara moja, scan kwa kamera, uza haraka na fuatilia stock iliyobaki.'],
      ['Rekodi kupitia WhatsApp', 'Andika mauzo, matumizi, madeni na malipo bila kutumia maneno magumu ya uhasibu.'],
      ['Jua pesa ilikoenda', 'Tazama mauzo, matumizi, madeni na malipo katika sehemu zilizo wazi na rahisi kufuatilia.'],
      ['Uliza Risip kuhusu biashara', 'Pata majibu kutokana na mauzo, stock, matumizi na malipo yaliyorekodiwa kwenye biashara yako.'],
    ],
    trust: ['Ingia bila password kupitia WhatsApp', 'Taarifa za biashara yako zinabaki salama', 'Unathibitisha kila rekodi ya pesa'],
    faqTitle: 'Maswali yanayoulizwa mara nyingi',
    faqLead: 'Majibu ya haraka kabla hujaanza kutumia Risip.',
    faqs: [
      ['Risip inafanya nini?', 'Risip inakusaidia kusajili bidhaa, kurekodi mauzo na matumizi, kufuatilia stock, madeni na malipo, kisha kuuliza maswali kuhusu biashara yako kupitia WhatsApp.'],
      ['Ninasajilije biashara?', 'Bonyeza Sajili biashara, weka namba yako ya WhatsApp na ufuate maswali ya Risip. Hutahitaji email wala password.'],
      ['Ninaingiaje kwenye dashboard?', 'Weka namba yako kwenye ukurasa wa kuingia. Risip itakutumia link salama ya dakika 5 kupitia WhatsApp. Link inatumika mara moja tu.'],
      ['Naweza kutumia barcode?', 'Ndiyo. Unaweza kusajili bidhaa kwa barcode na kuitumia wakati wa kuuza ili bidhaa ipatikane haraka.'],
      ['Risip inaandika rekodi bila ruhusa yangu?', 'Hapana. Risip inakuonyesha ilichoelewa na inasubiri uthibitishe kabla ya kuhifadhi rekodi ya pesa.'],
      ['Naweza kuongeza wafanyakazi?', 'Ndiyo. Mmiliki anaweza kuwaalika wafanyakazi na kuwapa ruhusa zinazolingana na kazi zao.'],
    ],
    ctaTitle: 'Anza kuweka biashara yako sawa leo.',
    ctaBody: 'Hakuna password ya kukumbuka. Fungua WhatsApp, sajili biashara na uanze kurekodi.',
    chat: 'Ongea na Risip', footerAbout: 'Kuhusu Risip', footerAboutText: 'Risip ni mfumo wa mauzo, stock na rekodi rahisi za biashara kwa wajasiriamali wa Tanzania.',
    footerContact: 'Mawasiliano', footerFaq: 'Maswali', footerFaqLink: 'Soma maswali ya kawaida',
    footerRights: 'Haki zote zimehifadhiwa.',
  },
  en: {
    features: 'Features', faqNav: 'FAQ', login: 'Sign in', start: 'Start on WhatsApp',
    eyebrow: 'Sales records and business bookkeeping',
    hero: 'Record your business.', accent: 'Understand your money.',
    lead: 'Sell, count stock, record income and expenses, then ask Risip about your business directly on WhatsApp.',
    primary: 'Register business', secondary: 'I have an account',
    howTitle: 'Your business in three simple steps',
    howLead: 'Risip follows the work you already do every day without making you fill in long forms.',
    steps: [
      ['Register the business', 'Start on WhatsApp. Risip asks for your name, business name and the products you sell.'],
      ['Record what happens', 'Scan a barcode or write sales, expenses, debts and payments in the language you use every day.'],
      ['Get clear answers', 'Ask what sold, what is left in stock, how much money came in and what the business spent.'],
    ],
    featureTitle: 'Sell easily. Understand your business.',
    featureLead: 'Risip shows you what sold, what remains and where the money went.',
    cards: [
      ['Products and barcodes', 'Register a product once, scan it with the camera, sell quickly and track the remaining stock.'],
      ['Records through WhatsApp', 'Write sales, expenses, debts and payments without learning complicated accounting terms.'],
      ['Know where the money went', 'See sales, expenses, debts and payments in clear sections that are easy to follow.'],
      ['Ask Risip about your business', 'Get answers based on the sales, stock, expenses and payments recorded for your business.'],
    ],
    trust: ['Passwordless WhatsApp sign in', 'Your business records stay private', 'You confirm every money record'],
    faqTitle: 'Frequently asked questions',
    faqLead: 'Quick answers before you start using Risip.',
    faqs: [
      ['What does Risip do?', 'Risip helps you register products, record sales and expenses, track stock, debts and payments, then ask questions about your business on WhatsApp.'],
      ['How do I register my business?', 'Choose Register business, enter your WhatsApp number and follow the questions from Risip. You do not need an email address or password.'],
      ['How do I sign in to the dashboard?', 'Enter your number on the sign in page. Risip sends a secure five minute link on WhatsApp. The link works once.'],
      ['Can I use product barcodes?', 'Yes. You can register products with barcodes and scan them during a sale so they are found quickly.'],
      ['Can Risip save a record without my permission?', 'No. Risip shows what it understood and waits for your confirmation before it saves a money record.'],
      ['Can I add employees?', 'Yes. The owner can invite employees and give them permissions that match their work.'],
    ],
    ctaTitle: 'Put your business records in order today.',
    ctaBody: 'There is no password to remember. Open WhatsApp, register your business and start recording.',
    chat: 'Chat with Risip', footerAbout: 'About Risip', footerAboutText: 'Risip is a simple sales, stock and bookkeeping system made for Tanzanian entrepreneurs.',
    footerContact: 'Contact', footerFaq: 'FAQ', footerFaqLink: 'Read common questions',
    footerRights: 'All rights reserved.',
  },
} as const;

const STEP_ICONS = [Smartphone, ScanLine, BarChart3] as const;
const FEATURE_ICONS = [Package, WhatsAppIcon, WalletCards, Bot] as const;
const FEATURE_IMAGES = [landingProductsBarcode, landingWhatsApp, landingCashFlow, landingRisipAi] as const;

export default function Landing() {
  const auth = useAuth();
  const lang = getLang();
  const c = COPY[lang];
  const chatUrl = buildRisipWhatsAppUrl('support', lang);
  if (auth.status === 'signed-in' && auth.profile) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-surface-muted text-ink">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-surface-border/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Risip" className="text-role-admin"><RisipLogo className="h-11 w-auto" /></Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <a href="#features" className="hidden px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink sm:block">{c.features}</a>
            <a href="#faq" className="hidden px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink sm:block">{c.faqNav}</a>
            <Link to="/login"><Button variant="ghost">{c.login}</Button></Link>
            <Link to="/signup" className="hidden sm:block"><Button tint="admin">{c.start}</Button></Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="overflow-hidden bg-gradient-to-br from-role-admin/5 via-surface to-[#25D366]/5 pb-20 pt-32 sm:pb-28 sm:pt-40">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[.92fr_1.08fr] lg:px-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-role-admin/20 bg-surface px-3 py-1.5 text-xs font-semibold text-role-admin shadow-sm"><ShieldCheck className="h-3.5 w-3.5" /> {c.eyebrow}</div>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">{c.hero} <span className="text-role-admin">{c.accent}</span></h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted sm:text-xl">{c.lead}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/signup"><Button tint="admin" className="w-full justify-center px-6 py-3 text-base sm:w-auto">{c.primary}<ArrowRight className="h-4 w-4" /></Button></Link>
                <Link to="/login"><Button variant="secondary" className="w-full justify-center px-6 py-3 text-base sm:w-auto">{c.secondary}</Button></Link>
              </div>
              <ul className="mt-8 grid gap-3 text-sm text-ink-muted sm:grid-cols-3">
                {c.trust.map((item) => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}
              </ul>
            </div>

            <HeroShowcaseCarousel />
          </div>
        </section>

        <section className="bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold">{c.howTitle}</h2><p className="mt-3 text-ink-muted">{c.howLead}</p></div>
            <div className="mt-12 grid divide-y divide-surface-border md:grid-cols-3 md:divide-x md:divide-y-0">
              {c.steps.map(([title, body], index) => { const Icon = STEP_ICONS[index]; return <article key={title} className="py-8 first:pt-0 last:pb-0 md:px-10 md:py-2 md:first:pl-0 md:last:pr-0"><Icon className="h-7 w-7 text-role-admin" /><h3 className="mt-6 text-lg font-semibold">{title}</h3><p className="mt-3 max-w-sm text-sm leading-7 text-ink-muted">{body}</p></article>; })}
            </div>
          </div>
        </section>

        <section id="features" className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl"><h2 className="text-3xl font-bold">{c.featureTitle}</h2><p className="mt-3 text-ink-muted">{c.featureLead}</p></div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {c.cards.map(([title, body], index) => { const Icon = FEATURE_ICONS[index]; return <article key={title} className="group overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><img src={FEATURE_IMAGES[index]} alt={title} loading="lazy" decoding="async" className="h-52 w-full object-cover transition duration-500 group-hover:scale-[1.02]" /><div className="p-6"><Icon className="h-6 w-6 text-role-admin" /><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p></div></article>; })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center"><h2 className="text-3xl font-bold">{c.faqTitle}</h2><p className="mt-3 text-ink-muted">{c.faqLead}</p></div>
            <div className="mt-12 space-y-4">
              {c.faqs.map(([question, answer]) => <details key={question} className="group rounded-2xl border border-surface-border bg-surface-muted/40 px-6 py-5 shadow-sm sm:px-8 sm:py-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-semibold sm:text-lg"><span>{question}</span><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-role-admin/20 text-xl font-normal text-role-admin transition group-open:rotate-45">+</span></summary><p className="mt-4 max-w-3xl pr-10 text-sm leading-7 text-ink-muted sm:text-base">{answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="bg-sidebar py-16 text-white sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6"><h2 className="text-3xl font-bold">{c.ctaTitle}</h2><p className="mx-auto mt-4 max-w-2xl text-white/75">{c.ctaBody}</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/signup"><Button className="w-full justify-center bg-white px-6 py-3 !text-sidebar hover:bg-white/90 sm:w-auto">{c.primary}</Button></Link>{chatUrl && <a href={chatUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary" className="w-full justify-center border-white/30 bg-transparent px-6 py-3 !text-white hover:bg-white/10 sm:w-auto"><WhatsAppIcon className="h-5 w-5" />{c.chat}</Button></a>}</div></div>
        </section>
      </main>

      <footer className="bg-[#0B1220] py-14 text-white sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.35fr_.7fr_1fr_.8fr] lg:gap-16 lg:px-8">
          <section><RisipLogo className="h-12 w-auto text-role-admin" /><h2 className="mt-6 text-sm font-semibold uppercase tracking-[.16em] text-white/55">{c.footerAbout}</h2><p className="mt-4 max-w-sm text-sm leading-7 text-white/70">{c.footerAboutText}</p></section>
          <nav aria-label={c.features}><h2 className="text-sm font-semibold uppercase tracking-[.16em] text-white/55">{c.features}</h2><ul className="mt-5 space-y-3 text-sm"><li><a href="#features" className="text-white/75 transition hover:text-white">{c.features}</a></li><li><a href="#faq" className="text-white/75 transition hover:text-white">{c.footerFaq}</a></li><li><Link to="/login" className="text-white/75 transition hover:text-white">{c.login}</Link></li><li><Link to="/signup" className="text-white/75 transition hover:text-white">{c.primary}</Link></li></ul></nav>
          <section><h2 className="text-sm font-semibold uppercase tracking-[.16em] text-white/55">{c.footerContact}</h2><address className="mt-5 space-y-4 text-sm not-italic text-white/75"><p className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-role-admin" /><a className="break-all transition hover:text-white" href="mailto:reaganfraizer13@gmail.com">reaganfraizer13@gmail.com</a></p><p className="flex items-center gap-3"><Phone className="h-4 w-4 shrink-0 text-role-admin" /><a className="transition hover:text-white" href="tel:+255624107354">0624 107 354</a></p><p className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-role-admin" /><span>Mbezi Shule<br />Dar es Salaam, Tanzania</span></p></address></section>
          <section><h2 className="text-sm font-semibold uppercase tracking-[.16em] text-white/55">{c.footerFaq}</h2><p className="mt-5 text-sm leading-6 text-white/70">{c.footerFaqLink}</p>{chatUrl && <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#25D366]/35 px-4 py-2.5 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/10"><WhatsAppIcon className="h-5 w-5" />{c.chat}</a>}</section>
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 px-4 pt-7 text-xs text-white/45 sm:px-6 lg:px-8">© 2026 Risip. {c.footerRights}</div>
      </footer>
      <WhatsAppFloatingButton />
    </div>
  );
}

const SHOWCASE_LABELS = ['Barcode na bidhaa', 'Mauzo kupitia WhatsApp', 'Madeni kupitia WhatsApp'] as const;

function HeroShowcaseCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % SHOWCASE_LABELS.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      aria-label="Mifano ya Risip kwa barcode na WhatsApp"
      aria-roledescription="carousel"
      className="mx-auto min-w-0 w-full max-w-[38rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="overflow-hidden rounded-3xl shadow-2xl shadow-role-admin/10">
        <div
          className="flex min-w-0 transition-transform duration-700 ease-in-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          <div className="w-full min-w-0 shrink-0" aria-hidden={activeSlide !== 0}><BarcodeScannerDemo /></div>
          <div className="w-full min-w-0 shrink-0" aria-hidden={activeSlide !== 1}><WhatsAppSalesDemo /></div>
          <div className="w-full min-w-0 shrink-0" aria-hidden={activeSlide !== 2}><WhatsAppDebtDemo /></div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2" role="tablist" aria-label="Chagua mfano wa Risip">
        {SHOWCASE_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={activeSlide === index}
            aria-label={`Onyesha ${label}`}
            onClick={() => setActiveSlide(index)}
            className={`h-2.5 rounded-full transition-all duration-300 ${activeSlide === index ? 'w-8 bg-role-admin' : 'w-2.5 bg-ink-muted/25 hover:bg-ink-muted/50'}`}
          />
        ))}
      </div>
    </section>
  );
}

function BarcodeScannerDemo() {
  return (
    <article className="flex min-h-[480px] w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-surface-border bg-surface">
      <header className="flex items-center gap-3 border-b border-surface-border px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-role-admin/10 text-role-admin"><Barcode className="h-5 w-5" /></span>
        <div><h2 className="text-sm font-bold text-ink">Sajili bidhaa kwa barcode</h2><p className="mt-0.5 text-xs text-ink-muted">Scan, tambua na panga bidhaa haraka</p></div>
      </header>

      <div className="relative h-56 overflow-hidden bg-sidebar">
        <img src={landingProductsBarcode} alt="Kamera ikisoma barcode ya bidhaa" className="h-full w-full object-cover opacity-80" />
        <div className="absolute inset-6 rounded-2xl border-2 border-white/90">
          <span className="absolute left-3 right-3 top-1/2 h-0.5 bg-role-admin shadow-[0_0_12px_rgba(221,45,74,.9)]" />
          <span className="absolute left-3 top-3 h-6 w-6 border-l-4 border-t-4 border-white" />
          <span className="absolute right-3 top-3 h-6 w-6 border-r-4 border-t-4 border-white" />
          <span className="absolute bottom-3 left-3 h-6 w-6 border-b-4 border-l-4 border-white" />
          <span className="absolute bottom-3 right-3 h-6 w-6 border-b-4 border-r-4 border-white" />
        </div>
        <div className="absolute inset-x-4 bottom-3 rounded-full bg-black/65 px-3 py-2 text-center text-[11px] font-medium text-white sm:text-xs">Linganisha barcode ndani ya kisanduku</div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Barcode imesomwa</div>
        <div className="mt-4 rounded-2xl border border-surface-border bg-surface-muted/45 p-4">
          <div className="flex items-start justify-between gap-4"><div><p className="font-bold text-ink">Daftari A4</p><p className="mt-1 font-mono text-[11px] text-ink-muted">6161100252007</p></div><span className="rounded-full bg-role-admin/10 px-3 py-1 text-xs font-semibold text-role-admin">Bidhaa mpya</span></div>
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-xs"><div className="min-w-0"><p className="text-ink-muted">Bei ya kuuza</p><p className="mt-1 font-bold text-ink">TSh 2,500</p></div><div className="min-w-0 text-right"><p className="text-ink-muted">Stock</p><p className="mt-1 font-bold text-ink">48 pcs</p></div></div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted"><Check className="h-4 w-4 text-emerald-600" />Imeongezwa na kupangwa kwenye bidhaa zako</div>
      </div>
    </article>
  );
}

function WhatsAppHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-surface-border bg-surface px-5 py-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white"><WhatsAppIcon className="h-5 w-5" /></span>
      <div className="min-w-0"><h2 className="truncate text-sm font-bold text-ink">{title}</h2><p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted"><span className="h-2 w-2 rounded-full bg-[#25D366]" />Inapatikana</p></div>
    </header>
  );
}

function WhatsAppSalesDemo() {
  return (
    <article className="flex min-h-[480px] w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-surface-border bg-surface">
      <WhatsAppHeader title="Rekodi mauzo kupitia WhatsApp" />
      <div className="flex flex-1 flex-col gap-3 bg-[#EFEAE2] p-4 text-[13px] leading-relaxed">
        <ChatBubble side="user" time="10:10">Leo nimeuza daftari 10 kila moja 1,500 na kalamu 20 kila moja 500</ChatBubble>
        <ChatBubble side="risip" time="10:10"><strong>Nimeelewa mauzo:</strong><br />Daftari: 10 × TSh 1,500 = TSh 15,000<br />Kalamu: 20 × TSh 500 = TSh 10,000<br /><strong>Jumla: TSh 25,000</strong><br /><br />Jibu NDIYO kuthibitisha.</ChatBubble>
        <ChatBubble side="user" time="10:11">NDIYO</ChatBubble>
        <ChatBubble side="risip" time="10:11">Mauzo ya <strong>TSh 25,000</strong> yamerekodiwa na stock imesasishwa.</ChatBubble>
      </div>
      <DemoComposer text="Andika mauzo ya leo" />
    </article>
  );
}

function WhatsAppDebtDemo() {
  return (
    <article className="flex min-h-[480px] w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-surface-border bg-surface">
      <WhatsAppHeader title="Fuatilia madeni kupitia WhatsApp" />
      <div className="flex flex-1 flex-col gap-3 bg-[#EFEAE2] p-4 text-[13px] leading-relaxed">
        <ChatBubble side="user" time="14:20">Asha amechukua vitabu kwa mkopo TSh 24,000, atalipa Ijumaa</ChatBubble>
        <ChatBubble side="risip" time="14:20"><strong>Nimeelewa deni:</strong><br />Mteja: Asha<br />Kiasi: <strong>TSh 24,000</strong><br />Atalipa: Ijumaa<br /><br />Jibu NDIYO kuthibitisha.</ChatBubble>
        <ChatBubble side="user" time="14:21">NDIYO</ChatBubble>
        <ChatBubble side="risip" time="14:21">Deni la Asha limerekodiwa. Nitakusaidia kulifuatilia hadi litakapolipwa.</ChatBubble>
      </div>
      <DemoComposer text="Andika deni au malipo" />
    </article>
  );
}

function DemoComposer({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-surface-border bg-surface p-3">
      <div className="flex min-w-0 flex-1 items-center rounded-full bg-surface-muted px-4 py-2.5 text-xs text-ink-muted">{text}</div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white" aria-hidden="true"><Send className="h-4 w-4" /></span>
    </div>
  );
}

function ChatBubble({ side, time, children }: { side: 'user' | 'risip'; time: string; children: React.ReactNode }) {
  const isUser = side === 'user';
  return (
    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${isUser ? 'ml-auto rounded-tr-sm bg-[#D9FDD3]' : 'mr-auto rounded-tl-sm bg-white'}`}>
      <p className="text-ink">{children}</p>
      <p className="mt-1 text-right text-[10px] text-ink-muted/75">{time}</p>
    </div>
  );
}
