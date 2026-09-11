/**
 * Media downloader.
 *
 * Honest about its limits: a browser can only read a remote file if that server
 * allows it. Lizge does not proxy, because a proxy would mean the visitor's URLs
 * and IP address travelling through a machine they do not control — which is the
 * one thing this app promises not to do.
 */

import { useRef, useState } from 'react'

import {
  fetchHlsSegments,
  fetchMedia,
  fetchPlaylist,
  saveBytes,
  streamToDisk,
  TransferError,
  type HlsPlaylist,
  type TransferProgress,
} from '../../lib/download'
import { detectCapabilities } from '../../lib/capabilities'
import {
  DEFAULT_SERVICE,
  resolveMedia,
  SERVICE_DISCLAIMER,
  ServiceError,
  type AudioFormat,
  type DownloadMode,
  type ServiceItem,
  type ServiceSettings,
  type VideoQuality,
} from '../../lib/service'
import { loadFfmpeg, runFfmpeg } from '../../lib/ffmpegClient'
import { formatBytes, sanitizeFilename } from '../../lib/format'
import { kindFromMime, useSession } from '../../state/store'
import { AssetList } from '../AssetList'
import {
  ArrowRight,
  Badge,
  Button,
  Card,
  Eyebrow,
  Field,
  Notice,
  Progress,
  Select,
  TextInput,
  Toggle,
} from '../ui/primitives'

type Mode = 'direct' | 'hls' | 'service'

const SERVICE_STORAGE_KEY = 'lizge:service'

/** Only the endpoint and the quality choices persist — never the API key. */
function readServiceSettings(): ServiceSettings {
  try {
    const raw = localStorage.getItem(SERVICE_STORAGE_KEY)
    if (raw) return { ...DEFAULT_SERVICE, ...(JSON.parse(raw) as Partial<ServiceSettings>) }
  } catch {
    /* blocked storage, or somebody hand-edited it */
  }
  return DEFAULT_SERVICE
}

function writeServiceSettings(settings: ServiceSettings): void {
  try {
    localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* the setting simply will not survive a reload */
  }
}

/** Hosts a browser can never reach directly, so the hint can be specific. */
const PORTAL_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|soundcloud\.com|vimeo\.com|tiktok\.com|twitter\.com|x\.com|instagram\.com|reddit\.com|twitch\.tv|bilibili\.com|dailymotion\.com)$/i

function isPortalUrl(value: string): boolean {
  try {
    return PORTAL_HOSTS.test(new URL(value.trim()).hostname)
  } catch {
    return false
  }
}

