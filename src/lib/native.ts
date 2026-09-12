// Detects whether the app is running inside the native Capacitor WebView
// (installed Android/iOS app) versus a plain browser tab.

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** True when the current runtime is the Capacitor native shell. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Absolute origin for same-origin web API calls. Inside the native shell the
 * WebView origin is `https://localhost`, so a relative `fetch('/api/...')`
 * would hit the device itself instead of the Risip backend.
 */
export const NATIVE_API_ORIGIN = 'https://risip.online';

/** Resolve a web-relative path to a working URL in the current runtime. */
export function apiUrl(path: `/${string}`): string {
  return isNative() ? `${NATIVE_API_ORIGIN}${path}` : path;
}

/** Style the OS status bar so it blends with the Risip red on the app shell screen. */
export async function applyNativeStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#DD2D4A' });
  } catch {
    // Status bar theming is cosmetic; ignore failures.
  }
}

/** Light haptic tick for taps in the installed app — feels native without shouting. */
export async function nativeTapFeedback(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics are optional; ignore failures on devices that lack a motor.
  }
}

/**
 * Toggles `keyboard-open` on <html> and keeps `--vvh` (the visible band
 * height) in sync whenever the soft keyboard appears in the installed app.
 *
 * Under `adjustNothing` no resize signal fires on some firmwares — not from
 * visualViewport, the Keyboard plugin, nor window insets.  We combine three
 * layers of detection:
 *   1. MainActivity polls `InputMethodManager.isAcceptingText()` and
 *      dispatches a `risip:keyboard` event with the boolean.
 *   2. On the web side, `focusin`/`focusout` on input elements toggles the
 *      class and estimates the band from `visualViewport` if it shrinks, or
 *      falls back to a 40% keyboard-height estimate (Gboard typical).
 *   3. The Capacitor Keyboard plugin's own show/hide events, for firmwares
 *      where they fire.
 *
 * Returns a dispose function (the listener promise may still be in flight).
 */
export function wireNativeKeyboard(): () => void {
  if (!isNative()) return () => {};
  let disposed = false;
  const html = document.documentElement;
  const KLASS = 'keyboard-open';
  let active = false;

  const setVvh = (px: number | null) => {
    if (disposed) return;
    if (px == null) {
      html.style.removeProperty('--vvh');
    } else {
      html.style.setProperty('--vvh', `${Math.max(0, Math.round(px))}px`);
    }
  };

  /** Estimate the visible band when the keyboard is up. */
  const estimateBand = (): number => {
    // visualViewport.height is the ground truth when it shrinks.
    const vv = window.visualViewport;
    if (vv && vv.height < window.innerHeight - 60) return Math.round(vv.height);
    // Fallback: Gboard is typically ~40 % of viewport.
    return Math.round(window.innerHeight * 0.6);
  };

  const show = () => {
    if (active) return;
    active = true;
    html.classList.add(KLASS);
    setVvh(estimateBand());
    window.scrollTo(0, 0);
  };
  const hide = () => {
    if (!active) return;
    active = false;
    html.classList.remove(KLASS);
    setVvh(null);
  };

  // --- Layer 1: native poller (WindowInsets → shown boolean + height) ---
  const onNative = (e: Event) => {
    if (disposed) return;
    const { shown, heightPx } = (e as CustomEvent<{ shown: boolean; heightPx: number }>).detail ?? {};
    if (shown === undefined) return;
    if (shown) {
      active = true;
      html.classList.add(KLASS);
      // heightPx is the true keyboard height in physical pixels. Convert to CSS
      // and subtract from the (full) layout viewport to get the visible band,
      // minus whatever of the top of the viewport the shell doesn't occupy
      // (safe-area padding pushes the shell-col down).
      const kbCss = (heightPx || 0) / (window.devicePixelRatio || 1);
      const bodyOffset = window.document.body?.getBoundingClientRect().top || 0;
      setVvh(kbCss > 0 ? Math.round(window.innerHeight - kbCss - bodyOffset) : estimateBand());
      window.scrollTo(0, 0);
    } else {
      active = false;
      html.classList.remove(KLASS);
      setVvh(null);
    }
  };
  window.addEventListener('risip:keyboard', onNative);

  // --- Layer 2: web-side focus detection (works universally) ---
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  const onFocusIn = (e: FocusEvent) => {
    if (disposed) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      clearTimeout(blurTimer);
      setTimeout(show, 250);
    }
  };
  const onFocusOut = () => {
    if (disposed) return;
    blurTimer = setTimeout(() => {
      const t = document.activeElement;
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT' && !(t as HTMLElement).isContentEditable)) {
        hide();
      }
    }, 150);
  };
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);

  // --- Layer 3: Capacitor Keyboard plugin (fires on some devices) ---
  void import('@capacitor/keyboard').then(({ Keyboard }) => {
    if (disposed) return;
    Keyboard.addListener('keyboardDidShow', (info) => {
      active = true;
      html.classList.add(KLASS);
      const vv = window.visualViewport;
      setVvh(vv?.height ?? info.keyboardHeight);
      window.scrollTo(0, 0);
    });
    Keyboard.addListener('keyboardDidHide', () => {
      active = false;
      html.classList.remove(KLASS);
      setVvh(null);
    });
  });

  return () => {
    disposed = true;
    window.removeEventListener('risip:keyboard', onNative);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
  };
}