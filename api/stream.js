/**
 * The pipe.
 *
 * Takes a token that `resolve` signed, fetches exactly that address and passes
 * the bytes straight back. It adds nothing, keeps nothing and logs nothing.
 *
 * Range headers are forwarded in both directions, and that is the whole trick
 * that makes this work on a serverless platform at all: a function has a time
 * limit measured in seconds, so a two-hundred-megabyte file would never finish
 * in one call. The browser asks for it a few megabytes at a time instead, each
 * chunk its own short-lived invocation, and reassembles them. Which also means
 * a cancelled download stops costing anything immediately.
 */

import { allowedTarget, verify } from './_shared.js'

export default async function handler(request, response) {
  const token = String(request.query?.t ?? '')
  const claim = verify(token)
  if (!claim) {
    response.status(403).json({ error: 'token', message: 'Der Link ist abgelaufen. Bitte neu suchen.' })
    return
  }

  const target = allowedTarget(claim.u)
  if (!target) {
    response.status(400).json({ error: 'url', message: 'Ziel nicht erlaubt.' })
    return
  }

  const headers = {}
  // A media host that gets no Range answers 200 with the whole file, which is
  // exactly what must not happen here.
  const range = request.headers.range
  if (range) headers.range = range

  try {
    const upstream = await fetch(target, { headers, redirect: 'follow' })

    response.status(upstream.status)
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
      const value = upstream.headers.get(header)
      if (value) response.setHeader(header, value)
    }
    response.setHeader('Cache-Control', 'no-store')
    // The page is cross-origin isolated; a subresource from it needs to say it
    // is willing to be embedded there.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

    if (!upstream.body) {
      response.end()
      return
    }

    // Node's stream plumbing, not `await arrayBuffer()`: buffering the chunk in
    // memory first would double the memory and add latency for no gain.
    const { Readable } = await import('node:stream')
    Readable.fromWeb(upstream.body).pipe(response)
  } catch (failure) {
    response.status(502).json({
      error: 'upstream',
      message: `Der Dienst kam nicht an die Datei: ${String(failure?.message ?? failure)}`,
    })
  }
}
