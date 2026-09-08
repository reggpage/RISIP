import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeping a thread pinned to its newest message, the way ChatGPT and Claude do.
 *
 * The rule is one sentence: follow the end unless the reader has moved away
 * from it. Sending always brings them back, because they just added the thing
 * at the end.
 *
 * It lives in its own module so the behaviour can be driven and checked
 * directly. The chat page itself needs a signed-in WhatsApp session to reach,
 * which makes the behaviour there awkward to exercise.
 */

/** Past this many pixels from the end, the reader is looking at something else. */
export const AT_BOTTOM = 120;

export function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

export type FollowBottom = {
  /** Put this on the scrolling element. */
  ref: React.RefObject<HTMLDivElement>;
  /** Put this on the element that grows inside it. */
  contentRef: React.RefObject<HTMLDivElement>;
  /** The scrolling element's onScroll. */
  onScroll: () => void;
  /** Call whenever the thread got taller, including every frame of a reply being written. */
  grow: () => void;
  /** Jump to the newest message and start following again. */
  goToLatest: () => void;
  /** Sending: return to the end wherever the reader was. */
  followNow: () => void;
  /**
   * Stop following, for a deliberate jump to an older message. Without this a
   * jump would be undone by the next thing that made the thread taller.
   */
  stopFollowing: () => void;
  /** Whether to offer the "back to latest" button. */
  showLatest: boolean;
  setShowLatest: (value: boolean) => void;
};

export function useFollowBottom(): FollowBottom {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  const animation = useRef(0);

  /**
   * MEASURED: `scrollTo({ behavior: 'smooth' })` moved this container zero
   * pixels and reported no error, so "back to latest" silently did nothing.
   * The tween is written by hand for that reason, and because the end of the
   * thread keeps moving while a reply is being written: the target is read on
   * every frame rather than fixed when the scroll starts.
   */
  const toBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(animation.current);
    const end = () => el.scrollHeight - el.clientHeight;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Instant while a reply is being written: an eased scroll restarted on
    // every character never arrives, and on a phone it stutters.
    //
    // Also instant when the page is not being looked at: a hidden tab gets no
    // animation frames, so a tween there would stop partway and stay there.
    if (!smooth || reduce || (typeof document !== 'undefined' && document.hidden)) {
      el.scrollTop = end();
      return;
    }
    const from = el.scrollTop, started = performance.now(), duration = 260;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      el.scrollTop = from + (end() - from) * eased;
      if (progress < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const grow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (following.current) { toBottom(); setShowLatest(false); return; }
    setShowLatest(distanceFromBottom(el) > AT_BOTTOM);
  }, [toBottom]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = distanceFromBottom(el);
    following.current = distance <= AT_BOTTOM;
    setShowLatest(distance > AT_BOTTOM);
  }, []);

  const goToLatest = useCallback(() => {
    following.current = true;
    toBottom(true);
    setShowLatest(false);
  }, [toBottom]);

  const followNow = useCallback(() => {
    following.current = true;
    setShowLatest(false);
    requestAnimationFrame(() => toBottom(true));
  }, [toBottom]);

  // Growth no reveal frame reports: a picture finishing, a font landing, the
  // working indicator giving way to the reply.
  useEffect(() => {
    const box = contentRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (following.current) toBottom(); });
    observer.observe(box);
    return () => observer.disconnect();
  }, [toBottom]);

  const stopFollowing = useCallback(() => { following.current = false; setShowLatest(true); }, []);

  return { ref, contentRef, onScroll, grow, goToLatest, followNow, stopFollowing, showLatest, setShowLatest };
}
