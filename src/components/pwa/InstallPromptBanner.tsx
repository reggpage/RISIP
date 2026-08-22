import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import RisipLogo from '@/components/ui/RisipLogo';
import { getLang } from '@/lib/lang';

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

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const updateStandalone = () => {
      const installed = isStandalone();
      setStandalone(installed);
      if (installed) setDeferredPrompt(null);
    };
    const capturePrompt = (event: Event) => {
      // Suppress Chrome's mini-infobar. Risip presents the invitation only when
      // the app is installable and the user is ready to act on it.
      event.preventDefault();
      if (!isStandalone()) setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const installed = () => {
      setStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    displayMode?.addEventListener?.('change', updateStandalone);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
      displayMode?.removeEventListener?.('change', updateStandalone);
    };
  }, []);

  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt || standalone || installing) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
        setDeferredPrompt(null);
      }
    } catch {
      // The browser can withdraw an install prompt if eligibility changes.
      // There is nothing for the user to recover; a future event can show it.
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  return {
    canInstall: !standalone && deferredPrompt !== null,
    installing,
    install,
    dismiss: () => setDeferredPrompt(null),
  };
}

export default function InstallPromptBanner() {
  const { canInstall, dismiss, install, installing } = useInstallPrompt();
  const sw = getLang() === 'sw';
  if (!canInstall) return null;

  return (
    <aside
      role="dialog"
      aria-label={sw ? 'Sakinisha programu ya Risip' : 'Install Risip App'}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-surface-border bg-white p-3 shadow-2xl sm:left-auto sm:right-4 sm:mx-0"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DD2D4A] text-white">
        <RisipLogo className="h-8 w-8" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{sw ? 'Weka Risip kwenye simu' : 'Install Risip App'}</p>
        <p className="text-xs text-ink-muted">
          {sw ? 'Ifungue haraka kama app ya kawaida.' : 'Open it quickly like a regular app.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        disabled={installing}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#DD2D4A] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#C92643] focus:outline-none focus:ring-2 focus:ring-[#DD2D4A] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        <Download className="h-4 w-4" aria-hidden />
        {installing
          ? (sw ? 'Inafungua…' : 'Opening…')
          : (sw ? 'Sakinisha Risip' : 'Install Risip App')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={sw ? 'Funga ujumbe wa kusakinisha' : 'Dismiss install prompt'}
        className="absolute -right-1 -top-2 rounded-full border border-surface-border bg-white p-1 text-ink-muted shadow-sm transition hover:text-ink focus:outline-none focus:ring-2 focus:ring-[#DD2D4A]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  );
}