export function DownloaderPanel() {
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)
  const caps = detectCapabilities()

  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<Mode>('direct')
  // Off by default: a download that lands in the session can be fed straight
  // into the converter or the sampler, whereas one streamed to disk cannot.
  const [streamToDiskEnabled, setStreamToDiskEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<TransferProgress | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [playlist, setPlaylist] = useState<HlsPlaylist | null>(null)
  const [variantUrl, setVariantUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Off on every load. Opting into sending an address to a third party is a
  // decision worth making deliberately, not one to inherit from last week.
  const [serviceEnabled, setServiceEnabled] = useState(false)
  const [service, setService] = useState<ServiceSettings>(() => readServiceSettings())
  const [apiKey, setApiKey] = useState('')
  const [items, setItems] = useState<ServiceItem[] | null>(null)

  const updateService = (patch: Partial<ServiceSettings>) => {
    setService((current) => {
      const next = { ...current, ...patch }
      writeServiceSettings(next)
      return next
    })
  }

  const detectedHls = /\.m3u8(\?|$)/i.test(url.trim())
  const detectedPortal = isPortalUrl(url)
  const effectiveMode: Mode = detectedHls ? 'hls' : detectedPortal && serviceEnabled ? 'service' : mode

  const reset = () => {
    setError(null)
    setPlaylist(null)
    setVariantUrl('')
    setItems(null)
  }

  const handleFailure = (failure: unknown, scope: string) => {
    if (failure instanceof DOMException && failure.name === 'AbortError') return
    if (failure instanceof TransferError && failure.kind === 'aborted') return
    const message = failure instanceof Error ? failure.message : String(failure)
    setError(message)
    log(scope, message, 'error')
  }

  const downloadDirect = async () => {
    const target = url.trim()
    if (!target) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    reset()

    try {
      const name = sanitizeFilename(new URL(target).pathname.split('/').pop() || 'download')

      if (streamToDiskEnabled && caps.fileSystemAccess) {
        // Straight to disk: a large file never has to fit in this tab's heap.
        await streamToDisk(target, name, setProgress, controller.signal)
        log('download', `${name} direkt auf die Festplatte geschrieben`)
        return
      }

      const media = await fetchMedia(target, setProgress, controller.signal)
      addAsset({
        name: media.filename,
        bytes: media.bytes,
        mime: media.contentType ?? 'application/octet-stream',
        sizeBytes: media.bytes.byteLength,
        kind: kindFromMime(media.contentType ?? '', media.filename),
        audio: null,
        durationSeconds: null,
        origin: 'download',
      })
      log('download', `${media.filename} geladen (${formatBytes(media.bytes.byteLength)})`)
    } catch (failure) {
      handleFailure(failure, 'download')
    } finally {
      setBusy(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  const inspectPlaylist = async () => {
    const target = url.trim()
    if (!target) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    reset()

    try {
      const parsed = await fetchPlaylist(target, controller.signal)
      setPlaylist(parsed)
      if (parsed.kind === 'master' && parsed.variants.length) {
        setVariantUrl(parsed.variants[0].url)
        log('hls', `${parsed.variants.length} Qualitätsstufen gefunden`)
      } else {
        log('hls', `${parsed.segments.length} Segmente gefunden`)
      }
    } catch (failure) {
      handleFailure(failure, 'hls')
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const downloadHls = async () => {
    if (!playlist) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)

    try {
      let media = playlist
      if (media.kind === 'master') {
        setNote('Qualitätsstufe wird geladen')
        media = await fetchPlaylist(variantUrl || media.variants[0].url, controller.signal)
      }

      setNote('Segmente werden geladen')
      const segments = await fetchHlsSegments(
        media,
        (done, total, bytes) => {
          setProgress({
            receivedBytes: bytes,
            totalBytes: null,
            fraction: done / total,
            bytesPerSecond: 0,
          })
          setNote(`Segment ${done} von ${total}`)
        },
        controller.signal,
      )

      // Concatenated transport-stream segments are playable but seek badly;
      // remuxing to MP4 costs one stream copy and no re-encode.
      setNote('Wird zu MP4 zusammengefasst')
      setProgress(null)
      await loadFfmpeg()
      const { files } = await runFfmpeg({
        input: { 'stream.ts': segments },
        output: ['stream.mp4'],
        args: ['-i', 'stream.ts', '-c', 'copy', '-movflags', '+faststart', 'stream.mp4'],
        signal: controller.signal,
      })

      const bytes = files['stream.mp4']
      const name = sanitizeFilename(`${new URL(url).hostname}-stream.mp4`)
      addAsset({
        name,
        bytes,
        mime: 'video/mp4',
        sizeBytes: bytes.byteLength,
        kind: 'video',
        audio: null,
        durationSeconds: null,
        origin: 'download',
      })
      saveBytes(bytes, name, 'video/mp4')
      log('hls', `${name} erzeugt (${formatBytes(bytes.byteLength)})`)
    } catch (failure) {
      handleFailure(failure, 'hls')
    } finally {
      setBusy(false)
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  /** Ask the service what it has, then pull the item it points at. */
  const runService = async (item?: ServiceItem) => {
    const target = url.trim()
    if (!target) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    if (!item) reset()
    else setError(null)

    try {
      let chosen = item
      if (!chosen) {
        setNote('Dienst wird gefragt')
        const offered = await resolveMedia(target, service, apiKey || null, controller.signal)
        if (offered.length > 1) {
          // A post with several attachments: let the user pick rather than guess.
          setItems(offered)
          log('dienst', `${offered.length} Medien gefunden`)
          return
        }
        chosen = offered[0]
      }

      setNote('Datei wird geholt')
      const media = await fetchMedia(chosen.url, setProgress, controller.signal)
      const name = sanitizeFilename(chosen.filename || media.filename)
      addAsset({
        name,
        bytes: media.bytes,
        mime: media.contentType ?? 'application/octet-stream',
        sizeBytes: media.bytes.byteLength,
        kind: kindFromMime(media.contentType ?? '', name),
        audio: null,
        durationSeconds: null,
        origin: 'download',
      })
      setItems(null)
      log('dienst', `${name} geladen (${formatBytes(media.bytes.byteLength)}) — über einen fremden Server`)
    } catch (failure) {
      if (failure instanceof ServiceError) {
        setError(failure.message)
        log('dienst', failure.message, 'error')
      } else {
        handleFailure(failure, 'dienst')
      }
    } finally {
      setBusy(false)
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[21px]">
        <Card tone="keylime">
          <Eyebrow>Downloader</Eyebrow>
          <h2 className="display-md mt-[11px] mb-[14px]">Medien direkt in den Tab laden</h2>
          <p className="max-w-[60ch] text-body leading-[1.6] text-prose/85">
            Bei direkten Links und HLS-Playlisten holt der Browser die Datei selbst — es gibt keinen
            Server dazwischen, der die Adresse mitlesen könnte. Direkte Links landen im
            Arbeitsspeicher oder, wo die Dateisystem-API vorhanden ist, gleich auf der Festplatte;
            HLS-Segmente werden lokal zu einer MP4 zusammengefasst.
          </p>
          {serviceEnabled ? (
            <p className="mt-[11px] max-w-[60ch] text-[13px] leading-[1.6] text-muted">
              Der Extraktions-Dienst ist eingeschaltet. Für Portal-Adressen gilt das oben Gesagte
              nicht — die Anfrage läuft dann über einen fremden Server. Siehe unten.
            </p>
          ) : null}

          <div className="mt-[28px] flex flex-col gap-[18px]">
            <Field
              label="Adresse"
              hint={
                detectedHls
                  ? 'HLS-Playlist erkannt.'
                  : detectedPortal
                    ? serviceEnabled
                      ? 'Portal erkannt — der Abruf läuft über den hinterlegten Dienst.'
                      : 'Portal erkannt. Direkt geht das nicht; schalten Sie unten den Dienst ein.'
                    : 'Direkter Link zu einer Audio- oder Videodatei.'
              }
            >
              <TextInput
                type="url"
                inputMode="url"
                placeholder="https://beispiel.org/aufnahme.mp3"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                  reset()
                }}
              />
            </Field>

            {!detectedHls ? (
              <Field label="Art">
                <Select value={effectiveMode} onChange={(event) => setMode(event.target.value as Mode)}>
                  <option value="direct">Direkte Datei</option>
                  <option value="hls">HLS-Playlist (.m3u8)</option>
                  <option value="service" disabled={!serviceEnabled}>
                    Portal über einen Dienst {serviceEnabled ? '' : '(ausgeschaltet)'}
                  </option>
                </Select>
              </Field>
            ) : null}

            {effectiveMode === 'direct' ? (
              <Toggle
                label="Direkt auf die Festplatte schreiben"
                hint={
                  caps.fileSystemAccess
                    ? 'Für sehr große Dateien. Die Datei landet dann nicht in der Sitzung und steht den anderen Werkzeugen nicht zur Verfügung.'
                    : 'Dieser Browser bietet die Dateisystem-API nicht an.'
                }
                checked={streamToDiskEnabled && caps.fileSystemAccess}
                onChange={setStreamToDiskEnabled}
                disabled={!caps.fileSystemAccess}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-[11px]">
              {effectiveMode === 'service' ? (
                <Button onClick={() => runService()} disabled={busy || !url.trim() || !service.endpoint}>
                  {busy ? 'Lädt…' : 'Über den Dienst laden'}
                  {!busy ? <ArrowRight /> : null}
                </Button>
              ) : effectiveMode === 'direct' ? (
                <Button onClick={downloadDirect} disabled={busy || !url.trim()}>
                  {busy ? 'Lädt…' : 'Laden'}
                  {!busy ? <ArrowRight /> : null}
                </Button>
              ) : (
                <>
                  <Button onClick={inspectPlaylist} disabled={busy || !url.trim()}>
                    {busy && !playlist ? 'Wird gelesen…' : 'Playlist lesen'}
                  </Button>
                  {playlist ? (
                    <Button variant="quiet" onClick={downloadHls} disabled={busy}>
                      {busy ? 'Lädt…' : 'Stream laden'}
                    </Button>
                  ) : null}
                </>
              )}
              {busy ? (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  Abbrechen
                </Button>
              ) : null}
            </div>

            {busy || progress ? (
              <Progress
                value={progress?.fraction ?? null}
                label={
                  note ??
                  (progress
                    ? `${formatBytes(progress.receivedBytes)}${
                        progress.totalBytes ? ` von ${formatBytes(progress.totalBytes)}` : ''
                      }${progress.bytesPerSecond ? ` · ${formatBytes(progress.bytesPerSecond)}/s` : ''}`
                    : 'Verbindung wird aufgebaut')
                }
              />
            ) : null}
          </div>
        </Card>

        {playlist && playlist.kind === 'master' ? (
          <Card tone="slate">
            <Eyebrow>Qualitätsstufen</Eyebrow>
            <div className="mt-[18px] rounded-card bg-raised p-[28px]">
              <Field label="Stufe">
                <Select value={variantUrl} onChange={(event) => setVariantUrl(event.target.value)}>
                  {playlist.variants.map((variant) => (
                    <option key={variant.url} value={variant.url}>
                      {variant.resolution ?? 'unbekannt'} · {Math.round(variant.bandwidth / 1000)} kbit/s
                      {variant.codecs ? ` · ${variant.codecs}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
        ) : null}

        {playlist && playlist.kind === 'media' ? (
          <Card tone="slate">
            <Eyebrow>Playlist</Eyebrow>
            <div className="mt-[18px] flex flex-wrap gap-[7px]">
              <Badge tone="forest">{playlist.segments.length} Segmente</Badge>
              {playlist.encrypted ? <Badge>verschlüsselt</Badge> : null}
            </div>
          </Card>
        ) : null}

        {items ? (
          <Card tone="slate">
            <Eyebrow>Auswahl</Eyebrow>
            <p className="mt-[11px] text-[13px] text-muted">
              Der Beitrag enthält mehrere Medien. Wählen Sie, was geholt werden soll.
            </p>
            <ul className="mt-[18px] flex flex-col gap-[7px]">
              {items.map((item) => (
                <li
                  key={item.url}
                  className="flex flex-wrap items-center justify-between gap-[11px] rounded-card bg-raised px-[18px] py-[14px]"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-ink">{item.filename}</span>
                  <Badge>{item.kind}</Badge>
                  <Button size="sm" onClick={() => runService(item)} disabled={busy}>
                    Holen
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {error ? (
          <Notice tone="error" title="Nicht abrufbar">
            {error}
          </Notice>
        ) : null}

        <Card tone={serviceEnabled ? 'sage' : 'cream'} className={serviceEnabled ? '' : 'ring-1 ring-inset ring-line'}>
          <Eyebrow>YouTube und andere Portale</Eyebrow>
          <p className="mt-[11px] max-w-[62ch] text-[13px] leading-[1.6] text-prose/85">
            Direkt geht das nicht: Portale liefern ihre Medien ohne{' '}
            <code className="font-mono text-[12px]">Access-Control-Allow-Origin</code> aus, und der
            Browser lässt eine fremde Seite deshalb nicht an die Daten. Das ist eine Schutzmaßnahme,
            keine Lücke. Möglich wird es nur mit einem Server als Zwischenstation.
          </p>

          <div className="mt-[21px]">
            <Toggle
              label="Abruf über einen Extraktions-Dienst erlauben"
              hint="Standardmäßig aus. Bleibt aus, bis Sie es in dieser Sitzung ausdrücklich einschalten."
              checked={serviceEnabled}
              onChange={(value) => {
                setServiceEnabled(value)
                reset()
                log(
                  'dienst',
                  value
                    ? 'Extraktions-Dienst eingeschaltet — Adressen verlassen ab jetzt den Rechner'
                    : 'Extraktions-Dienst ausgeschaltet',
                  value ? 'warn' : 'info',
                )
              }}
            />
          </div>

          {serviceEnabled ? (
            <div className="mt-[21px] flex flex-col gap-[18px]">
              <div className="rounded-card bg-raised p-[21px] text-[13px] leading-[1.6] ring-1 ring-inset ring-ink/30">
                <p className="mb-[11px] font-semibold text-ink">{SERVICE_DISCLAIMER.title}</p>
                {SERVICE_DISCLAIMER.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="mb-[11px] text-prose/85">
                    {paragraph}
                  </p>
                ))}
                <p className="mt-[14px] border-t border-line pt-[14px] text-muted">
                  {SERVICE_DISCLAIMER.liability}
                </p>
              </div>

              <div className="grid gap-[18px] sm:grid-cols-2">
                <Field
                  label="Adresse des Dienstes"
                  className="sm:col-span-2"
                  hint="Eine cobalt-kompatible Instanz — eine, der Sie vertrauen, oder Ihre eigene. Wird lokal gespeichert."
                >
                  <TextInput
                    type="url"
                    inputMode="url"
                    placeholder="https://meine-instanz.example/"
                    value={service.endpoint}
                    onChange={(event) => updateService({ endpoint: event.target.value })}
                  />
                </Field>

                <Field
                  label="Zugangsschlüssel"
                  className="sm:col-span-2"
                  hint="Nur falls die Instanz einen verlangt. Wird nicht gespeichert und gilt bis zum Neuladen."
                >
                  <TextInput
                    type="password"
                    autoComplete="off"
                    placeholder="optional"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </Field>

                <Field label="Was holen">
                  <Select
                    value={service.downloadMode}
                    onChange={(event) => updateService({ downloadMode: event.target.value as DownloadMode })}
                  >
                    <option value="auto">Video mit Ton</option>
                    <option value="audio">Nur Ton</option>
                    <option value="mute">Video ohne Ton</option>
                  </Select>
                </Field>

                {service.downloadMode === 'audio' ? (
                  <Field label="Tonformat">
                    <Select
                      value={service.audioFormat}
                      onChange={(event) => updateService({ audioFormat: event.target.value as AudioFormat })}
                    >
                      <option value="best">Bestes verfügbares</option>
                      <option value="opus">Opus</option>
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                    </Select>
                  </Field>
                ) : (
                  <Field label="Auflösung">
                    <Select
                      value={service.videoQuality}
                      onChange={(event) => updateService({ videoQuality: event.target.value as VideoQuality })}
                    >
                      <option value="max">Höchste</option>
                      <option value="2160">2160p</option>
                      <option value="1440">1440p</option>
                      <option value="1080">1080p</option>
                      <option value="720">720p</option>
                      <option value="480">480p</option>
                      <option value="360">360p</option>
                    </Select>
                  </Field>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-[18px] text-[13px] leading-[1.6] text-muted">
              Ohne den Dienst funktionieren weiterhin: eigene Dateien, offene Archive, Podcast-Feeds,
              Mediatheken mit CORS-Freigabe und HLS-Streams, die ihre Segmente freigeben.
            </p>
          )}
        </Card>
      </div>

      <aside className="flex flex-col gap-[21px]">
        <Card tone="mint">
          <AssetList />
        </Card>
      </aside>
    </div>
  )
}
