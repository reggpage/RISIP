import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative } from '@/lib/native';

/**
 * Routes Android App Links back into the SPA. WhatsApp login links point at
 * `https://risip.online/wa-login?t=<token>`; when the installed app claims
 * that link (verified App Links), it must land on the matching SPA route so
 * the token gets spent and a session is minted — not on the marketing site.
 */
export default function AppDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;
    let disposed = false;

    void import('@capacitor/app').then(({ App }) => {
      if (disposed) return;
      App.addListener('appUrlOpen', ({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.pathname === '/wa-login') {
            navigate(`/wa-login${parsed.search}`);
          }
        } catch {
          // Unknown launch URLs are ignored; the app just shows its normal entry.
        }
      });
    });

    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}