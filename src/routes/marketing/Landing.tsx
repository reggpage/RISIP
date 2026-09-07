import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import landingBucha from '@/assets/landing-bucha.jpg';
import landingCashFlow from '@/assets/landing-cash-flow.jpg';
import landingChat from '@/assets/landing-chat.jpeg';
import landingProductsBarcode from '@/assets/landing-products-barcode.jpg';
import landingRisipAi from '@/assets/landing-risip-ai.jpg';
import landingShop from '@/assets/landing-shop.jpg';
import landingWhatsApp from '@/assets/landing-whatsapp.jpg';
import Button from '@/components/ui/Button';
import LanguageToggle from '@/components/ui/LanguageToggle';
import RisipLogo from '@/components/ui/RisipLogo';
import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { buildRisipWhatsAppUrl } from '@/features/whatsapp/publicWhatsApp';
import { useAuth } from '@/lib/auth';
import { getLang } from '@/lib/lang';
import { BUCHA } from './landingDemo';
import { Bubble, ChatHeader, OperationsPreview, ProductHero, ProductStory, UnderstandingSection } from './ProductStory';
import './landing.css';

const COPY = {
  sw: {
    features: 'Uwezo', faqNav: 'Maswali', login: 'Ingia', start: 'Anza WhatsApp',
    eyebrow: 'Rekodi za mauzo na usimamizi wa biashara',
    hero: 'Rekodi biashara yako.', accent: 'Elewa pesa yako.',
    lead: 'Uza, hesabu bidhaa, rekodi mapato na matumizi, kisha uliza Risip kuhusu biashara yako moja kwa moja kupitia WhatsApp.',
    primary: 'Sajili biashara', secondary: 'Nina akaunti',
    howTitle: 'Biashara yako kwa hatua tatu rahisi',
    howLead: 'Risip inafuata kazi zako za kila siku bila kukulazimisha kujaza fomu ndefu.',
    steps: [
      ['Sajili biashara', 'Anza kupitia WhatsApp. Risip itakuuliza jina lako, jina la biashara na bidhaa unazouza.'],
      ['Rekodi kinachotokea', 'Scan barcode au andika mauzo, matumizi, madeni na malipo kwa lugha unayotumia kila siku.'],
      ['Pata majibu yaliyo wazi', 'Uliza kilichouza, bidhaa zilizobaki, pesa iliyoingia na matumizi ya biashara yako.'],
    ],
    featureTitle: 'Uza kwa urahisi. Elewa biashara yako.',
    featureLead: 'Risip inakuonyesha kilichouzwa, kilichobaki na pesa ilikoenda.',
    cards: [
      ['Bidhaa na barcode', 'Sajili bidhaa mara moja, scan kwa kamera, uza haraka na fuatilia bidhaa zilizobaki.'],
      ['Rekodi kupitia WhatsApp', 'Andika mauzo, matumizi, madeni na malipo bila kutumia maneno magumu ya uhasibu.'],
      ['Jua pesa ilikoenda', 'Tazama mauzo, matumizi, madeni na malipo katika sehemu zilizo wazi na rahisi kufuatilia.'],
      ['Uliza Risip kuhusu biashara', 'Pata majibu kutokana na mauzo, bidhaa, matumizi na malipo yaliyorekodiwa kwenye biashara yako.'],
    ],
    trust: ['Ingia bila password kupitia WhatsApp', 'Taarifa za biashara yako zinabaki salama', 'Unathibitisha kila rekodi ya pesa'],
    faqTitle: 'Maswali yanayoulizwa mara nyingi',
    faqLead: 'Majibu ya haraka kabla hujaanza kutumia Risip.',
    faqs: [
      ['Risip inafanya nini?', 'Risip inakusaidia kusajili bidhaa, kurekodi mauzo na matumizi, kufuatilia bidhaa, madeni na malipo, kisha kuuliza maswali kuhusu biashara yako kupitia WhatsApp.'],
      ['Ninasajilije biashara?', 'Bonyeza Sajili biashara, weka namba yako ya WhatsApp na ufuate maswali ya Risip. Hutahitaji email wala password.'],
      ['Ninaingiaje kwenye dashboard?', 'Weka namba yako kwenye ukurasa wa kuingia. Risip itakutumia link salama ya dakika 5 kupitia WhatsApp. Link inatumika mara moja tu.'],
      ['Naweza kutumia barcode?', 'Ndiyo. Unaweza kusajili bidhaa kwa barcode na kuitumia wakati wa kuuza ili bidhaa ipatikane haraka.'],
      ['Risip inaandika rekodi bila ruhusa yangu?', 'Hapana. Risip inakuonyesha ilichoelewa na inasubiri uthibitishe kabla ya kuhifadhi rekodi ya pesa.'],
      ['Naweza kuongeza wafanyakazi?', 'Ndiyo. Mmiliki anaweza kuwaalika wafanyakazi na kuwapa ruhusa zinazolingana na kazi zao.'],
    ],
    pricingNav: 'Bei',
    pricing: {
      title: 'Bei iliyo wazi, bila mafichoni',
      lead: 'Lipa kwa ujumbe unaotuma kwa Risip. Majibu ya Risip hayahesabiwi. Jaribu bure kwa wiki moja, bila kadi.',
      monthly: 'Kila mwezi', yearly: 'Kwa mwaka', save: 'okoa miezi 2',
      perMonth: 'kwa mwezi', perYear: 'kwa mwaka', msgs: 'ujumbe unaotuma, kwa mwezi',
      popular: 'Wengi huchagua', soon: 'hivi karibuni', cta: 'Anza wiki ya bure',
      note: 'Bei zote ni za Shilingi ya Tanzania. Malipo yanashughulikiwa na Snippe. Ukizidi ujumbe, unapata taarifa kwanza, na hakuna kinachokatika ghafla.',
      plans: [
        { name: 'Kianzio', tagline: 'Kuanza, kwa rekodi chache kila siku', m: '15,000', y: '150,000', cap: '100', popular: false,
          feats: ['Mauzo, manunuzi, matumizi na stoo', 'Bei mbili: rejareja na jumla', 'Ukumbusho wa kila jioni', 'Dashboard ya web kwa simu na kompyuta', 'Mtumiaji 1'] },
        { name: 'Ndogo', tagline: 'Duka moja, unayefanya mwenyewe', m: '29,999', y: '299,990', cap: '250', popular: false,
          feats: ['Mauzo, manunuzi, matumizi na stoo', 'Bei mbili: rejareja na jumla', 'Ukumbusho wa kila jioni', 'Dashboard ya web kwa simu na kompyuta', 'Mtumiaji 1'] },
        { name: 'Kati', tagline: 'Duka lenye wafanyakazi na madeni', m: '39,999', y: '399,990', cap: '450', popular: true,
          feats: ['Kila kitu cha Ndogo, pamoja na:', 'Ripoti za siku, wiki na mwezi', 'Madeni ya wateja na wasambazaji', 'Kuuza na kusajili kwa barcode', 'Faida kwa kila bidhaa', 'Watumiaji 3'] },
        { name: 'Kubwa', tagline: 'Maduka zaidi ya moja, au biashara ya jumla', m: '70,000', y: '700,000', cap: '650', popular: false,
          feats: ['Kila kitu cha Kati, pamoja na:', 'Maduka 3 kwenye namba moja', 'Kulinganisha maduka', 'Ankara za PDF__soon', 'Kutoa data: Excel, CSV, PDF', 'Watumiaji 10'] },
      ],
      compareTitle: 'Kulinganisha plan',
      cols: ['Kianzio', 'Ndogo', 'Kati', 'Kubwa'],
      soonLabel: 'Inakuja',
      compare: [
        ['Ujumbe unaotuma, kwa mwezi', '100', '250', '450', '650'],
        ['Watumiaji', '1', '1', '3', '10'],
        ['Maduka', '1', '1', '1', '3'],
        ['Rekodi za mauzo, manunuzi na stoo', true, true, true, true],
        ['Bei mbili: rejareja na jumla', true, true, true, true],
        ['Dashboard ya web', true, true, true, true],
        ['Ukumbusho wa kila jioni', true, true, true, true],
        ['Ripoti za siku, wiki na mwezi', false, false, true, true],
        ['Madeni ya wateja', false, false, true, true],
        ['Kuuza na kusajili kwa barcode', false, false, true, true],
        ['Faida kwa kila bidhaa', false, false, true, true],
        ['Kulinganisha maduka', false, false, false, true],
        ['Ankara za PDF', false, false, false, 'soon'],
        ['Kutoa data: Excel, CSV, PDF', true, true, true, true],
      ],
    },
    ctaTitle: 'Anza kuweka biashara yako sawa leo.',
    ctaBody: 'Hakuna password ya kukumbuka. Fungua WhatsApp, sajili biashara na uanze kurekodi.',
    bucha: {
      eyebrow: 'Bucha',
      title: 'Bucha unalo, Bossi?',
      lead: 'Usipate shida tena ya kugombana na wafanyakazi wako buchani. Risip itakusaidia kujua rekodi za mauzo ya nyama yoyote unayouza.',
      photoAlt: 'Bucha ya kisasa nchini Tanzania: mfanyabiashara akitumia simu yake kando ya friji zenye nyama.',
      photoCaption: 'Bucha \u00b7 kuuza kwa kilo, nusu na robo',
      steps: [
        ['Sajili kiasi ulichonunua', 'Mfano: nyama kilo 100. Unaandika mara moja tu, Risip inashika.'],
        ['Mfanyakazi anarekodi kila mauzo', 'Kila anachouza anaandika: kilo, nusu au robo. Hakuna kinachopotea.'],
        ['Uliza popote ulipo', 'Nenda kwenye mishe zako. Uliza nyama imebaki kiasi gani, Risip inakujibu kutokana na rekodi za mfanyakazi wako.'],
      ],
      chatLabel: 'Mfano wa mazungumzo',
      bought: 'nimenunua nyama ya ng\u2019ombe kilo 100',
      boughtReply: 'Sawa. Nyama ya ng\u2019ombe: kilo 100 zimeingia.',
      staffLabel: 'Mfanyakazi buchani',
      sold: 'nimeuza kilo 2 na nusu',
      soldReply: 'Nimeandika. Nyama ya ng\u2019ombe: kilo 2.5.',
      ownerLabel: 'Wewe, ukiwa nje',
      ask: 'nyama imebaki kiasi gani?',
      askReply: 'Imebaki kilo 63. Leo zimeuzwa kilo 37.',
      remaining: 'Zimebaki', sold_: 'Zimeuzwa leo', unit: 'kilo',
      lossTitle: 'Hakuna kinachopotea',
      loss: [
        'Kila kilo iliyotoka ina rekodi yake na muda wake',
        'Upotevu na uharibifu vinarekodiwa peke yake, si kama mauzo',
        'Nyama uliyochukua wewe mwenyewe inahesabiwa peke yake',
      ],
    },
    featureEyebrow: 'Uwezo wa Risip',
    carouselLabel: 'Uwezo wa Risip', prevCards: 'Kadi zilizotangulia', nextCards: 'Kadi zinazofuata', cardWord: 'Kadi',
    proofEyebrow: 'Mazungumzo halisi',
    proofTitle: 'Hii si picha ya mfano.',
    proofBody: 'Ni mazungumzo halisi ya Risip na duka linalotumia mfumo: orodha ya bidhaa zilizouzwa jana, idadi iliyobaki ya kitabu kimoja, na bidhaa inayouza zaidi mwezi huu. Maswali yaliulizwa kwa Kiswahili cha kawaida, bila menyu wala fomu.',
    proofAlt: 'Picha ya WhatsApp: mfanyabiashara anauliza orodha ya bidhaa zilizouzwa jana, idadi ya vitabu vilivyobaki na bidhaa inayouza zaidi, na Risip inajibu kwa Kiswahili.',
    proofCaption: 'WhatsApp · mazungumzo ya mteja wa Risip',
    trustTitle: 'Unabaki na udhibiti',
    ctaEyebrow: 'WhatsApp × Risip',
    skip: 'Nenda kwenye maudhui', navMain: 'Urambazaji mkuu', navSections: 'Sehemu za ukurasa',
    howNav: 'Inavyofanya kazi', stepsEyebrow: 'Anza kwa urahisi', yes: 'Ndiyo', no: 'Hapana',
    openMenu: 'Fungua menyu', closeMenu: 'Funga menyu',
    chat: 'Ongea na Risip', footerAbout: 'Kuhusu Risip', footerAboutText: 'Risip ni mfumo wa mauzo, bidhaa na rekodi rahisi za biashara kwa wajasiriamali wa Tanzania.',
    footerContact: 'Mawasiliano', footerFaq: 'Maswali', footerFaqLink: 'Soma maswali ya kawaida',
    footerRights: 'Haki zote zimehifadhiwa.',
  },
  en: {
    features: 'Features', faqNav: 'FAQ', login: 'Sign in', start: 'Start on WhatsApp',
    eyebrow: 'Sales records and business bookkeeping',
    hero: 'Record your business.', accent: 'Understand your money.',
    lead: 'Sell, count products, record income and expenses, then ask Risip about your business directly on WhatsApp.',
    primary: 'Register business', secondary: 'I have an account',
    howTitle: 'Your business in three simple steps',
    howLead: 'Risip follows the work you already do every day without making you fill in long forms.',
    steps: [
      ['Register the business', 'Start on WhatsApp. Risip asks for your name, business name and the products you sell.'],
      ['Record what happens', 'Scan a barcode or write sales, expenses, debts and payments in the language you use every day.'],
      ['Get clear answers', 'Ask what sold, what products are left, how much money came in and what the business spent.'],
    ],
    featureTitle: 'Sell easily. Understand your business.',
    featureLead: 'Risip shows you what sold, what remains and where the money went.',
    cards: [
      ['Products and barcodes', 'Register a product once, scan it with the camera, sell quickly and track the products left.'],
      ['Records through WhatsApp', 'Write sales, expenses, debts and payments without learning complicated accounting terms.'],
      ['Know where the money went', 'See sales, expenses, debts and payments in clear sections that are easy to follow.'],
      ['Ask Risip about your business', 'Get answers based on the sales, products, expenses and payments recorded for your business.'],
    ],
    trust: ['Passwordless WhatsApp sign in', 'Your business records stay private', 'You confirm every money record'],
    faqTitle: 'Frequently asked questions',
    faqLead: 'Quick answers before you start using Risip.',
    faqs: [
      ['What does Risip do?', 'Risip helps you register products, record sales and expenses, track products, debts and payments, then ask questions about your business on WhatsApp.'],
      ['How do I register my business?', 'Choose Register business, enter your WhatsApp number and follow the questions from Risip. You do not need an email address or password.'],
      ['How do I sign in to the dashboard?', 'Enter your number on the sign in page. Risip sends a secure five minute link on WhatsApp. The link works once.'],
      ['Can I use product barcodes?', 'Yes. You can register products with barcodes and scan them during a sale so they are found quickly.'],
      ['Can Risip save a record without my permission?', 'No. Risip shows what it understood and waits for your confirmation before it saves a money record.'],
      ['Can I add employees?', 'Yes. The owner can invite employees and give them permissions that match their work.'],
    ],
    pricingNav: 'Pricing',
    pricing: {
      title: 'Clear pricing, nothing hidden',
      lead: 'Pay for the messages you send to Risip. Replies from Risip are not counted. Try it free for a week, no card.',
      monthly: 'Monthly', yearly: 'Yearly', save: 'save 2 months',
      perMonth: 'per month', perYear: 'per year', msgs: 'messages you send, per month',
      popular: 'Most popular', soon: 'coming soon', cta: 'Start the free week',
      note: 'All prices are in Tanzanian Shillings. Payments are handled by Snippe. If you go over, you are told first, and nothing is cut off suddenly.',
      plans: [
        { name: 'Kianzio', tagline: 'Starting out, a few records a day', m: '15,000', y: '150,000', cap: '100', popular: false,
          feats: ['Sales, purchases, expenses and stock', 'Two prices: retail and wholesale', 'An evening reminder', 'Web dashboard on phone and computer', '1 user'] },
        { name: 'Ndogo', tagline: 'One shop, run by you', m: '29,999', y: '299,990', cap: '250', popular: false,
          feats: ['Sales, purchases, expenses and stock', 'Two prices: retail and wholesale', 'An evening reminder', 'Web dashboard on phone and computer', '1 user'] },
        { name: 'Kati', tagline: 'A shop with staff and customer debts', m: '39,999', y: '399,990', cap: '450', popular: true,
          feats: ['Everything in Ndogo, plus:', 'Daily, weekly and monthly reports', 'Customer and supplier debts', 'Sell and register by barcode', 'Profit per product', '3 users'] },
        { name: 'Kubwa', tagline: 'More than one shop, or wholesale', m: '70,000', y: '700,000', cap: '650', popular: false,
          feats: ['Everything in Kati, plus:', '3 shops on one number', 'Compare shops', 'PDF invoices__soon', 'Export data: Excel, CSV, PDF', '10 users'] },
      ],
      compareTitle: 'Compare plans',
      cols: ['Kianzio', 'Ndogo', 'Kati', 'Kubwa'],
      soonLabel: 'Coming soon',
      compare: [
        ['Messages you send, per month', '100', '250', '450', '650'],
        ['Users', '1', '1', '3', '10'],
        ['Shops', '1', '1', '1', '3'],
        ['Sales, purchases and stock records', true, true, true, true],
        ['Two prices: retail and wholesale', true, true, true, true],
        ['Web dashboard', true, true, true, true],
        ['An evening reminder', true, true, true, true],
        ['Daily, weekly and monthly reports', false, false, true, true],
        ['Customer debts', false, false, true, true],
        ['Sell and register by barcode', false, false, true, true],
        ['Profit per product', false, false, true, true],
        ['Compare shops', false, false, false, true],
        ['PDF invoices', false, false, false, 'soon'],
        ['Export data: Excel, CSV, PDF', true, true, true, true],
      ],
    },
    ctaTitle: 'Put your business records in order today.',
    ctaBody: 'There is no password to remember. Open WhatsApp, register your business and start recording.',
    bucha: {
      eyebrow: 'Butchery',
      title: 'You run a butchery, boss?',
      lead: 'No more arguing with your staff about what went out today. Risip keeps the record of every kilo of meat you sell.',
      photoAlt: 'A modern butchery in Tanzania: the owner using his phone beside the meat counters.',
      photoCaption: 'Butchery \u00b7 selling by kilo, half and quarter',
      steps: [
        ['Register what you bought', 'For example, 100 kilos of beef. You enter it once and Risip holds it.'],
        ['Your worker records every sale', 'Whatever leaves the counter he writes down: a kilo, a half, a quarter. Nothing goes missing.'],
        ['Ask from wherever you are', 'Go and do your rounds. Ask how much meat is left and Risip answers from what your worker recorded.'],
      ],
      chatLabel: 'Example conversation',
      bought: 'nimenunua nyama ya ng\u2019ombe kilo 100',
      boughtReply: 'Got it. Beef: 100 kilos in.',
      staffLabel: 'Your worker at the counter',
      sold: 'nimeuza kilo 2 na nusu',
      soldReply: 'Recorded. Beef: 2.5 kilos.',
      ownerLabel: 'You, out of the shop',
      ask: 'nyama imebaki kiasi gani?',
      askReply: '63 kilos left. 37 kilos sold today.',
      remaining: 'Left', sold_: 'Sold today', unit: 'kilo',
      lossTitle: 'Nothing goes missing',
      loss: [
        'Every kilo that left has its own record and its own time',
        'Spoilage and loss are recorded on their own, never as sales',
        'Meat you took yourself is counted separately',
      ],
    },
    featureEyebrow: 'What Risip does',
    carouselLabel: 'What Risip does', prevCards: 'Previous cards', nextCards: 'Next cards', cardWord: 'Card',
    proofEyebrow: 'A real conversation',
    proofTitle: 'This one is not a mock-up.',
    proofBody: 'A real Risip conversation with a shop that uses it: what sold yesterday, how many copies of one title are left, and what sells most this month. The questions were asked in everyday Kiswahili, with no menu and no form.',
    proofAlt: 'WhatsApp screenshot: a shopkeeper asks what sold yesterday, how many copies of a book are left and what sells most, and Risip answers in Kiswahili.',
    proofCaption: 'WhatsApp · a Risip customer conversation',
    trustTitle: 'You stay in control',
    ctaEyebrow: 'WhatsApp × Risip',
    skip: 'Skip to content', navMain: 'Main navigation', navSections: 'Page sections',
    howNav: 'How it works', stepsEyebrow: 'A simple start', yes: 'Yes', no: 'No',
    openMenu: 'Open menu', closeMenu: 'Close menu',
    chat: 'Chat with Risip', footerAbout: 'About Risip', footerAboutText: 'Risip is a simple sales, product and bookkeeping system made for Tanzanian entrepreneurs.',
    footerContact: 'Contact', footerFaq: 'FAQ', footerFaqLink: 'Read common questions',
    footerRights: 'All rights reserved.',
  },
} as const;


