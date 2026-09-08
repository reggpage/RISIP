import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getLang } from '@/lib/lang';
import { legalEnglish, legalSwahili } from '@/i18n/legal';
import { legalDocuments, LEGAL_VERSION, LEGAL_CONTACT, type LegalKind } from '../../../supabase/functions/_shared/risipLegal';

/**
 * The terms and the privacy notice, shown in place instead of on their own
 * page. Someone accepting an agreement should not have to leave the accept
 * screen to read what they are accepting, then find their way back. The full
 * text is the SAME source LegalPage renders (legalDocuments), so the two can
 * never drift apart.
 */
export default function LegalModal({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  const c = getLang() === 'sw' ? legalSwahili : legalEnglish;
  const lang = getLang();
  const doc = legalDocuments[lang][kind];
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and the close button takes focus so a keyboard user is not
  // stranded on the page behind the dialog.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Nothing behind the dialog should scroll while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  return (
    <div className="legal-modal-scrim" onClick={onClose} role="presentation">
      <div
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        lang={lang}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="legal-modal-head">
          <h2>{doc.title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={lang === 'sw' ? 'Funga' : 'Close'}>
            <X size={18} />
          </button>
        </header>
        <div className="legal-modal-body">
          <p className="legal-modal-lead">{doc.lead}</p>
          <p className="legal-modal-version">{c.version} {LEGAL_VERSION}</p>
          {doc.sections.map((section) => (
            <section key={section.id}>
              <h3>{section.title}</h3>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <p className="legal-modal-contact">
            {c.contact} <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
