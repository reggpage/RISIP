import { lazy, type ComponentType } from 'react';

/**
 * A lazily-loaded route that survives a deploy.
 *
 * WHAT GOES WRONG WITHOUT THIS.
 *
 * Every route is a separate chunk with a content hash in its name. When a new
 * version ships, the old chunk files are gone. A phone that already had the
 * app open is still holding the OLD index.html, so the first time the trader
 * taps a screen they have not visited yet, the browser asks for a chunk that
 * no longer exists. The import rejects, React has no element to render, and
 * Safari reports it as `TypeError: Load failed` — a message that tells the
 * shopkeeper nothing and tells us almost as little.
 *
 * The same thing happens with no deploy at all: the service worker serves
 * /assets/ cache-first and falls back to `Response.error()` when a file is
 * neither cached nor fetchable. On Tanzanian mobile data a dropped download is
 * ordinary, not exotic — sw.js says so itself.
 *
 * The fix is the boring one: reload once. A reload re-fetches index.html,
 * which is served network-first, so the page comes back pointing at chunks
 * that actually exist.
 *
 * Guarded by sessionStorage so a genuine, persistent failure — really offline,
 * a chunk truly missing from the server — surfaces as an error instead of
 * putting the phone in a reload loop. That guard is the whole reason this is a
 * helper and not an inline try/catch.
 */

const RELOAD_KEY = 'risip:chunk-reload';

// Private browsing and locked-down devices throw on storage access. A failure
// here must never be the thing that stops a route from loading.
function readGuard(): string | null {
  try {
    return sessionStorage.getItem(RELOAD_KEY);
  } catch {
    return null;
  }
}

function writeGuard(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(RELOAD_KEY);
    else sessionStorage.setItem(RELOAD_KEY, value);
  } catch {
    // Without storage we cannot guard, so we do not reload at all: an error is
    // recoverable, a reload loop on somebody's only phone is not.
  }
}

// `any` mirrors React's own lazy() signature. Narrowing it to ComponentType<never>
// makes every route component fail to assign, because a route's props are not
// `never` — they are whatever that screen takes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const module = await load();
      // Arriving here means chunks are loading again; let the next failure have
      // its own attempt rather than inheriting this session's spent one.
      if (readGuard()) writeGuard(null);
      return module;
    } catch (error) {
      if (readGuard()) throw error;   // already tried; do not loop
      writeGuard(String(Date.now()));
      window.location.reload();
      // The reload takes over, so this promise deliberately never settles:
      // resolving it would render a half-torn-down tree on the way out.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
