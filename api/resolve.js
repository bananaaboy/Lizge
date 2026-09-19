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

const MEDIA = /^(audio|video|image)\//i

/** A name for a file that only has a URL. */
function nameFrom(url) {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '')
  return last && last.includes('.') ? last : 'download'
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
   * handed back. There is no page scraping here and there will not be: that is
   * what yt-dlp is for, and yt-dlp belongs on the visitor's own machine.
   */
  try {
    const head = await fetch(target, { method: 'HEAD', redirect: 'follow' })
    const type = head.headers.get('content-type') ?? ''
    if (!head.ok || !MEDIA.test(type)) {
      response.status(422).json({
        error: 'no-extractor',
        message:
          'Unter dieser Adresse liegt keine Mediendatei, sondern eine Webseite. Ohne Anbieter kann ' +
          'der eingebaute Dienst nur YouTube und direkte Datei-Adressen; für alles andere braucht ' +
          'es einen Anbieter (SONDRA_PROVIDER_URL) oder yt-dlp auf dem eigenen Gerät.',
      })
      return
    }
    const length = Number(head.headers.get('content-length') ?? '0')
    response.status(200).json({
      source: 'direct',
      kind: 'direct',
      title: nameFrom(target),
      author: target.hostname,
      durationSeconds: null,
      thumbnail: null,
      streams: [
        {
          id: 'direct',
          label: 'Datei laden',
          hasVideo: type.startsWith('video/'),
          hasAudio: type.startsWith('audio/') || type.startsWith('video/'),
          width: null,
          height: null,
          ext: nameFrom(target).split('.').pop() ?? 'bin',
          mime: type.split(';')[0],
          bytes: Number.isFinite(length) && length > 0 ? length : null,
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
