/**
 * Sondra as a desktop program: the built site and the two API functions,
 * served on this machine only, with the browser pointed at them.
 *
 * This is `scripts/dev-service.mjs` grown up for people who never open a
 * terminal. It is bundled into a single script and injected into a copy of
 * `node.exe` (a Node single executable application), so the folder a user
 * unpacks holds exactly `Sondra.exe`, the site under `app/`, and the licence.
 * Nothing is installed, nothing needs admin rights, and closing the console
 * window ends it.
 *
 * Two differences from the development server, both about being handed to
 * somebody else:
 *
 * - It listens on 127.0.0.1, not on every interface. A program started by
 *   double-click should not quietly become a proxy for the whole network.
 * - `SONDRA_SECRET` is drawn fresh at every start unless one is set. The
 *   deployment falls back to a constant, which is fine for a website nobody
 *   can see the environment of and pointless on a machine where the constant
 *   is in the binary.
 */

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

/** Where the built site lives: next to the executable, or `dist/` in a checkout. */
function appDir() {
  if (process.env.SONDRA_APP_DIR) return path.resolve(process.env.SONDRA_APP_DIR)
  let packaged = false
  try {
    // Only present inside a single executable; a plain `node` run has no such module.
    packaged = require('node:sea').isSea()
  } catch {
    packaged = false
  }
  return packaged ? path.join(path.dirname(process.execPath), 'app') : path.resolve('dist')
}

const ROOT = appDir()
const HOST = '127.0.0.1'
const PREFERRED_PORT = Number(process.env.PORT ?? 4199)

// Before the API modules load: they read the secret once, at import time.
process.env.SONDRA_SECRET ||= crypto.randomBytes(32).toString('base64url')

// Filled in by `start()`, which loads them only once the secret is in place.
let resolveFn
let streamFn

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

/** A path under ROOT, or index.html for anything that is not a file there. */
function fileFor(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = '/'
  }
  const candidate = path.resolve(ROOT, '.' + path.posix.normalize(decoded))
  const inside = candidate === ROOT || candidate.startsWith(ROOT + path.sep)
  if (inside && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  return path.join(ROOT, 'index.html')
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  // The same two headers vercel.json sets: SharedArrayBuffer, and with it the
  // multi-threaded FFmpeg core, depends on them.
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

  const file = fileFor(url.pathname)
  response.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
  // Hashed assets never change under the same name; the page itself might.
  if (file.includes(`${path.sep}assets${path.sep}`)) response.setHeader('cache-control', 'public, max-age=31536000, immutable')
  else response.setHeader('cache-control', 'no-cache')
  fs.createReadStream(file).pipe(response)
})

/** Open the page in the default browser. */
function openBrowser(address) {
  if (process.env.SONDRA_NO_BROWSER) return
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', address]] // verbatim below, so the empty title stays ""
      : process.platform === 'darwin'
        ? ['open', [address]]
        : ['xdg-open', [address]]
  try {
    spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: true }).unref()
  } catch {
    // The address is printed either way; a missing opener is not a failure.
  }
}

/**
 * Keep the console readable before leaving. Started by double-click, the
 * window would otherwise vanish together with the one line explaining why.
 */
function holdOpen(code) {
  if (process.platform === 'win32' && process.stdin.isTTY) {
    console.error('\nEine beliebige Taste schliesst dieses Fenster.')
    process.stdin.setRawMode(true)
    process.stdin.once('data', () => process.exit(code))
    process.stdin.resume()
  } else {
    process.exit(code)
  }
}

server.on('listening', () => {
  const address = `http://${HOST}:${server.address().port}/`
  console.log('Sondra läuft lokal auf diesem Rechner.')
  console.log(`  ${address}`)
  console.log('\nDer Browser öffnet sich von selbst. Dieses Fenster zu schliessen beendet Sondra.')
  openBrowser(address)
})

// One handler for the announcement, not a callback per attempt: a callback
// passed to a `listen()` that failed stays registered and fires on the retry,
// which opened the browser twice.
function listen(port) {
  server.once('error', (failure) => {
    // Something else already has the usual port — a second copy, most likely.
    // Any free port works just as well; the browser is told which one.
    if (failure.code === 'EADDRINUSE' && port !== 0) return listen(0)
    console.error(`Sondra konnte nicht starten: ${failure.message}`)
    holdOpen(1)
  })
  server.listen(port, HOST)
}

/**
 * Loaded here rather than imported at the top: the bundle is CommonJS (what a
 * single executable runs), which has no top-level await, and a static import
 * would evaluate before the secret above is set.
 */
async function start() {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error(`Die Oberfläche fehlt: ${path.join(ROOT, 'index.html')} gibt es nicht.`)
    console.error('Der Ordner „app“ muss neben Sondra.exe liegen. Bitte das ZIP vollständig entpacken.')
    return holdOpen(1)
  }
  ;({ default: resolveFn } = await import('../api/resolve.js'))
  ;({ default: streamFn } = await import('../api/stream.js'))
  listen(PREFERRED_PORT)
}

start().catch((failure) => {
  console.error(`Sondra konnte nicht starten: ${failure?.message ?? failure}`)
  holdOpen(1)
})
