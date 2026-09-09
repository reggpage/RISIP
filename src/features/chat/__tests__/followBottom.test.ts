import { describe, expect, it } from 'vitest';
import { AT_BOTTOM, createFollow, type Scroller } from '../followBottom';

/**
 * The shop's report: "bado hai autoscroll endapo ai inaandika". Sending moved
 * the thread once and then it went dead, and the reply wrote itself off the
 * bottom of the screen.
 *
 * Each test drives the real machinery through a fake thread and a fake clock,
 * firing the scroll event after every write the way a browser does.
 */

function thread(height = 2000, viewport = 800) {
  const el: Scroller = { scrollTop: 0, scrollHeight: height, clientHeight: viewport };
  let clock = 0;
  const frames: Array<(time: number) => void> = [];
  const shown: boolean[] = [];
  const follow = createFollow({
    el: () => el,
    showLatest: (value) => shown.push(value),
    now: () => clock,
    raf: (step) => { frames.push(step); return frames.length; },
    cancelRaf: (handle) => { frames[handle - 1] = () => {}; },
  });
  // A browser fires a scroll event after any change of scrollTop, whoever made
  // it. Nothing here works unless that is reproduced.
  const scrolled = () => follow.onScroll();
  return {
    el, follow, shown,
    at: () => el.scrollTop,
    bottom: () => el.scrollHeight - el.clientHeight,
    /** Run the animation to its end, reporting each position as a browser would. */
    run(ms = 400, stepMs = 16) {
      for (let elapsed = 0; elapsed <= ms; elapsed += stepMs) {
        clock += stepMs;
        const due = frames.splice(0, frames.length);
        for (const step of due) { const before = el.scrollTop; step(clock); if (el.scrollTop !== before) scrolled(); }
      }
    },
    /** The reply grows by a line, as the writing out does on every character. */
    wrote(pixels = 40) { el.scrollHeight += pixels; const before = el.scrollTop; follow.grow(); if (el.scrollTop !== before) scrolled(); },
    /** The reader drags the thread themselves. */
    dragged(to: number) { el.scrollTop = to; scrolled(); },
  };
}

describe('following the newest message', () => {
  it('keeps following after the eased scroll that sending starts', () => {
    const t = thread();
    t.follow.followNow();
    t.run();
    // The bug: every frame of this scroll fired an event, and partway through
    // the thread was far from the end, which was read as the reader leaving.
    expect(t.follow.following()).toBe(true);
    expect(t.at()).toBe(t.bottom());
  });

  it('follows the reply all the way down as it is written', () => {
    const t = thread();
    t.follow.followNow();
    t.run();
    for (let line = 0; line < 40; line++) t.wrote();
    expect(t.at()).toBe(t.bottom());
    expect(t.follow.following()).toBe(true);
  });

  it('lets go the moment the reader scrolls up, even mid-reply', () => {
    const t = thread();
    t.follow.followNow();
    t.run();
    t.wrote();
    t.dragged(t.bottom() - 600);
    expect(t.follow.following()).toBe(false);
    // And stays let go while the rest of the reply arrives.
    const held = t.at();
    for (let line = 0; line < 20; line++) t.wrote();
    expect(t.at()).toBe(held);
    expect(t.shown.at(-1)).toBe(true);
  });

  it('does not stop following for a nudge that stays near the end', () => {
    const t = thread();
    t.follow.followNow();
    t.run();
    t.dragged(t.bottom() - (AT_BOTTOM - 20));
    expect(t.follow.following()).toBe(true);
  });

  it('picks the reader up again when they scroll back down', () => {
    const t = thread();
    t.follow.followNow(); t.run();
    t.dragged(t.bottom() - 600);
    t.dragged(t.bottom());
    expect(t.follow.following()).toBe(true);
    expect(t.shown.at(-1)).toBe(false);
    t.wrote();
    expect(t.at()).toBe(t.bottom());
  });

  it('stops pulling against the reader who grabs it mid-scroll', () => {
    const t = thread();
    t.follow.followNow();
    t.run(48);                      // three frames in, still travelling
    expect(t.at()).toBeLessThan(t.bottom());
    t.dragged(200);
    t.run();                        // the rest of the tween must not fire
    expect(t.at()).toBe(200);
    expect(t.follow.following()).toBe(false);
  });

  it('returns to the end when asked, from anywhere', () => {
    const t = thread();
    t.dragged(0);
    expect(t.follow.following()).toBe(false);
    t.follow.goToLatest();
    t.run();
    expect(t.at()).toBe(t.bottom());
    expect(t.follow.following()).toBe(true);
  });

  it('holds a deliberate jump to an older message against the next line written', () => {
    const t = thread();
    t.follow.stopFollowing();
    t.el.scrollTop = 300;
    t.wrote();
    expect(t.at()).toBe(300);
  });
});
