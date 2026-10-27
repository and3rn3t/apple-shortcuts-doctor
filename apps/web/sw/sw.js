// Offline support for the web app.
//
// It precaches the files of this build and serves exactly those from the cache. It never caches
// anything else: no runtime caching, and no request for anything outside the list. Exports are read
// in the page and are never requested, so they never pass through here. Anything that is not a
// same-origin GET is left to the browser.
//
// build/service-worker-plugin.ts replaces what sits between the markers with this build's cache
// name and file list, and writes the result to dist/sw.js.

const BUILD = /* @build */ { cache: 'shortcuts-doctor-dev', files: ['/'] }; /* @end */

const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const PRECACHED = new Set(BUILD.files);

worker.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(BUILD.cache)
      .then(cache => cache.addAll(BUILD.files))
      .then(() => worker.skipWaiting())
  );
});

// A new build has a new cache name: drop every older cache once it takes over.
worker.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== BUILD.cache).map(key => caches.delete(key)))
      )
      .then(() => worker.clients.claim())
  );
});

worker.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;
  // Every route is the single-page app; other precached files are looked up by their path.
  const key = request.mode === 'navigate' ? '/' : url.pathname;
  if (!PRECACHED.has(key)) return;
  event.respondWith(
    caches
      .open(BUILD.cache)
      .then(cache => cache.match(key))
      .then(cached => cached ?? fetch(request))
  );
});
