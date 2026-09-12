import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LanguageToggle from '@/components/ui/LanguageToggle';
import RisipLogo from '@/components/ui/RisipLogo';
import { getLang } from '@/lib/lang';
import { isNative } from '@/lib/native';
import '@/routes/auth/auth.css';

const COPY = {
  sw: { home: 'Rudi mwanzo', nav: 'Urambazaji mkuu' },
  en: { home: 'Back to home', nav: 'Main navigation' },
} as const;

/**
 * Shared frame for WhatsApp passwordless sign-in and business registration.
 *
 * Same paper, same dark bar and same brand red as the landing page, so
 * arriving here does not read as a different site. The tokens are the ones in
 * :root that landing.css uses; nothing is redefined locally.
 *
 * The logo goes home and so does the link beside it. Somebody who opened
 * /signup from a search result and wants to read about Risip first should not
 * have to reach for the back button.
 */
export default function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const lang = getLang();
  const c = COPY[lang];

  return (
    <div className="rp-auth" lang={lang}>
      {!isNative() && (
        <header className="rp-auth-header">
          <div className="rp-auth-header-inner">
            <Link to="/" className="rp-auth-logo" aria-label="Risip">
              <RisipLogo />
            </Link>
            <nav className="rp-auth-header-side" aria-label={c.nav}>
              <Link to="/" className="rp-auth-home">
                <ArrowLeft size={15} aria-hidden="true" />
                <span>{c.home}</span>
              </Link>
              <LanguageToggle />
              {footer}
            </nav>
          </div>
        </header>
      )}

      <main className="rp-auth-main">
        <div className="rp-auth-app">
          {isNative() && (
            <Link to="/" className="rp-auth-app-logo" aria-label="Risip">
              <RisipLogo />
            </Link>
          )}
          <div className="rp-auth-card">{children}</div>
        </div>
      </main>
    </div>
  );
}
