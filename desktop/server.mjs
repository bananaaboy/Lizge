/**
 * The built site and the two API functions, served on this machine only.
 *
 * Shared by the desktop app (`electron.mjs`, which points its own window at
 * it) and by `npm run desktop` (`main.mjs`, which points the browser at it).
 * It is `scripts/dev-service.mjs` grown up for being handed to somebody else:
 *
 * - It listens on 127.0.0.1, not on every interface. A program somebody
 *   installed should not quietly become a proxy for the whole network.
 * - `SONDRA_SECRET` is drawn fresh at every start unless one is set. The
 *   deployment falls back to a constant, which is fine for a website nobody
 *   can see the environment of and pointless on a machine where the constant
 *   is in the program.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const HOST = '127.0.0.1'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

/** Just enough of Vercel's request and response shape for the two handlers. */
function adapt(request, response, url) {
  request.query = Object.fromEntries(url.searchParams)
  response.status = (code) => {
    response.statusCode = code
    return response
  }
  response.json = (data) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(data))
  }
}

/** A path under root, or index.html for anything that is not a file there. */
function fileFor(root, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = '/'
  }
  const candidate = path.resolve(root, '.' + path.posix.normalize(decoded))
  const inside = candidate === root || candidate.startsWith(root + path.sep)
  if (inside && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  return path.join(root, 'index.html')
}

/**
 * Serve `root` on 127.0.0.1, preferring `port` and falling back to any free
 * one. Resolves to the base address once listening.
 */
export async function startServer({ root, port }) {
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    throw new Error(`Die Oberfläche fehlt: ${path.join(root, 'index.html')} gibt es nicht.`)
  }

  // Before the API modules load: they read the secret once, at import time.
  // Loaded dynamically for the same reason — a static import would evaluate
  // before this line, and the bundle is CommonJS, which has no top-level await.
  process.env.SONDRA_SECRET ||= crypto.randomBytes(32).toString('base64url')
  const { default: resolveFn } = await import('../api/resolve.js')
  const { default: streamFn } = await import('../api/stream.js')

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    // The same two headers vercel.json sets: SharedArrayBuffer, and with it
    // the multi-threaded FFmpeg core, depends on them.
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')

    if (url.pathname.startsWith('/api/')) {
      adapt(request, response, url)
      if (request.method === 'POST') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        request.body = Buffer.concat(chunks).toString()
      }
      try {
        if (url.pathname === '/api/resolve') await resolveFn(request, response)
        else if (url.pathname === '/api/stream') await streamFn(request, response)
        else response.status(404).json({ error: 'route' })
      } catch (failure) {
        if (!response.headersSent) response.status(500).json({ error: 'crash', message: String(failure?.message ?? failure) })
        else response.end()
      }
      return
    }

    const file = fileFor(root, url.pathname)
    response.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    // Hashed assets never change under the same name; the page itself might.
    if (file.includes(`${path.sep}assets${path.sep}`)) response.setHeader('cache-control', 'public, max-age=31536000, immutable')
    else response.setHeader('cache-control', 'no-cache')
    fs.createReadStream(file).pipe(response)
  })

  const listen = (candidate) =>
    new Promise((resolve, reject) => {
      const onError = (failure) => {
        server.off('listening', onListening)
        reject(failure)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(candidate, HOST)
    })

  try {
    await listen(port)
  } catch (failure) {
    // Something else already has the usual port. Any free one works; it only
    // costs the origin, and with it whatever the page kept in storage.
    if (failure.code !== 'EADDRINUSE') throw failure
    await listen(0)
  }

  return { server, url: `http://${HOST}:${server.address().port}/` }
}
