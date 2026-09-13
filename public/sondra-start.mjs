/**
 * Starts everything Sondra needs on this machine, with one command.
 *
 * Two things have to run: the extraction service, and Sondra itself. The second
 * one is the part people keep tripping over — a page served from the internet is
 * not allowed to talk to a service on your own machine, and browsers enforce
 * that without always explaining it. Served from here instead, both sit on the
 * same machine, there is no boundary to cross, and nothing needs permitting.
 *
 * The page is passed through live from the website rather than copied, so what
 * you get is whatever the site currently serves. Two headers are added on the
 * way, the ones that unlock the multi-threaded FFmpeg core.
 *
 * Nothing is stored, nothing is logged, and both ports listen on the loopback
 * interface only — no more reachable from outside than the service itself.
 *
 *   node sondra-start.mjs https://example.org
 */

import http from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SITE = (process.argv[2] ?? '').replace(/\/$/, '')
const SERVICE_PORT = Number(process.env.SONDRA_SERVICE_PORT ?? 9000)
const PAGE_PORT = Number(process.env.SONDRA_PAGE_PORT ?? 8787)

if (!SITE) {
  console.error('Aufruf: node sondra-start.mjs https://ihre-seite.example')
  process.exit(1)
}

/* -- 1. the service ------------------------------------------------------- */

// Wherever the source ended up: cloned, or unpacked from the archive.
const candidates = ['cobalt-main/api', 'cobalt/api', 'api']
const apiDir = candidates.map((dir) => path.resolve(dir)).find((dir) => existsSync(path.join(dir, 'src/cobalt.js')))

if (!apiDir) {
  console.error('Der Quelltext liegt nicht in diesem Ordner. Erwartet wird cobalt-main/ oder cobalt/.')
  console.error('Aktueller Ordner:', process.cwd())
  process.exit(1)
}

const service = spawn(process.execPath, ['src/cobalt'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    API_URL: `http://localhost:${SERVICE_PORT}/`,
    API_PORT: String(SERVICE_PORT),
  },
})

service.on('exit', (code) => {
  console.error(`\nDer Dienst hat sich beendet (Code ${code}). Sondra wird mit beendet.`)
  process.exit(code ?? 1)
})

// Leaving a service running after the launcher is gone would be a surprise.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    service.kill()
    process.exit(0)
  })
}

/* -- 2. the page ---------------------------------------------------------- */

http
  .createServer(async (req, res) => {
    try {
      const upstream = await fetch(SITE + req.url, {
        method: req.method,
        headers: {
          'user-agent': req.headers['user-agent'] ?? 'sondra-start',
          accept: req.headers.accept ?? '*/*',
        },
        redirect: 'follow',
      })

      const headers = {}
      upstream.headers.forEach((value, name) => {
        // The body is decoded in passing, so the old numbers no longer fit it.
        if (['content-encoding', 'content-length', 'transfer-encoding'].includes(name)) return
        headers[name] = value
      })
      // These two unlock the multi-threaded FFmpeg core.
      headers['cross-origin-opener-policy'] = 'same-origin'
      headers['cross-origin-embedder-policy'] = 'credentialless'

      res.writeHead(upstream.status, headers)
      if (!upstream.body) return res.end()
      for await (const chunk of upstream.body) res.write(chunk)
      res.end()
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`${SITE} war nicht erreichbar: ${error.message}`)
    }
  })
  .listen(PAGE_PORT, '127.0.0.1', () => {
    console.log('')
    console.log(`  Sondra:  http://localhost:${PAGE_PORT}/   ← diese Adresse öffnen`)
    console.log(`  Dienst:  http://localhost:${SERVICE_PORT}/`)
    console.log('')
    console.log('  Dieses Fenster offen lassen. Strg+C beendet beides.')
    console.log('')
  })
