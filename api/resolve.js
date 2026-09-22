/**
 * "What is behind this address, and what can I have?"
 *
 * The one endpoint that is not local. It is small on purpose: it looks up what
 * a URL offers, signs the addresses it found, and answers. It never holds a
 * file, never stores a URL, and never sees what the browser does next.
 */

import {
  allowedTarget,
  hasProvider,
  resolveViaProvider,
  resolveYoutube,
  sign,
  youtubeId,
} from './_shared.js'

/*
 * The four helpers below are exported so they can be tested directly. A
 * serverless module's contract is its default export; the named ones cost
 * nothing at runtime and are the difference between testing this code and
 * testing a copy of it.
 */

/**
 * What counts as "there is already a file here".
 *
 * Not just `audio/`, `video/` and `image/`: plenty of perfectly ordinary media
 * arrives under `application/` — Wikimedia serves .ogg as `application/ogg`,
 * MPEG-DASH and HLS playlists have their own types, and Matroska is
 * `application/x-matroska`. Rejecting those told the visitor "that is a web
 * page" about a file that was plainly a sound recording.
 */
const MEDIA = /^(?:audio|video|image)\//i
const MEDIA_APPLICATION =
  /^application\/(?:ogg|mp4|x-matroska|x-mpegurl|vnd\.apple\.mpegurl|dash\+xml|octet-stream)$/i
/** Extensions that make `application/octet-stream` believable. */
const MEDIA_EXTENSION =
  /\.(?:mp3|wav|flac|ogg|oga|opus|m4a|aac|aiff?|wma|mp4|m4v|webm|mkv|mov|avi|ts|flv|mpe?g|3gp|jpe?g|png|gif|webp|avif|bmp|tiff?|heic|m3u8|mpd)$/i

export function looksLikeMedia(type, url, disposition) {
  if (MEDIA.test(type)) return true
  if (!MEDIA_APPLICATION.test(type)) return false
  // octet-stream says nothing at all, so a name has to carry it — and on a
  // share link the name is not in the path.
  if (!type.toLowerCase().startsWith('application/octet-stream')) return true
  const named = filenameFrom(disposition)
  return MEDIA_EXTENSION.test(url.pathname) || (named ? MEDIA_EXTENSION.test(named) : false)
}

/**
 * The filename a server states in `Content-Disposition`.
 *
 * This is the header that rescues a share link. A cloud's public address is a
 * token — `/s/Ab3xK9mQ7pL2/download`, `?code=XZ…` — with no file name and no
 * extension anywhere in it, so everything that reads the path comes back empty
 * and the file gets mistaken for a web page. The server knows the real name
 * and says so here.
 *
 * Both spellings are read: plain `filename="…"` and RFC 5987's
 * `filename*=UTF-8''…`, which is the one that carries umlauts and is therefore
 * the one that matters for German file names.
 */
export function filenameFrom(disposition) {
  if (!disposition) return null
  const extended = disposition.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i)
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim())
    } catch {
      // A malformed encoding is not worth failing the whole download over.
    }
  }
  const plain = disposition.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i)
  const raw = plain ? (plain[1] ?? plain[2] ?? '').trim() : ''
  return raw || null
}

/** A name for a file: what the server called it, else what the URL suggests. */
export function nameFrom(url, disposition) {
  const stated = filenameFrom(disposition)
  // Strip any path a server may have put in the header; the name is all we want.
  if (stated) return stated.split(/[\\/]/).pop() || 'download'
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '')
  return last && last.includes('.') ? last : 'download'
}

/**
 * How big the file is, according to whichever header actually knows.
 *
 * After a ranged probe `Content-Length` is 1 — the single byte that was asked
 * for — and the real size sits at the end of `Content-Range` as
 * `bytes 0-0/16044`. Reading the wrong one reported every share link as a
 * one-byte file.
 */
export function sizeFrom(headers) {
  const total = (headers.get('content-range') ?? '').match(/\/(\d+)\s*$/)
  const length = total ? Number(total[1]) : Number(headers.get('content-length') ?? '0')
  return Number.isFinite(length) && length > 0 ? length : null
}

/**
 * Read a reasonably small HTML document without making a serverless function
 * buffer an arbitrary web page.  Link discovery is a convenience for pages,
 * not a second general-purpose crawler.
 */
