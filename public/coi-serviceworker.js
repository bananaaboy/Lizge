/*
 * Service worker with two jobs.
 *
 * 1. Cross-origin isolation. On hosts that cannot set response headers (GitHub
 *    Pages, plain object storage), this re-emits every response with COOP and
 *    COEP attached, which flips `crossOriginIsolated` to true and unlocks
 *    SharedArrayBuffer — and with it the multi-threaded FFmpeg core.
 *
 * 2. Offline. An app whose whole claim is that it runs on your machine should
 *    not stop working when the network does. Same-origin responses are cached
 *    as they are fetched, and served from cache when the network is gone. The
 *    32 MB FFmpeg core is cached the first time it loads, so the second visit
 *    needs no network at all.
 *
 * Neither job inspects, stores or forwards request bodies, and nothing
 * cross-origin is ever cached — the extraction service's traffic passes
 * straight through.
 */

const CACHE = 'lizge-v1'

/**
 * The shell, by name. Hashed asset filenames are not knowable from here, so the
 * page reports those itself once the worker is in control (see the message
 * handler below). Without this, a visitor who loads the page once and then goes
 * offline would find nothing cached: the worker does not control the very
 * request that installed it.
 */
const SHELL = ['./', './index.html', './manifest.webmanifest', './fonts.css', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // One failure must not fail the whole install.
      await Promise.allSettled(SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' }))))
      await self.skipWaiting()
    })(),
  )
})

/**
 * The page hands over the URLs it actually loaded — the hashed bundles, the
 * fonts, whatever the browser fetched before this worker existed.
 */
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'precache' || !Array.isArray(data.urls)) return
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const missing = []
      for (const url of data.urls) {
        if (typeof url !== 'string') continue
        if (new URL(url, self.location.href).origin !== self.location.origin) continue
        if (!(await cache.match(url))) missing.push(url)
      }
      await Promise.allSettled(missing.map((url) => cache.add(url)))
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of the app.
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

/** Copies a response, adding the isolation headers. */
function isolate(response) {
  if (response.status === 0) return response // opaque; nothing to rewrite
  const headers = new Headers(response.headers)
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // A cache-only request from another context is not ours to touch.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  const cacheable = sameOrigin && request.method === 'GET'

  event.respondWith(
    (async () => {
      if (!cacheable) {
        // Cross-origin: pass through untouched, and never store it.
        return isolate(await fetch(request));
      }

      try {
        const response = await fetch(request)
        if (response.ok && response.status === 200) {
          // Cache a clone; the original still streams to the page.
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return isolate(response)
      } catch (error) {
        const cached = await caches.match(request)
        if (cached) return isolate(cached)
        // A navigation with nothing cached still deserves the app shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html')
          if (shell) return isolate(shell)
        }
        throw error
      }
    })(),
  )
})
