/**
 * Media downloader — one panel, three paths.
 *
 * A direct link, an HLS playlist and a portal URL are the same task from the
 * user's side: paste an address, get the file. So they share one address field
 * and one button, and the path is picked from the address itself rather than
 * asked about up front. The chips underneath say which path was chosen and let
 * it be overridden.
 *
 * The third path is the one that costs something. A browser can only read a
 * remote file if that server allows it, and portals do not — so reaching them
 * means a server in the middle that sees the address and the IP. That option is
 * off by default, and switching it on unfolds its terms in place rather than
 * hiding them behind a link.
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
  // Null means "whatever the address implies"; a value is a deliberate override.
  const [modeOverride, setModeOverride] = useState<Mode | null>(null)
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
  const autoMode: Mode = detectedHls ? 'hls' : detectedPortal && serviceEnabled ? 'service' : 'direct'
  const effectiveMode: Mode = modeOverride ?? autoMode

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

  const PATHS: { id: Mode; label: string; hint: string; disabled: boolean }[] = [
    { id: 'direct', label: 'Direkt', hint: 'Der Browser holt die Datei selbst.', disabled: false },
    { id: 'hls', label: 'HLS', hint: 'Segmente laden, lokal zu MP4 fassen.', disabled: false },
    {
      id: 'service',
      label: 'Portal',
      hint: serviceEnabled ? 'Läuft über einen fremden Server.' : 'Muss unten eingeschaltet werden.',
      disabled: !serviceEnabled,
    },
  ]

  const canStart = Boolean(url.trim()) && (effectiveMode !== 'service' || Boolean(service.endpoint))

  const pathNote =
    detectedPortal && effectiveMode !== 'service'
      ? serviceEnabled
        ? 'Portale lassen den Browser nicht direkt heran — hier den Weg „Portal“ wählen.'
        : 'Portale brauchen die Option unten.'
      : PATHS.find((path) => path.id === effectiveMode)?.hint

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card tone="keylime" size="compact">
        <div className="flex flex-wrap items-baseline justify-between gap-x-[14px] gap-y-[4px]">
          <Eyebrow>Downloader</Eyebrow>
          <span className="text-[12px] text-muted">Adresse einfügen — der Weg ergibt sich daraus.</span>
        </div>

        <div className="mt-[14px] flex flex-col gap-[14px]">
          {/* ---- address ---------------------------------------------------- */}
          <TextInput
            type="url"
            inputMode="url"
            aria-label="Adresse"
            placeholder="https://beispiel.org/aufnahme.mp3"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              // A new address re-decides the path on its own.
              setModeOverride(null)
              reset()
            }}
          />

          {/* ---- path chips and the action share one row ------------------- */}
          <div className="flex flex-wrap items-center gap-[9px]">
            <div role="radiogroup" aria-label="Weg" className="flex gap-[4px] rounded-pill bg-raised p-[3px]">
              {PATHS.map((path) => {
                const active = path.id === effectiveMode
                return (
                  <button
                    key={path.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={path.disabled}
                    title={path.hint}
                    onClick={() => {
                      setModeOverride(path.id)
                      reset()
                    }}
                    className={`rounded-pill px-[14px] py-[6px] text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      active ? 'bg-ink text-on-ink' : 'text-ink hover:bg-panel-mid'
                    }`}
                  >
                    {path.label}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-[9px] sm:ml-auto">
              {effectiveMode === 'service' ? (
                <Button size="sm" onClick={() => runService()} disabled={busy || !canStart}>
                  {busy ? 'Lädt…' : 'Über den Dienst laden'}
                  {!busy ? <ArrowRight /> : null}
                </Button>
              ) : effectiveMode === 'hls' ? (
                <Button size="sm" onClick={playlist ? downloadHls : inspectPlaylist} disabled={busy || !canStart}>
                  {busy ? 'Lädt…' : playlist ? 'Stream laden' : 'Playlist lesen'}
                  {!busy ? <ArrowRight /> : null}
                </Button>
              ) : (
                <Button size="sm" onClick={downloadDirect} disabled={busy || !canStart}>
                  {busy ? 'Lädt…' : 'Laden'}
                  {!busy ? <ArrowRight /> : null}
                </Button>
              )}

              {busy ? (
                <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
                  Abbrechen
                </Button>
              ) : null}
            </div>
          </div>

          <p className="-mt-[7px] text-[12px] leading-[1.45] text-muted">
            {pathNote}
            {effectiveMode === 'service' && !service.endpoint
              ? ' Erst eine Adresse für den Dienst hinterlegen.'
              : ''}
          </p>

          {/* ---- path-specific extras, only when they apply ----------------- */}
          {effectiveMode === 'direct' && caps.fileSystemAccess ? (
            <Toggle
              label="Direkt auf die Festplatte schreiben"
              hint="Für sehr große Dateien. Landet dann nicht in der Sitzung."
              checked={streamToDiskEnabled}
              onChange={setStreamToDiskEnabled}
            />
          ) : null}

          {playlist && playlist.kind === 'master' ? (
            <Field label="Qualitätsstufe">
              <Select value={variantUrl} onChange={(event) => setVariantUrl(event.target.value)}>
                {playlist.variants.map((variant) => (
                  <option key={variant.url} value={variant.url}>
                    {variant.resolution ?? 'unbekannt'} · {Math.round(variant.bandwidth / 1000)} kbit/s
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {playlist && playlist.kind === 'media' ? (
            <div className="flex flex-wrap gap-[7px]">
              <Badge tone="forest">{playlist.segments.length} Segmente</Badge>
              {playlist.encrypted ? <Badge>verschlüsselt</Badge> : null}
            </div>
          ) : null}

          {items ? (
            <ul className="flex flex-col gap-[4px]">
              {items.map((item) => (
                <li
                  key={item.url}
                  className="flex flex-wrap items-center gap-[9px] rounded-nav bg-raised px-[14px] py-[9px]"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.filename}</span>
                  <Badge>{item.kind}</Badge>
                  <Button size="sm" onClick={() => runService(item)} disabled={busy}>
                    Holen
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

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

          {error ? (
            <Notice tone="error" title="Nicht abrufbar">
              {error}
            </Notice>
          ) : null}
        </div>

        {/* ---- external downloaders: switch, options, then the terms ------- */}
        <div className="mt-[18px] border-t border-line pt-[18px]">
          <Toggle
            label="YouTube und externe Downloader"
            hint={
              serviceEnabled
                ? undefined
                : 'Aus. Ohne sie gehen eigene Dateien, offene Archive, Podcast-Feeds und HLS-Streams mit CORS-Freigabe.'
            }
            checked={serviceEnabled}
            onChange={(value) => {
              setServiceEnabled(value)
              setModeOverride(null)
              reset()
              log(
                'dienst',
                value
                  ? 'Externe Downloader eingeschaltet — Adressen verlassen ab jetzt den Rechner'
                  : 'Externe Downloader ausgeschaltet',
                value ? 'warn' : 'info',
              )
            }}
          />

          {serviceEnabled ? (
            <div className="mt-[14px] flex flex-col gap-[14px]">
              {/* Settings first: this is what someone came here to fill in. */}
              <div className="grid gap-[14px] sm:grid-cols-2">
                <Field label="Dienst" className="sm:col-span-2">
                  <TextInput
                    type="url"
                    inputMode="url"
                    placeholder="https://meine-instanz.example/"
                    value={service.endpoint}
                    onChange={(event) => updateService({ endpoint: event.target.value })}
                  />
                </Field>

                <Field label="Zugangsschlüssel" className="sm:col-span-2">
                  <TextInput
                    type="password"
                    autoComplete="off"
                    placeholder="optional, wird nicht gespeichert"
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

              {/* Terms last, under the controls they apply to. */}
              <div className="rounded-card bg-raised p-[14px] text-[12px] leading-[1.5] ring-1 ring-inset ring-ink/30">
                <p className="mb-[7px] font-semibold text-ink">{SERVICE_DISCLAIMER.title}</p>
                {SERVICE_DISCLAIMER.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="mb-[7px] text-prose/85">
                    {paragraph}
                  </p>
                ))}
                <p className="mt-[9px] border-t border-line pt-[9px] text-muted">
                  {SERVICE_DISCLAIMER.liability}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <aside>
        <Card tone="mint" size="compact">
          <AssetList />
        </Card>
      </aside>
    </div>
  )
}
