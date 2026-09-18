/**
 * The pieces both endpoints need: signing, and the one place that knows how to
 * ask YouTube anything.
 *
 * Files whose name starts with an underscore are not routed as functions by
 * Vercel, so this is a plain module rather than an endpoint.
 */

import crypto from 'node:crypto'
import vm from 'node:vm'

/* -------------------------------------------------------------------------- */
/* Signing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why sign at all, when the proxy only ever talks to an allow-listed handful of
 * media hosts?
 *
 * Because without it the endpoint is a general-purpose downloader for anyone
 * who finds the URL, paid for by whoever deployed this. The signature binds a
 * target to a short expiry, so a link only works for the person who just asked
 * for it and only for a few minutes.
 *
 * `SONDRA_SECRET` should be set in the deployment's environment. Without one
 * this falls back to a constant, which is worth exactly what it costs: it still
 * stops a casual passer-by from handing the endpoint arbitrary URLs, and it
 * stops nobody who has read this file. The allow-list is the real fence.
 */
const SECRET = process.env.SONDRA_SECRET || 'sondra-unconfigured'

/** How long a signed target stays usable. Long enough for a slow download. */
const TTL_SECONDS = 60 * 60 * 4

const b64url = (value) => Buffer.from(value).toString('base64url')

export function sign(target, extra = {}) {
  const payload = b64url(JSON.stringify({ u: target, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS, ...extra }))
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [payload, mac] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  // Constant-time, so the endpoint cannot be used as an oracle to guess a MAC.
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null
    return data
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Where the proxy is allowed to go                                            */
/* -------------------------------------------------------------------------- */

/**
 * The proxy fetches media, not web pages.
 *
 * Everything it is allowed to reach has to be a public HTTPS host, and never a
 * private address: an endpoint that will fetch any URL for you is an SSRF hole
 * into whatever else runs on the same network. Hostnames that resolve to
 * loopback or RFC 1918 space are refused by name here; the platform's own
 * network has no private services to reach in any case.
 */
const PRIVATE_HOST =
  /^(?:localhost|\[?::1\]?|0\.0\.0\.0)$|^(?:127|10)\.|^192\.168\.|^169\.254\.|^172\.(?:1[6-9]|2\d|3[01])\.|\.(?:local|internal|localdomain)$/i

export function allowedTarget(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (PRIVATE_HOST.test(url.hostname)) return null
  return url
}

/* -------------------------------------------------------------------------- */
/* YouTube                                                                     */
/* -------------------------------------------------------------------------- */

let innertube = null

/**
 * One Innertube session per warm instance.
 *
 * Creating it downloads and parses YouTube's player script, which is megabytes
 * and seconds. Doing that per request would put the cost on every single
 * resolve; doing it once per container puts it on the first one.
 */
async function youtube() {
  if (innertube) return innertube
  const { Innertube, Platform } = await import('youtubei.js')
  // Deciphering a signature means running a chunk of YouTube's own JavaScript.
  // youtubei.js deliberately refuses to pick an evaluator for you, because
  // where that code runs is a security decision. `node:vm` with an empty
  // context is the smallest sandbox that works: the script gets no require, no
  // process, no fetch, and ten seconds.
  Platform.load({
    ...Platform.shim,
    eval: (data) =>
      new vm.Script(`(function(){${data.output}})()`).runInNewContext(Object.create(null), {
        timeout: 10_000,
      }),
  })
  innertube = await Innertube.create({ retrieve_player: true })
  return innertube
}

const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i

export function youtubeId(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!YOUTUBE_HOST.test(url.hostname)) return null
  if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1).split('/')[0] || null
  if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
    return url.pathname.split('/')[2] || null
  }
  return url.searchParams.get('v')
}

const sizeLabel = (format) => {
  if (format.has_video && format.has_audio) return `${format.quality_label ?? 'Video'} mit Ton`
  if (format.has_video) return `${format.quality_label ?? 'Video'} ohne Ton`
  return `Nur Ton${format.bitrate ? ` · ${Math.round(format.bitrate / 1000)} kbit/s` : ''}`
}

/**
 * What YouTube will actually hand over to a server.
 *
 * Far less than it looks like from a browser, and the reason is worth writing
 * down: the high-resolution streams are served over SABR, a negotiated
 * protocol with no plain URL to fetch. They come back from the API with no
 * address at all — not a signed one, not an encrypted one — so there is
 * nothing for a proxy to pass on, with or without a PoToken (measured: minting
 * a valid one changes none of it). What is left is the progressive stream,
 * picture and sound already in one file, which tops out at 360p and which some
 * videos do not offer either.
 *
 * So this returns whatever really carries a URL and says plainly what it is.
 * The full-quality path is yt-dlp on the visitor's own machine, and the panel
 * offers it right next to this.
 */
export async function resolveYoutube(id) {
  const yt = await youtube()
  const info = await yt.getBasicInfo(id)

  const status = info.playability_status?.status
  if (status && status !== 'OK') {
    const reason = info.playability_status?.reason || ''
    throw Object.assign(new Error(reason || 'Das Video ist nicht abspielbar.'), {
      code: status === 'LOGIN_REQUIRED' ? 'youtube.signin' : 'youtube.unplayable',
    })
  }

  const data = info.streaming_data
  const all = [...(data?.formats ?? []), ...(data?.adaptive_formats ?? [])]

  const streams = []
  for (const format of all) {
    let url = null
    try {
      url = await format.decipher(yt.session.player)
    } catch {
      // SABR-only, or a signature this player script cannot solve. Either way
      // there is no address, so there is nothing to offer.
      continue
    }
    if (!url) continue
    streams.push({
      id: String(format.itag),
      label: sizeLabel(format),
      hasVideo: Boolean(format.has_video),
      hasAudio: Boolean(format.has_audio),
      width: format.width ?? null,
      height: format.height ?? null,
      ext: format.mime_type?.includes('webm') ? 'webm' : format.has_video ? 'mp4' : 'm4a',
      mime: format.mime_type?.split(';')[0] ?? 'application/octet-stream',
      bytes: format.content_length ? Number(format.content_length) : null,
      token: sign(url),
    })
  }

  // Best first: sound and picture together, then the taller one.
  streams.sort((a, b) => {
    const complete = Number(b.hasVideo && b.hasAudio) - Number(a.hasVideo && a.hasAudio)
    return complete || (b.height ?? 0) - (a.height ?? 0)
  })

  return {
    kind: 'youtube',
    title: info.basic_info?.title ?? 'Video',
    author: info.basic_info?.author ?? null,
    durationSeconds: info.basic_info?.duration ?? null,
    thumbnail: info.basic_info?.thumbnail?.[0]?.url ?? null,
    streams,
  }
}
