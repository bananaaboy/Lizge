/*
 * Cross-origin isolation for static hosts that cannot set response headers
 * (GitHub Pages, plain object storage, ...).
 *
 * This service worker re-emits every response with COOP and COEP attached,
 * which flips `crossOriginIsolated` to true and unlocks SharedArrayBuffer — and
 * with it the multi-threaded FFmpeg core. Registration lives inline in
 * index.html and is skipped when real headers are already present.
 *
 * It never inspects, stores or forwards request bodies; it only rewrites
 * response headers on the way back to the page.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const request = event.request

  // A cache-only request from another context is not ours to touch.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

  event.respondWith(
    fetch(request).then((response) => {
      // Opaque responses have no headers to copy and must be passed through.
      if (response.status === 0) return response

      const headers = new Headers(response.headers)
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
      headers.set('Cross-Origin-Opener-Policy', 'same-origin')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }),
  )
})
