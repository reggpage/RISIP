import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AT_BOTTOM, createFollow, distanceFromBottom, type Follow } from './followBottom';

/**
 * The React end of `followBottom`: it owns the two refs, the "back to latest"
 * button's state, and the observer that reports growth no render tells us
 * about. Every decision about when to follow lives in the plain module next to
 * it, where it can be driven and checked.
 */

export { AT_BOTTOM, distanceFromBottom };

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
  /** Stop following, for a deliberate jump to an older message. */
  stopFollowing: () => void;
  /** Whether to offer the "back to latest" button. */
  showLatest: boolean;
  setShowLatest: (value: boolean) => void;
};

export function useFollowBottom(): FollowBottom {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showLatest, setShowLatest] = useState(false);

  const follow: Follow = useMemo(() => createFollow({
    el: () => ref.current,
    showLatest: setShowLatest,
    // A hidden tab gets no animation frames, so a tween there would stop
    // partway and stay there.
    instantOnly: () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
      || (typeof document !== 'undefined' && document.hidden),
  }), []);

  useEffect(() => () => follow.dispose(), [follow]);

  const onScroll = useCallback(() => follow.onScroll(), [follow]);
  const grow = useCallback(() => follow.grow(), [follow]);
  const goToLatest = useCallback(() => follow.goToLatest(), [follow]);
  const followNow = useCallback(() => follow.followNow(), [follow]);
  const stopFollowing = useCallback(() => follow.stopFollowing(), [follow]);

  // Growth no render frame reports: a picture finishing, a font landing, the
  // working indicator giving way to the reply.
  useEffect(() => {
    const box = contentRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => follow.grow());
    observer.observe(box);
    return () => observer.disconnect();
  }, [follow]);

  return { ref, contentRef, onScroll, grow, goToLatest, followNow, stopFollowing, showLatest, setShowLatest };
}