type Copy = (typeof COPY)['sw'] | (typeof COPY)['en'];

const CARD_IMAGES = [landingProductsBarcode, landingWhatsApp, landingCashFlow, landingRisipAi] as const;

/**
 * The four capability cards, as a carousel. The owner asked for this by name.
 *
 * It is a scroll-snap track, not a translated flexbox like the version it
 * replaces: a shopkeeper on a phone swipes a row of cards, and a transform
 * cannot be swiped. The arrows and dots move the same scrollLeft, so touch,
 * pointer and keyboard all drive one mechanism and the dots stay honest when
 * somebody scrolls the track by hand.
 *
 * It advances itself every four seconds and stops while a pointer or the
 * keyboard focus is inside it, so it never slides the card being read. Under
 * prefers-reduced-motion it does not advance at all, and it jumps rather than
 * glides when a control is used.
 */
function FeatureCarousel({ c }: { c: Copy }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [perView, setPerView] = useState(1);
  const [paused, setPaused] = useState(false);
  const cards = c.cards;
  // The last page is reached when the final card sits at the right edge, so a
  // short final page is never padded out with empty slots.
  const pages = Math.max(1, cards.length - perView + 1);
  const current = Math.min(index, pages - 1);

  const goTo = useCallback((next: number) => {
    const el = track.current;
    if (!el) return;
    const card = el.children[Math.max(0, Math.min(next, cards.length - 1))] as HTMLElement | undefined;
    if (!card) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: still ? 'auto' : 'smooth' });
  }, [cards.length]);

  // One source of truth for which card is showing: where the track is actually
  // scrolled to. A swipe then updates the dots for free.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const first = el.children[0] as HTMLElement | undefined;
      if (first) setPerView(Math.max(1, Math.round(el.clientWidth / first.offsetWidth)));
      let best = 0;
      let closest = Infinity;
      for (let i = 0; i < el.children.length; i += 1) {
        const child = el.children[i] as HTMLElement;
        const distance = Math.abs(child.offsetLeft - el.offsetLeft - el.scrollLeft);
        if (distance < closest) { closest = distance; best = i; }
      }
      setIndex(best);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    el.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); };
  }, []);

  useEffect(() => {
    if (paused || pages < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => goTo((current + 1) % pages), 4000);
    return () => window.clearTimeout(timer);
  }, [paused, pages, current, goTo]);

  return (
    <div
      className="rp-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
    >
      <div
        ref={track}
        className="rp-carousel-track"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={c.carouselLabel}
      >
        {cards.map(([title, body], i) => {
          return (
            <article key={title} className="rp-card">
              <div className="rp-card-visual">
                <img src={CARD_IMAGES[i]} alt="" loading="lazy" decoding="async" width="1200" height="800" />
                <span className="rp-card-index" aria-hidden="true">0{i + 1}</span>
              </div>
              <div className="rp-card-body">
                <h3>{title}</h3>
                <span className="rp-card-rule" aria-hidden="true" />
                <p>{body}</p>
              </div>
            </article>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="rp-carousel-controls">
          <button type="button" className="rp-carousel-arrow" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label={c.prevCards}>
            <ChevronLeft size={16} />
          </button>
          <div className="rp-carousel-dots">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === current}
                aria-label={[c.cardWord, i + 1].join(' ')}
              />
            ))}
          </div>
          <button type="button" className="rp-carousel-arrow" onClick={() => goTo(current + 1)} disabled={current === pages - 1} aria-label={c.nextCards}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The device, rendered rather than photographed.
 *
 * A drawn hand was tried here first and thrown away: flat vector skin beside
 * a glass screen reads as clipart, and the two available photographs of a real
 * hand do not work either. In one the phone faces away from the camera, and in
 * the other it is a 175 by 260 pixel region that would have to be doubled in
 * size to fill this slot. So the hand in this section is the one in the
 * photograph behind it, and the screen is shown on a device sharp enough to
 * actually read the conversation on.
 */
function PhoneShowcase({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="rp-showcase">
      <div aria-hidden="true" className="rp-showcase-glow" />
      <div className="rp-phone">
        <div className="rp-phone-frame">
          <span aria-hidden="true" className="rp-phone-button is-up" />
          <span aria-hidden="true" className="rp-phone-button is-down" />
          <span aria-hidden="true" className="rp-phone-button is-power" />
          <div className="rp-phone-screen">
            <img src={src} alt={alt} loading="lazy" decoding="async" width="500" height="1082" />
            <span aria-hidden="true" className="rp-phone-island" />
            <span aria-hidden="true" className="rp-phone-gloss" />
          </div>
        </div>
      </div>
      <figcaption className="rp-phone-caption">{caption}</figcaption>
    </figure>
  );
}

export default function Landing() {
  const auth = useAuth();
  const lang = getLang();
  const c = COPY[lang];
  const [yearly, setYearly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const chatUrl = buildRisipWhatsAppUrl('support', lang);

  // Escape closes it, and so does growing past the width that hides the
  // button: an open panel left behind on a resize is a panel nothing can
  // close. The body is locked while it is open so the page behind stays put.
  useEffect(() => {
    if (!menuOpen) return;
    const wide = window.matchMedia('(min-width: 960px)');
    const shut = () => setMenuOpen(false);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') shut(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    wide.addEventListener('change', shut);
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = previous;
      wide.removeEventListener('change', shut);
      window.removeEventListener('keydown', key);
    };
  }, [menuOpen]);
  if (auth.status === 'signed-in' && auth.profile) return <Navigate to="/dashboard" replace />;

  return (
    <div className="rp-landing" lang={lang}>
      <a href="#main-content" className="rp-skip">{c.skip}</a>
      <header className="rp-header" data-menu={menuOpen}>
        <div className="rp-wrap rp-header-inner">
          <Link to="/" aria-label="Risip" className="rp-header-logo"><RisipLogo /></Link>
          <nav className="rp-nav" aria-label={c.navMain}>
            <a href="#product-story" className="rp-nav-link">{c.howNav}</a>
            <a href="#features" className="rp-nav-link">{c.features}</a>
            <a href="#pricing" className="rp-nav-link">{c.pricingNav}</a>
            <a href="#faq" className="rp-nav-link">{c.faqNav}</a>
            <LanguageToggle />
            <Link to="/login" className="rp-nav-link">{c.login}</Link>
            <Link to="/signup" className="rp-nav-cta rp-button rp-button-red">{c.start}</Link>
          </nav>
          {/* One control on a phone instead of a row of links plus a second
              row underneath it. The bars are spans so they can be animated
              into the cross rather than swapped for a different icon. */}
          <button
            type="button"
            className="rp-burger"
            aria-label={menuOpen ? c.closeMenu : c.openMenu}
            aria-expanded={menuOpen}
            aria-controls="rp-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span /><span /><span />
          </button>
        </div>
        <div id="rp-menu" className="rp-menu" data-open={menuOpen} hidden={!menuOpen}>
          <nav className="rp-wrap" aria-label={c.navSections}>
            {([['#product-story', c.howNav], ['#features', c.features], ['#pricing', c.pricingNav], ['#faq', c.faqNav]] as const).map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <div className="rp-menu-foot">
              <LanguageToggle />
              <Link to="/login" onClick={() => setMenuOpen(false)}>{c.login}</Link>
            </div>
            <Link to="/signup" className="rp-button rp-button-red" onClick={() => setMenuOpen(false)}>{c.start}</Link>
          </nav>
        </div>
      </header>
      <main id="main-content">
        <ProductHero lang={lang} />
        <ProductStory lang={lang} />
        <UnderstandingSection lang={lang} />
        <section id="features" className="rp-features">
          <div className="rp-wrap">
            <div className="rp-section-head">
              <div><p className="rp-eyebrow">{c.featureEyebrow}</p><h2>{c.featureTitle}</h2></div>
              <p>{c.featureLead}</p>
            </div>
            <FeatureCarousel c={c} />
          </div>
        </section>
        <section className="rp-bucha">
          <div className="rp-wrap">
            <div className="rp-section-head">
              <div><p className="rp-eyebrow"><span className="rp-status-dot" />{c.bucha.eyebrow}</p><h2>{c.bucha.title}</h2></div>
              <p>{c.bucha.lead}</p>
            </div>

            <div className="rp-bucha-grid">
              <div className="rp-bucha-side">
                <ol className="rp-bucha-flow">
                  {c.bucha.steps.map(([title, body], i) => (
                    <li key={title}>
                      <span className="rp-bucha-step" aria-hidden="true">0{i + 1}</span>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </li>
                  ))}
                </ol>

                <figure className="rp-bucha-shot">
                  <img src={landingBucha} alt={c.bucha.photoAlt} loading="lazy" decoding="async" width="1408" height="768" />
                  <figcaption>{c.bucha.photoCaption}</figcaption>
                </figure>
              </div>

              {/* The same conversation UI as the rest of the page, because it is
                  the same conversation. Three beats: the meat arrives, the man at
                  the counter sells some, the owner asks from somewhere else. */}
              <div className="rp-bucha-chat">
                <div className="rp-demo-label"><span className="rp-status-dot" />{c.bucha.chatLabel}</div>
                <div className="rp-scene-chat">
                  <ChatHeader lang={lang} />
                  <div className="rp-chat-body">
                    <Bubble outgoing>{c.bucha.bought}</Bubble>
                    <Bubble>{c.bucha.boughtReply}</Bubble>

                    <p className="rp-bucha-who">{c.bucha.staffLabel}</p>
                    <Bubble outgoing>{c.bucha.sold}</Bubble>
                    <Bubble>{c.bucha.soldReply}</Bubble>

                    <p className="rp-bucha-who">{c.bucha.ownerLabel}</p>
                    <Bubble outgoing>{c.bucha.ask}</Bubble>
                    <Bubble>
                      <strong>{c.bucha.askReply}</strong>
                      <div className="rp-bucha-tally">
                        <div><small>{c.bucha.remaining}</small><b>{BUCHA.remaining} {c.bucha.unit}</b></div>
                        <div><small>{c.bucha.sold_}</small><b>{BUCHA.soldToday} {c.bucha.unit}</b></div>
                      </div>
                    </Bubble>
                  </div>
                </div>

                <div className="rp-bucha-loss">
                  <p>{c.bucha.lossTitle}</p>
                  <ul>{c.bucha.loss.map((item) => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="rp-steps">
          <div className="rp-wrap">
            <p className="rp-eyebrow">{c.stepsEyebrow}</p>
            <h2 className="mt-5">{c.howTitle}</h2>
            <ol>{c.steps.map(([title, body], index) => <li key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
          </div>
        </section>
        <section className="rp-proof">
          <img src={landingShop} alt="" className="rp-proof-photo" loading="lazy" decoding="async" width="1408" height="768" />
          <div className="rp-wrap rp-proof-grid">
            <div>
              <p className="rp-eyebrow"><span className="rp-status-dot" />{c.proofEyebrow}</p>
              <h2>{c.proofTitle}</h2>
              <p className="rp-proof-lead">{c.proofBody}</p>
              <div className="rp-trust">
                <p>{c.trustTitle}</p>
                <ul>{c.trust.map((item) => <li key={item}><ShieldCheck size={16} />{item}</li>)}</ul>
              </div>
            </div>
            <PhoneShowcase src={landingChat} alt={c.proofAlt} caption={c.proofCaption} />
          </div>
        </section>
        <OperationsPreview lang={lang} />
        <section id="pricing" className="rp-pricing">
          <div className="rp-wrap">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold text-balance">{c.pricing.title}</h2>
              <p className="mt-3 text-ink-muted">{c.pricing.lead}</p>
            </div>

            <div className="mt-8 flex justify-center">
              <div className="inline-flex rounded-full border border-ink/10 bg-white p-1" role="group">
                <button
                  type="button"
                  onClick={() => setYearly(false)}
                  aria-pressed={!yearly}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${!yearly ? 'bg-role-admin text-white shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                >{c.pricing.monthly}</button>
                <button
                  type="button"
                  onClick={() => setYearly(true)}
                  aria-pressed={yearly}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${yearly ? 'bg-role-admin text-white shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                >{c.pricing.yearly}<span className="ml-1.5 text-xs font-medium opacity-80">{c.pricing.save}</span></button>
              </div>
            </div>

            <div className="rp-plan-grid mt-12 grid sm:grid-cols-2 lg:grid-cols-4">
              {c.pricing.plans.map((plan) => {
                // The recommended plan is the one printed on the cover stock.
                const dark = plan.popular;
                return (
                <article
                  key={plan.name}
                  className={`rp-plan relative flex flex-col ${dark ? 'rp-plan-popular text-white' : 'border border-ink/10 bg-white'}`}
                >
                  {/* Sentence case, not shouted. "WENGI HUCHAGUA" in capitals
                      also wrapped onto two lines and pushed the card's heading
                      down; the badge is a label, not an announcement. */}
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-role-admin px-3 py-1 text-xs font-semibold text-white">
                      {c.pricing.popular}
                    </span>
                  )}
                  <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                  <p className={`mt-1 min-h-[2.5rem] text-sm ${dark ? 'text-white/55' : 'text-ink-muted'}`}>{plan.tagline}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className={`text-sm font-semibold ${dark ? 'text-white/55' : 'text-ink-muted'}`}>TSh</span>
                    <span className="rp-plan-price font-semibold tabular-nums tracking-tight">{yearly ? plan.y : plan.m}</span>
                  </div>
                  <p className={`mt-1 text-sm ${dark ? 'text-white/55' : 'text-ink-muted'}`}>{yearly ? c.pricing.perYear : c.pricing.perMonth}</p>
                  <div className={`mt-5 rounded-sm px-4 py-3 text-sm ${dark ? 'bg-white/10' : 'bg-white'}`}>
                    <span className={`font-bold tabular-nums ${dark ? 'text-white' : 'text-ink'}`}>{plan.cap}</span>
                    <span className={dark ? 'text-white/55' : 'text-ink-muted'}> {c.pricing.msgs}</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.feats.map((raw) => {
                      const soon = raw.endsWith('__soon');
                      const label = soon ? raw.slice(0, -6) : raw;
                      return (
                        <li key={raw} className="flex items-start gap-3 text-sm">
                          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? 'text-[#25D366]' : 'text-role-admin'}`} />
                          <span className={dark ? 'text-white/70' : 'text-ink-muted'}>
                            {label}
                            {soon && <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-semibold ${dark ? 'bg-white/15 text-white' : 'bg-role-admin/10 text-role-admin'}`}>{c.pricing.soon}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {dark ? (
                    <Link to="/signup" className="mt-8 flex h-12 items-center justify-center rounded-sm bg-role-admin px-4 text-sm font-semibold text-white transition hover:bg-role-admin/90">
                      {c.pricing.cta}
                    </Link>
                  ) : (
                    <Link to="/signup" className="mt-8">
                      <Button tint="admin" fullWidth variant="secondary" className="justify-center py-3">
                        {c.pricing.cta}
                      </Button>
                    </Link>
                  )}
                </article>
                );
              })}
            </div>

            <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-7 text-ink-muted">{c.pricing.note}</p>

            <details className="rp-comparison">
              <summary>{c.pricing.compareTitle}<ChevronDown size={16} /></summary>
              <div className="mt-6 overflow-x-auto rounded-sm border border-ink/10 bg-white shadow-sm">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-ink/10">
                      <th className="px-5 py-4" />
                      {c.pricing.cols.map((col) => (
                        <th key={col} className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-widest text-ink-muted">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.pricing.compare.map(([label, ...cells]) => (
                      <tr key={label as string} className="border-b border-ink/[.07] last:border-0">
                        <th scope="row" className="px-5 py-4 text-left font-normal text-ink">{label as string}</th>
                        {cells.map((cell, i) => (
                          <td key={i} className="px-5 py-4 text-center tabular-nums">
                            {cell === true ? (
                              <Check className="mx-auto h-5 w-5 text-role-admin" aria-label={c.yes} />
                            ) : cell === false ? (
                              <span aria-label={c.no} className="text-lg text-ink-muted/40">×</span>
                            ) : cell === 'soon' ? (
                              <span className="text-xs font-medium text-ink-muted">{c.pricing.soonLabel}</span>
                            ) : (
                              <span className="font-semibold text-ink">{cell as string}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>


        <section id="faq" className="rp-faq">
          <div className="rp-wrap rp-faq-grid">
            <div><h2>{c.faqTitle}</h2><p className="rp-faq-lead">{c.faqLead}</p></div>
            <div>{c.faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div>
          </div>
        </section>
        <section className="rp-final-cta">
          <img src={landingShop} alt="" className="rp-final-art" loading="lazy" width="1408" height="768" />
          <div className="rp-wrap">
            <p className="rp-eyebrow">{c.ctaEyebrow}</p>
            <h2 className="mt-5">{c.ctaTitle}</h2>
            <p>{c.ctaBody}</p>
            <div className="rp-hero-actions"><Link to="/signup" className="rp-button rp-button-red">{c.primary}</Link>{chatUrl && <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="rp-watch"><WhatsAppIcon className="h-5 w-5" />{c.chat}</a>}</div>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/10 bg-book py-14 text-white sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.35fr_.7fr_1fr_.8fr] lg:gap-16 lg:px-8">
          <section><RisipLogo className="h-10 w-auto text-role-admin" /><h2 className="mt-6 text-base font-semibold text-white/90">{c.footerAbout}</h2><p className="mt-4 max-w-sm text-sm leading-7 text-white/70">{c.footerAboutText}</p></section>
          <nav aria-label={c.features}><h2 className="text-base font-semibold text-white/90">{c.features}</h2><ul className="mt-5 space-y-3 text-sm"><li><a href="#features" className="text-white/75 transition hover:text-white">{c.features}</a></li><li><a href="#faq" className="text-white/75 transition hover:text-white">{c.footerFaq}</a></li><li><Link to="/login" className="text-white/75 transition hover:text-white">{c.login}</Link></li><li><Link to="/signup" className="text-white/75 transition hover:text-white">{c.primary}</Link></li></ul></nav>
          <section><h2 className="text-base font-semibold text-white/90">{c.footerContact}</h2><address className="mt-5 space-y-4 text-sm not-italic text-white/75"><p className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-role-admin" /><a className="break-all transition hover:text-white" href="mailto:reaganfraizer13@gmail.com">reaganfraizer13@gmail.com</a></p><p className="flex items-center gap-3"><Phone className="h-4 w-4 shrink-0 text-role-admin" /><a className="transition hover:text-white" href="tel:+255624107354">0624 107 354</a></p><p className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-role-admin" /><span>Mbezi Shule<br />Dar es Salaam, Tanzania</span></p></address></section>
          <section><h2 className="text-base font-semibold text-white/90">{c.footerFaq}</h2><p className="mt-5 text-sm leading-6 text-white/70">{c.footerFaqLink}</p>{chatUrl && <a href={chatUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#25D366]/35 px-4 py-2.5 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/10"><WhatsAppIcon className="h-5 w-5" />{c.chat}</a>}</section>
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-col items-start gap-4 border-t border-white/10 px-4 pt-7 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span>© 2026 Risip. {c.footerRights}</span><LanguageToggle /></div>
      </footer>

    </div>
  );
}