async function htmlFrom(response, limit = 1_000_000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (length < limit) {
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value
      chunks.push(chunk)
      length += chunk.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Remove markup from the short labels shown in the link picker. */
function textFrom(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_all, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Collect useful, same-site document links from HTML.
 *
 * Keeping this to the pasted host prevents one page from turning the endpoint
 * into a cross-site link harvester.  Direct media URLs are deliberately not
 * filtered out: selecting one simply sends it through the normal media probe.
 */
export function linksFromHtml(html, page) {
  const links = []
  const seen = new Set()
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = textFrom(titleMatch?.[1] ?? '') || page.hostname
  const anchor = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi
  let match
  while ((match = anchor.exec(html)) && links.length < 80) {
    const href = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (!href || href.startsWith('#')) continue
    let url
    try {
      url = new URL(href, page)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' || url.hostname !== page.hostname) continue
    url.hash = ''
    const key = url.toString()
    if (seen.has(key) || key === page.toString()) continue
    seen.add(key)
    const label = textFrom(match[4]) || decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '') || url.hostname
    links.push({ url: key, label: label.slice(0, 160) })
  }
  return { title: title.slice(0, 160), links }
}

/** Fetch and parse an HTML page only after the direct-file probe ruled it out. */
async function pageLinks(target) {
  const answer = await fetch(target, { redirect: 'follow', headers: { Accept: 'text/html,application/xhtml+xml' } })
  const type = answer.headers.get('content-type') ?? ''
  if (!answer.ok || !/^text\/html\b|^application\/xhtml\+xml\b/i.test(type)) return null
  const page = allowedTarget(answer.url || target.toString())
  if (!page) return null
  const found = linksFromHtml(await htmlFrom(answer), page)
  return { kind: 'page', source: 'page', author: page.hostname, durationSeconds: null, thumbnail: null, streams: [], ...found }
}

/**
 * Ask what is at an address without pulling the file down.
 *
 * `HEAD` first, because it is the polite question. Plenty of storage backends
 * answer it badly though — 405, or a 200 with no `content-type` at all — and a
 * file that exists then looked like a web page. So a `HEAD` that comes back
 * useless is retried as a `GET` for the first byte, which every server that
 * can serve the file at all will answer correctly.
 */
export async function probe(target) {
  try {
    const head = await fetch(target, { method: 'HEAD', redirect: 'follow' })
    if (head.ok && head.headers.get('content-type')) return head
  } catch {
    // Fall through to the ranged GET below.
  }
  const ranged = await fetch(target, {
    method: 'GET',
    redirect: 'follow',
    headers: { Range: 'bytes=0-0' },
  })
  // The body is one byte and unused; releasing it keeps the socket from being
  // held open for the rest of the invocation.
  try {
    await ranged.arrayBuffer()
  } catch {
    // Nothing to release.
  }
  return ranged
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'method', message: 'Nur POST.' })
    return
  }

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body ?? {})
  const raw = String(body.url ?? '').trim()
  if (!raw) {
    response.status(400).json({ error: 'empty', message: 'Es wurde keine Adresse übergeben.' })
    return
  }

  const target = allowedTarget(raw)
  if (!target) {
    response.status(400).json({
      error: 'url',
      message: 'Das ist keine gültige öffentliche https-Adresse.',
    })
    return
  }

  // Nothing is cached: two people asking for the same video should each get
  // their own signed, expiring addresses.
  response.setHeader('Cache-Control', 'no-store')

  /**
   * The provider first, when the deployment has one.
   *
   * It reaches further than anything here can: full resolution on YouTube, and
   * the portals this file has no extractor for. Only when it is absent, or it
   * comes back empty, do the two built-in routes below get a turn — so a
   * deployment without one still works, just within narrower limits.
   */
  if (hasProvider()) {
    const viaProvider = await resolveViaProvider(target.toString())
    if (viaProvider && !viaProvider.error) {
      response.status(200).json({ ...viaProvider, source: 'provider' })
      return
    }
  }

  const id = youtubeId(raw)
  if (id) {
    try {
      const result = await resolveYoutube(id)
      if (result.streams.length === 0) {
        response.status(422).json({
          error: 'youtube.sabr',
          message:
            'Für dieses Video gibt YouTube einem Server keine einzige herunterladbare Adresse: ' +
            'alle Spuren laufen über SABR und haben gar keine. Hier hilft ein Anbieter ' +
            '(SONDRA_PROVIDER_URL) oder der Weg über das eigene Gerät.',
        })
        return
      }
      response.status(200).json({ ...result, source: 'youtube' })
    } catch (failure) {
      const code = failure?.code ?? 'youtube'
      response.status(502).json({
        error: code,
        message:
          code === 'youtube.signin'
            ? 'YouTube verlangt für dieses Video eine Anmeldung und lässt einen Server nicht durch.'
            : String(failure?.message || 'YouTube hat die Anfrage abgelehnt.'),
      })
    }
    return
  }

  /**
   * Anything else: is this already a media file?
   *
   * The browser cannot fetch it itself — a foreign server almost never sends
   * the CORS header that would allow it, which is the entire reason this
   * endpoint exists. So the question "is there a file here" is asked from the
   * server, with a HEAD, and if the answer is yes the address is signed and
   * handed back. If it is an HTML document, its same-site links are offered as
   * a small picker. This is navigation only; media extraction remains the job
   * of a configured provider or a local downloader.
   */
  try {
    const probed = await probe(target)
    const type = probed.headers.get('content-type') ?? ''
    const disposition = probed.headers.get('content-disposition') ?? ''
    if (!probed.ok || !looksLikeMedia(type, target, disposition)) {
      const found = await pageLinks(target)
      if (found) {
        response.status(200).json(found)
        return
      }
      response.status(422).json({
        error: 'no-extractor',
        message:
          'Unter dieser Adresse liegt keine Mediendatei, sondern eine Webseite, auf der keine ' +
          'weiteren gleichartigen Links gefunden wurden. Ohne Anbieter kann der eingebaute Dienst ' +
          'nur YouTube und direkte Datei-Adressen; für alles andere braucht es einen Anbieter ' +
          '(SONDRA_PROVIDER_URL) oder yt-dlp auf dem eigenen Gerät.',
      })
      return
    }
    const length = sizeFrom(probed.headers)
    const name = nameFrom(target, disposition)
    response.status(200).json({
      source: 'direct',
      kind: 'direct',
      title: name,
      author: target.hostname,
      durationSeconds: null,
      thumbnail: null,
      streams: [
        {
          id: 'direct',
          label: 'Datei laden',
          hasVideo: type.startsWith('video/'),
          hasAudio: /^(?:audio|video)\/|^application\/ogg/i.test(type),
          width: null,
          height: null,
          ext: name.includes('.') ? (name.split('.').pop() ?? 'bin') : 'bin',
          mime: type.split(';')[0],
          bytes: length,
          token: sign(target.toString()),
        },
      ],
    })
  } catch (failure) {
    response.status(502).json({
      error: 'unreachable',
      message: `Die Adresse war vom Dienst aus nicht erreichbar: ${String(failure?.message ?? failure)}`,
    })
  }
}
