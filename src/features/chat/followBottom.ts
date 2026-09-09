/**
 * Keeping a thread pinned to its newest message, the way ChatGPT and Claude do.
 *
 * The rule is one sentence: follow the end unless the reader has moved away
 * from it. Sending always brings them back, because they just added the thing
 * at the end.
 *
 * This is plain machinery with no React in it, driven through a small element
 * shape, so the behaviour can be exercised directly. The chat page itself
 * needs a signed-in WhatsApp session to reach, which makes the behaviour there
 * awkward to check by hand, and it was wrong for a fortnight without anyone
 * being able to say why.
 */

/** Past this many pixels from the end, the reader is looking at something else. */
export const AT_BOTTOM = 120;

/**
 * How far the browser may land from the position we asked for and still count
 * as our own scrolling. Sub-pixel zoom and fractional line heights make an
 * exact match too strict.
 */
export const SELF_SLACK = 2;

/** All this needs of the scrolling element, so a test can supply one. */
export type Scroller = { scrollTop: number; scrollHeight: number; clientHeight: number };

export function distanceFromBottom(el: Scroller): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

export type FollowOptions = {
  el: () => Scroller | null;
  /** Whether to offer the "back to latest" button. */
  showLatest: (show: boolean) => void;
  now?: () => number;
  raf?: (step: (time: number) => void) => number;
  cancelRaf?: (handle: number) => void;
  /** Skip the eased scroll: reduced motion, or a tab nobody is looking at. */
  instantOnly?: () => boolean;
};

export function createFollow(options: FollowOptions) {
  const now = options.now ?? (() => performance.now());
  const raf = options.raf ?? ((step) => requestAnimationFrame(step));
  const cancelRaf = options.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
  const instantOnly = options.instantOnly ?? (() => false);

  let following = true;
  let animation = 0;
  /**
   * Where we last put the thread ourselves.
   *
   * MEASURED, and the reason following looked broken: every scroll we perform
   * fires a scroll event, and partway through an eased scroll the thread IS
   * far from the end. onScroll read that as the reader moving away and
   * switched following off, so nothing followed the reply. Sending scrolled
   * once and then went dead, which is what the shop saw.
   *
   * A time window would have fixed that and broken something worse: while a
   * reply is written the thread is scrolled on every character, so any window
   * long enough to cover our own scrolling would swallow the reader's for as
   * long as the reply lasted, and they could never scroll up to read. Where we
   * put it is exact and costs the reader nothing.
   */
  // NaN until we have put it somewhere: before that, every event is the reader own.
  let selfTop = Number.NaN;

  function put(el: Scroller, top: number) {
    el.scrollTop = top;
    // Read back: the browser clamps and rounds, and the event carries its value.
    selfTop = el.scrollTop;
  }

  function end(el: Scroller) { return el.scrollHeight - el.clientHeight; }

  /**
   * MEASURED: `scrollTo({ behavior: 'smooth' })` moved this container zero
   * pixels and reported no error, so "back to latest" silently did nothing.
   * The tween is written by hand for that reason, and because the end of the
   * thread keeps moving while a reply is being written: the target is read on
   * every frame rather than fixed when the scroll starts.
   */
  function toBottom(smooth = false) {
    const el = options.el();
    if (!el) return;
    cancelRaf(animation); animation = 0;
    // Instant while a reply is being written: an eased scroll restarted on
    // every character never arrives, and on a phone it stutters.
    if (!smooth || instantOnly()) { put(el, end(el)); return; }
    const from = el.scrollTop, started = now(), duration = 260;
    const step = (time: number) => {
      const live = options.el();
      if (!live) return;
      const progress = Math.min(1, (time - started) / duration);
      put(live, from + (end(live) - from) * (1 - (1 - progress) ** 3));
      animation = progress < 1 ? raf(step) : 0;
    };
    animation = raf(step);
  }

  return {
    onScroll() {
      const el = options.el();
      if (!el) return;
      // Our own scrolling must not be read as the reader walking away. One
      // write produces one event, so the position is spent once and then
      // forgotten: otherwise a reader scrolling back to the exact pixel we
      // last wrote would go unnoticed, and following would never resume.
      const ours = Math.abs(el.scrollTop - selfTop) <= SELF_SLACK;
      selfTop = Number.NaN;
      if (ours) return;
      const distance = distanceFromBottom(el);
      following = distance <= AT_BOTTOM;
      // They took hold of it, so stop pulling against their finger.
      if (!following) { cancelRaf(animation); animation = 0; }
      options.showLatest(!following);
    },
    /** The thread got taller: another line of a reply, a picture, an indicator. */
    grow() {
      const el = options.el();
      if (!el) return;
      if (following) { toBottom(); options.showLatest(false); return; }
      options.showLatest(distanceFromBottom(el) > AT_BOTTOM);
    },
    /** Jump to the newest message and start following again. */
    goToLatest() { following = true; toBottom(true); options.showLatest(false); },
    /** Sending: return to the end wherever the reader was. */
    followNow() { following = true; options.showLatest(false); toBottom(true); },
    /**
     * Stop following, for a deliberate jump to an older message. Without this a
     * jump would be undone by the next thing that made the thread taller.
     */
    stopFollowing() { following = false; cancelRaf(animation); animation = 0; options.showLatest(true); },
    following() { return following; },
    dispose() { cancelRaf(animation); animation = 0; },
  };
}

export type Follow = ReturnType<typeof createFollow>;
