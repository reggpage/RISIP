import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Printer } from 'lucide-react';
import RisipLogo from '@/components/ui/RisipLogo';
import { getLang } from '@/lib/lang';
import { legalEnglish, legalSwahili } from '@/i18n/legal';
import { legalDocuments, LEGAL_VERSION, LEGAL_CONTACT, type LegalKind } from '../../../supabase/functions/_shared/risipLegal';
import './legal.css';

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const [lang, setLang] = useState(getLang());
  const c = lang === 'sw' ? legalSwahili : legalEnglish;
  const doc = legalDocuments[lang][kind];
  return <div className="legal-page" lang={lang}>
    <header className="legal-nav"><Link to="/" aria-label={c.home}><RisipLogo /></Link><div><select aria-label={c.language} value={lang} onChange={(e) => setLang(e.target.value as 'sw' | 'en')}><option value="sw">Kiswahili</option><option value="en">English</option></select><Link to="/"><ArrowLeft size={15} />{c.home}</Link></div></header>
    <main><div className="legal-intro"><span className="legal-eyebrow">{c.label}</span><h1>{doc.title}</h1><p>{doc.lead}</p><div className="legal-meta"><span>{c.version} {LEGAL_VERSION}</span><button onClick={() => window.print()}><Printer size={14} />{c.print}</button></div></div>
      <nav className="legal-tabs" aria-label={c.contents}><Link aria-current={kind === 'terms' ? 'page' : undefined} to="/terms">{c.terms}</Link><Link aria-current={kind === 'privacy' ? 'page' : undefined} to="/privacy">{c.privacy}</Link></nav>
      <div className="legal-layout"><aside className="legal-toc"><span>{c.contents}</span>{doc.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</aside>
        <article key={kind}>{doc.sections.map((section) => <section key={section.id} id={section.id}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
          <footer className="legal-contact"><h2>{c.contact}</h2><p>{c.contactBody}</p><a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}<ArrowUpRight size={17} /></a></footer>
        </article></div>
    </main><footer className="legal-bottom"><RisipLogo /><span>© {new Date().getFullYear()} Risip</span></footer>
  </div>;
}
