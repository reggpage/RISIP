// Risip service worker.
//
// WHAT WENT WRONG, so it does not go wrong the same way twice.
//
// The previous version served everything under /assets/ cache-first from a
// cache whose name never changed. Three consequences, all of them bad:
//
//   1. activate() only deletes caches whose key differs from CACHE_NAME, so
//      with a constant name nothing was ever evicted. Every asset from every
//      deploy accumulated and no entry could be replaced.
//   2. A cached entry was returned without any check, forever. One incomplete
//      download and that file was broken on that device permanently.
//   3. cache.put() was fired without awaiting or catching it, so a response
//      that failed to store failed silently.
//
// MEASURED: replacing the cached stylesheet with a truncated body and
// reloading gave a fully unstyled page, 1 rule applied instead of 990, and a
// reload did not recover it. That is exactly what a customer reported on
// Safari. On Tanzanian mobile data a dropped connection mid-download is
// ordinary, not exotic.
//
// The version below buffers a response before storing it, so a truncated
// download throws and is never cached; rechecks the stylesheet and the scripts
// in the background, so a bad copy of the two files that can break the whole
// page is replaced rather than kept; and falls back to the network instead of
// turning a cache miss into a hard failure.

// Bumping this name is what evicts the broken v1 caches already sitting on
// customers' phones. Bump it whenever the caching rules below change.
const CACHE_NAME = 'risip-shell-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // addAll fails the whole install if any one file fails, which would leave
      // the old worker in place along with its broken cache.
      .then((cache) => Promise.all(APP_SHELL.map((path) => cache.add(path).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Fetch and store, but only store what arrived complete.
 *
 * Reading the body here is the point: if the connection dropped part way, this
 * rejects and nothing is written, instead of a half a stylesheet being kept and
 * served back for the life of the device.
 */
async function fetchAndStore(request) {
  const response = await fetch(request);
  // Opaque and error responses have nothing worth keeping, and an opaque one
  // served back to a crossorigin <link> is rejected by the browser.
  if (!response.ok || response.status !== 200 || response.type !== 'basic') return response;

  const buffered = response.clone();
  try {
    const body = await buffered.arrayBuffer();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }));
  } catch {
    // An incomplete download, or no room left. Either way the live response is
    // still fine to hand back; it just does not get remembered.
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Navigations are network-first so a newly deployed app is seen immediately.
  // The cached shell is used only when the phone is genuinely offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const body = await response.clone().arrayBuffer();
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })).catch(() => {});
        }
        return response;
      } catch {
        const cached = await caches.match('/');
        return cached ?? Response.error();
      }
    })());
    return;
  }

  // Only immutable frontend files. Auth, Supabase and finance data are never
  // stored by this worker.
  if (!url.pathname.startsWith('/assets/') && !APP_SHELL.includes(url.pathname)) return;

  // The stylesheet and the scripts are the two files that break the whole page
  // when they are wrong, and there are only a few of them. Those get checked
  // against the network in the background, so a bad copy is replaced on the
  // next visit rather than kept for ever. Vercel serves them with an ETag, so
  // the check is normally a 304 with no body. Images are left alone: they are
  // the bulk of the bytes and a broken one costs a picture, not the page.
  const worthRevalidating = /\.(?:css|js)$/.test(url.pathname);

  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) {
      if (worthRevalidating) {
        // Detached on purpose. waitUntil after an await can throw once the
        // event has settled, and losing a revalidation is harmless.
        fetchAndStore(request).catch(() => {});
      }
      return cached;
    }

    try {
      return await fetchAndStore(request);
    } catch {
      // Nothing cached and no network. Returning the error is honest: the
      // browser reports one failed asset rather than a silently broken page.
      return Response.error();
    }
  })());
});
