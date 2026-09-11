/**
 * Extraction service client — the one feature that leaves the machine.
 *
 * YouTube and comparable portals do not send `Access-Control-Allow-Origin`, so a
 * web page cannot read their media no matter how it asks. That is not a gap in
 * this app; it is the same-origin policy doing its job. The only way through is
 * a server that fetches on the visitor's behalf, and a server that fetches on
 * your behalf sees the address you asked for and the address you asked from.
 *
 * So this is opt-in, off by default, and the UI says plainly what it costs.
 *
 * The wire format is the one cobalt established and several implementations now
 * speak, which means the endpoint is the user's choice — a public instance they
 * trust, or one they run themselves. Nothing is hard-coded here, because
 * shipping a default would quietly send everyone's URLs to a machine neither
 * they nor this project controls.
 */

export type DownloadMode = 'auto' | 'audio' | 'mute'
export type VideoQuality = 'max' | '2160' | '1440' | '1080' | '720' | '480' | '360'
export type AudioFormat = 'best' | 'mp3' | 'opus' | 'wav'

export interface ServiceSettings {
  /** Base URL of the extraction service. Empty means the feature is unusable. */
  endpoint: string
  downloadMode: DownloadMode
  videoQuality: VideoQuality
  audioFormat: AudioFormat
}

export const DEFAULT_SERVICE: ServiceSettings = {
  endpoint: '',
  downloadMode: 'auto',
  videoQuality: '1080',
  audioFormat: 'best',
}

/** One media item the service offers. */
export interface ServiceItem {
  url: string
  filename: string
  kind: 'video' | 'audio' | 'photo' | 'gif'
}

export class ServiceError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
  }
}

/** Turns the service's error codes into something a person can act on. */
function explain(code: string | null): string {
  if (!code) return 'Der Dienst hat die Anfrage abgelehnt.'
  if (code.includes('link.invalid') || code.includes('link.unsupported')) {
    return 'Diese Adresse kennt der Dienst nicht oder unterstützt sie nicht.'
  }
  if (code.includes('content.video.unavailable') || code.includes('content.video.private')) {
    return 'Das Video ist nicht öffentlich abrufbar.'
  }
  if (code.includes('content.video.age')) return 'Das Video ist altersbeschränkt.'
  if (code.includes('content.video.region')) return 'Das Video ist in der Region des Dienstes gesperrt.'
  if (code.includes('content.too_long')) return 'Das Video überschreitet die Längenbegrenzung des Dienstes.'
  if (code.includes('auth')) return 'Der Dienst verlangt einen Zugangsschlüssel.'
  if (code.includes('rate_exceeded')) return 'Zu viele Anfragen an den Dienst. Später erneut versuchen.'
  if (code.includes('fetch') || code.includes('unreachable')) {
    return 'Der Dienst konnte die Quelle selbst nicht erreichen.'
  }
  return `Der Dienst meldet: ${code}`
}

interface ServiceResponse {
  status?: string
  url?: string
  filename?: string
  picker?: { type?: string; url?: string; thumb?: string }[]
  audio?: string
  audioFilename?: string
  error?: { code?: string }
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed) throw new ServiceError('Es ist kein Dienst hinterlegt.')
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      // Anything but HTTPS would send the address in the clear to every hop on
      // the way, which is a worse deal than the user already agreed to.
      throw new ServiceError('Der Dienst muss über HTTPS erreichbar sein.')
    }
    return url.href
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError('Die Adresse des Dienstes ist keine gültige URL.')
  }
}

/**
 * Asks the service what it can offer for `mediaUrl`.
 *
 * `apiKey` is passed through but never stored — a credential in localStorage
 * outlives the session and the intent behind it.
 */
export async function resolveMedia(
  mediaUrl: string,
  settings: ServiceSettings,
  apiKey: string | null,
  signal?: AbortSignal,
): Promise<ServiceItem[]> {
  const endpoint = normalizeEndpoint(settings.endpoint)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Api-Key ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        url: mediaUrl,
        downloadMode: settings.downloadMode,
        videoQuality: settings.videoQuality,
        audioFormat: settings.audioFormat,
        filenameStyle: 'basic',
      }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ServiceError(
      'Der Dienst ist nicht erreichbar, oder er erlaubt keine Anfragen von dieser Seite ' +
        '(fehlender CORS-Header). Prüfen Sie die Adresse.',
    )
  }

  let body: ServiceResponse
  try {
    body = (await response.json()) as ServiceResponse
  } catch {
    throw new ServiceError(`Der Dienst antwortete mit ${response.status} und keinem gültigen JSON.`)
  }

  if (body.status === 'error' || !response.ok) {
    const code = body.error?.code ?? null
    throw new ServiceError(explain(code), code)
  }

  // "tunnel" streams through the service, "redirect" hands back the origin URL.
  if ((body.status === 'tunnel' || body.status === 'redirect') && body.url) {
    return [
      {
        url: body.url,
        filename: body.filename ?? 'download',
        kind: settings.downloadMode === 'audio' ? 'audio' : 'video',
      },
    ]
  }

  if (body.status === 'picker' && Array.isArray(body.picker)) {
    const items: ServiceItem[] = body.picker
      .filter((entry): entry is { type?: string; url: string } => typeof entry.url === 'string')
      .map((entry, index) => ({
        url: entry.url,
        filename: `${index + 1}-${body.filename ?? 'download'}`,
        kind: entry.type === 'photo' ? 'photo' : entry.type === 'gif' ? 'gif' : 'video',
      }))
    if (body.audio) {
      items.push({ url: body.audio, filename: body.audioFilename ?? 'audio', kind: 'audio' })
    }
    if (items.length === 0) throw new ServiceError('Der Dienst lieferte eine leere Auswahl.')
    return items
  }

  throw new ServiceError(`Unerwartete Antwort des Dienstes (status: ${body.status ?? 'unbekannt'}).`)
}

/** The notice shown whenever the feature is switched on. */
export const SERVICE_DISCLAIMER = {
  title: 'Diese Funktion verlässt das lokale Prinzip',
  paragraphs: [
    'Die eingegebene Adresse geht samt Ihrer IP an den hinterlegten Dienst; er holt die Datei und ' +
      'reicht sie durch. Was sein Betreiber protokolliert, entzieht sich Lizge vollständig — wählen ' +
      'Sie einen Dienst, dem Sie vertrauen, oder betreiben Sie eine eigene Instanz.',
    'Alle übrigen Werkzeuge bleiben lokal: Konvertierung, Spurentrennung, Lautheit und Sampler ' +
      'rechnen weiterhin ausschließlich auf Ihrem Gerät.',
  ],
  liability:
    'Haftungsausschluss: Die Nutzung erfolgt auf eigene Verantwortung und eigenes Risiko. Für die ' +
    'Rechtmäßigkeit der abgerufenen Inhalte, für Verstöße gegen Nutzungsbedingungen oder ' +
    'Urheberrechte Dritter und für Schäden jeder Art wird keinerlei Haftung übernommen.',
} as const
