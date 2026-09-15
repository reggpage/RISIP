import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import RisipLogo from '@/components/ui/RisipLogo';
import { getLang } from '@/lib/lang';
import { isNative } from '@/lib/native';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // iOS Safari exposes standalone through navigator rather than matchMedia.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

const DISMISSED_KEY = 'risip:install-prompt-dismissed-at';
const DISMISS_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days before asking again

function hasDismissedRecently(): boolean {
  try {
    const saved = Number(localStorage.getItem(DISMISSED_KEY));
    if (!saved) return false;
    return Date.now() - saved < DISMISS_TTL;
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Private browsing can deny storage; failing to remember only re-asks later.
  }
}

export default function InstallPromptBanner() {
  const sw = getLang() === 'sw';
  const [seen, setSeen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  // After a short beat the first time a web visitor lands, offer the app. The
  // installed app itself and a screen that is already running as a PWA get
  // straight into the product instead. iOS Safari has no install API, so those
  // users get explicit Add-to-Home-Screen steps instead of a dead "Install".
  useEffect(() => {
    if (isNative() || isStandalone() || hasDismissedRecently()) return;

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const installed = () => setSeen(true);

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);

    const t = window.setTimeout(() => setSeen(true), 1200);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (!seen) return null;

  const c = sw ? {
    badge: 'App ya Risip',
    title: 'Weka Risip kwenye simu',
    body: 'Fungua paneli yako papo hapo kama app — bila kupita katika browser, bila kupakia tena. Endapo utasakinisha kutoka Play Store hapo baadaye, data na akaunti yako hubaki pale pale.',
    android: 'Sakinisha sasa',
    iosStep: 'Bonyeza ikoni ya Kushiriki (Share) chini ya skrini, kisha teua',
    iosAdd: 'Add to Home Screen',
    later: 'Nyaraka — labda baadaye',
    installing: 'Inafungua usakinishaji…',
  } : {
    badge: 'Risip App',
    title: 'Install Risip on your phone',
    body: 'Open your dashboard instantly like a regular app — no browser tab, no reloads. If you install from the Play Store later, your data and account stay exactly the same.',
    android: 'Install now',
    iosStep: 'Tap the Share icon at the bottom of the screen, then choose',
    iosAdd: 'Add to Home Screen',
    later: 'Not now — maybe later',
    installing: 'Opening the installer…',
  };

  const dismiss = () => {
    setSeen(false);
    rememberDismissed();
  };

  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt || installing) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        setSeen(false);
        rememberDismissed();
      } else {
        setDeferredPrompt(null);
      }
    } catch {
      // Eligibility can change mid-flow; fall back to asking again later.
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={c.title}
      className="fixed inset-0 z-[80] grid place-items-center p-4"
      style={{ background: 'rgba(42, 25, 34, 0.42)' }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-surface-border bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DD2D4A]/10 px-3 py-1 text-xs font-semibold text-[#DD2D4A]">
            <RisipLogo className="h-4 w-4" aria-hidden />
            {c.badge}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={c.later}
            className="rounded-full p-1.5 text-ink-muted transition hover:bg-surface-border hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <h2 className="mb-1.5 text-lg font-semibold text-ink">{c.title}</h2>
        <p className="mb-5 text-sm leading-relaxed text-ink-muted">{c.body}</p>

        {isIos() ? (
          <ol className="mb-5 space-y-2.5 text-sm text-ink">
            <li className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-border">
                <Share className="h-4 w-4 text-ink-muted" aria-hidden />
              </span>
              {c.iosStep}
            </li>
            <li className="flex items-center gap-2.5 font-medium text-[#DD2D4A]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-border">
                <Download className="h-4 w-4 text-ink-muted" aria-hidden />
              </span>
              {c.iosAdd}
            </li>
          </ol>
        ) : (
          <button
            type="button"
            onClick={() => void install()}
            disabled={!deferredPrompt || installing}
            className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#DD2D4A] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#C92643] focus:outline-none focus:ring-2 focus:ring-[#DD2D4A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${installing ? 'animate-pulse' : ''}`} aria-hidden />
            {installing ? c.installing : c.android}
          </button>
        )}

        <button type="button" onClick={dismiss} className="w-full text-center text-xs text-ink-muted transition hover:text-ink">
          {c.later}
        </button>
      </div>
    </div>
  );
}