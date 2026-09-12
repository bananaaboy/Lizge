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
  findLocalInstance,
  localJobArgs,
  localJobExtension,
  probeService,
  resolveMedia,
  SERVICE_DISCLAIMER,
  ServiceError,
  type AudioFormat,
  type DownloadMode,
  type LocalJob,
  type ServiceInfo,
  type ServiceItem,
  type ServiceSettings,
  type VideoQuality,
} from '../../lib/service'
import { loadFfmpeg, runFfmpeg } from '../../lib/ffmpegClient'
import { formatBytes, sanitizeFilename, withExtension } from '../../lib/format'
import {
  composeFile,
  DEFAULT_PORT,
  localCandidates,
  oneLiner,
  rememberedInstances,
  rememberInstance,
  unixScript,
  windowsScript,
} from '../../lib/selfhost'
import { holdScreenAwake } from '../../lib/wakeLock'
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
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [searching, setSearching] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [known, setKnown] = useState<string[]>(() => rememberedInstances())
  /** The last file this panel fetched, so saving it is one click away. */
  const [fetched, setFetched] = useState<{ name: string; bytes: Uint8Array; mime: string } | null>(null)

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
    setFetched(null)
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
      const mime = media.contentType ?? 'application/octet-stream'
      addAsset({
        name: media.filename,
        bytes: media.bytes,
        mime,
        sizeBytes: media.bytes.byteLength,
        kind: kindFromMime(mime, media.filename),
        audio: null,
        durationSeconds: null,
        origin: 'download',
      })
      setFetched({ name: media.filename, bytes: media.bytes, mime })
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
      setFetched({ name, bytes, mime: 'video/mp4' })
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

  /** Fetches one already-resolved item into the session. */
  const pullItem = async (item: ServiceItem, signal: AbortSignal) => {
    setNote('Datei wird geholt')
    const media = await fetchMedia(item.url, setProgress, signal)
    const name = sanitizeFilename(item.filename || media.filename)
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
    log('dienst', `${name} geladen (${formatBytes(media.bytes.byteLength)}) — über einen fremden Server`)
  }

  /**
   * Finishes a `local-processing` job.
   *
   * The instance hands over the raw parts — YouTube above 360p keeps video and
   * audio in separate streams — and expects the client to combine them. FFmpeg
   * is already here, so the finished file is assembled on this machine and the
   * instance never sees it.
   */
  const runLocalJob = async (job: LocalJob, signal: AbortSignal) => {
    const inputs: Record<string, Uint8Array> = {}
    const names: string[] = []

    for (const [index, tunnel] of job.tunnels.entries()) {
      setNote(`Teil ${index + 1} von ${job.tunnels.length} wird geholt`)
      let bytes: Uint8Array
      if (job.isHls) {
        // The tunnel is a playlist, not a file; pull its segments first.
        const playlist = await fetchPlaylist(tunnel, signal)
        bytes = await fetchHlsSegments(
          playlist,
          (done, total, received) =>
            setProgress({ receivedBytes: received, totalBytes: null, fraction: done / total, bytesPerSecond: 0 }),
          signal,
        )
      } else {
        bytes = (await fetchMedia(tunnel, setProgress, signal)).bytes
      }
      const name = `part${index}`
      inputs[name] = bytes
      names.push(name)
    }

    setProgress(null)
    setNote('Wird lokal zusammengefügt')
    await loadFfmpeg()

    const extension = localJobExtension(job)
    const outputName = `out.${extension}`
    const args = localJobArgs(job, names, outputName)
    log('dienst', `ffmpeg ${args.join(' ')}`)

    const { files } = await runFfmpeg({ input: inputs, output: [outputName], args, signal })
    const bytes = files[outputName]
    const name = sanitizeFilename(withExtension(job.filename, extension))

    addAsset({
      name,
      bytes,
      mime: job.mimeType,
      sizeBytes: bytes.byteLength,
      kind: kindFromMime(job.mimeType, name),
      audio: null,
      durationSeconds: null,
      origin: 'download',
    })
    setFetched({ name, bytes, mime: job.mimeType })
    log('dienst', `${name} lokal zusammengefügt (${formatBytes(bytes.byteLength)})`)
  }

  /** Ask the service what it has, then finish the job it describes. */
  const runService = async (item?: ServiceItem) => {
    const target = url.trim()
    if (!target) return
    const controller = new AbortController()
    abortRef.current = controller
    const releaseWakeLock = await holdScreenAwake()
    setBusy(true)
    if (!item) reset()
    else setError(null)

    try {
      if (item) {
        await pullItem(item, controller.signal)
        setItems(null)
        return
      }

      setNote('Dienst wird gefragt')
      const result = await resolveMedia(target, service, apiKey || null, controller.signal)

      if (result.kind === 'picker') {
        // A post with several attachments: let the user pick rather than guess.
        setItems(result.items)
        log('dienst', `${result.items.length} Medien gefunden`)
        return
      }

      if (result.kind === 'local') {
        await runLocalJob(result.job, controller.signal)
        return
      }

      await pullItem(result.item, controller.signal)
    } catch (failure) {
      if (failure instanceof ServiceError) {
        setError(failure.message)
        log('dienst', failure.message, 'error')
      } else {
        handleFailure(failure, 'dienst')
      }
    } finally {
      releaseWakeLock()
      setBusy(false)
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  /**
   * Looks for an instance on this machine and fills the field in.
   *
   * This is the closest a web page can get to "set it up for me": it cannot
   * start anything, but once something is running it can find it.
   */
  const searchLocal = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setError(null)
    setServiceInfo(null)
    try {
      const found = await findLocalInstance(localCandidates(), controller.signal)
      if (found) {
        updateService({ endpoint: found.endpoint })
        setServiceInfo(found.info)
        setKnown(rememberInstance(found.endpoint))
        setSetupOpen(false)
        log('dienst', `Lokale Instanz gefunden: ${found.endpoint} (cobalt ${found.info.version})`)
      } else {
        setSetupOpen(true)
        setError(
          'Auf diesem Rechner läuft keine Instanz auf Port ' +
            `${DEFAULT_PORT}. Unten steht, wie Sie eine einrichten.`,
        )
      }
    } finally {
      setSearching(false)
      abortRef.current = null
    }
  }

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(oneLiner())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the command is visible either way.
    }
  }

  /** Checks the endpoint and says precisely what is wrong with it. */
  const checkService = async () => {
    if (!service.endpoint.trim()) return
    const controller = new AbortController()
    abortRef.current = controller
    setChecking(true)
    setServiceInfo(null)
    setError(null)
    try {
      const info = await probeService(service.endpoint, apiKey || null, controller.signal)
      setServiceInfo(info)
      setKnown(rememberInstance(service.endpoint.trim()))
      log('dienst', `Instanz erreichbar: cobalt ${info.version}, ${info.services.length} Dienste`)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure)
      setError(message)
      log('dienst', message, 'error')
    } finally {
      setChecking(false)
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

          {fetched ? (
            <div className="flex flex-wrap items-center gap-[11px] rounded-card bg-raised px-[18px] py-[14px]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-ink">{fetched.name}</p>
                <p className="numeric text-[12px] text-muted">{formatBytes(fetched.bytes.byteLength)} · in der Sitzung</p>
              </div>
              <Button size="sm" onClick={() => saveBytes(fetched.bytes, fetched.name, fetched.mime)}>
                Speichern
                <ArrowRight />
              </Button>
            </div>
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
                  <div className="flex flex-wrap items-center gap-[9px]">
                    <TextInput
                      type="url"
                      inputMode="url"
                      className="min-w-[220px] flex-1"
                      placeholder="https://meine-instanz.example/"
                      value={service.endpoint}
                      onChange={(event) => {
                        updateService({ endpoint: event.target.value })
                        setServiceInfo(null)
                      }}
                    />
                    <Button size="sm" variant="quiet" onClick={searchLocal} disabled={searching || checking}>
                      {searching ? 'Sucht…' : 'Suchen'}
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={checkService}
                      disabled={checking || searching || !service.endpoint.trim()}
                    >
                      {checking ? 'Prüft…' : 'Prüfen'}
                    </Button>
                  </div>
                </Field>

                {known.length > 0 && !serviceInfo ? (
                  <div className="flex flex-wrap items-center gap-[7px] sm:col-span-2">
                    <span className="text-[12px] text-muted">Zuletzt benutzt</span>
                    {known.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => updateService({ endpoint: entry })}
                        title={entry}
                        className="max-w-[220px] truncate rounded-pill bg-panel-soft px-[11px] py-[5px] text-[12px] text-ink hover:bg-panel-mid"
                      >
                        {entry.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </button>
                    ))}
                  </div>
                ) : null}

                {serviceInfo ? (
                  <div className="flex flex-wrap items-center gap-[7px] sm:col-span-2">
                    <Badge tone="forest">cobalt {serviceInfo.version}</Badge>
                    {/* Whether the instance actually offers YouTube is the thing
                        people get wrong, so it is stated rather than implied. */}
                    <Badge>
                      {serviceInfo.services.includes('youtube')
                        ? 'YouTube unterstützt'
                        : 'YouTube nicht aktiviert'}
                    </Badge>
                    <Badge>
                      {serviceInfo.services.length} {serviceInfo.services.length === 1 ? 'Dienst' : 'Dienste'}
                    </Badge>
                    {serviceInfo.needsTurnstile ? <Badge>verlangt Bot-Prüfung</Badge> : null}
                  </div>
                ) : null}

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

              <div className="rounded-card bg-raised p-[14px]">
                <button
                  type="button"
                  onClick={() => setSetupOpen((value) => !value)}
                  aria-expanded={setupOpen}
                  className="flex w-full items-center justify-between gap-3 rounded-nav text-left"
                >
                  <span className="text-[13px] font-semibold text-ink">
                    Eigene Instanz auf diesem Rechner einrichten
                  </span>
                  <span className="text-[12px] text-muted">{setupOpen ? 'Schließen' : 'Anzeigen'}</span>
                </button>

                {setupOpen ? (
                  <div className="mt-[11px] flex flex-col gap-[11px] text-[12px] leading-[1.5] text-prose/85">
                    <p>
                      Eine öffentliche Instanz gibt es nicht mehr — die frühere wurde von YouTube
                      gesperrt, die verbliebenen verlangen die Erlaubnis ihrer Betreiber. Eine eigene
                      auf dem eigenen Rechner lädt dagegen in der Regel problemlos, weil sie von
                      Ihrer Leitung aus anfragt statt von einer bekannten.
                    </p>
                    <p className="text-muted">
                      Diese Seite kann sie nicht für Sie starten: eine Webseite darf keine Programme
                      auf Ihrem Rechner ausführen, und das ist gut so. Sie bekommt hier aber alles
                      Nötige fertig geschrieben, und sobald etwas läuft, findet „Suchen“ es selbst.
                    </p>

                    <div className="flex flex-wrap gap-[7px]">
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() =>
                          saveBytes(
                            new TextEncoder().encode(composeFile()),
                            'docker-compose.yml',
                            'text/yaml',
                          )
                        }
                      >
                        docker-compose.yml
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() =>
                          saveBytes(
                            new TextEncoder().encode(unixScript()),
                            'cobalt-starten.sh',
                            'text/x-shellscript',
                          )
                        }
                      >
                        Skript für macOS/Linux
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() =>
                          saveBytes(
                            new TextEncoder().encode(windowsScript()),
                            'cobalt-starten.ps1',
                            'text/plain',
                          )
                        }
                      >
                        Skript für Windows
                      </Button>
                    </div>

                    <div>
                      <p className="mb-[4px] text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                        Oder ein einziger Befehl
                      </p>
                      <div className="flex flex-wrap items-center gap-[7px]">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-nav bg-panel-soft px-[11px] py-[9px] font-mono text-[11px] whitespace-pre text-prose">
                          {oneLiner()}
                        </code>
                        <Button size="sm" variant="quiet" onClick={copyCommand}>
                          {copied ? 'Kopiert' : 'Kopieren'}
                        </Button>
                      </div>
                    </div>

                    <p className="text-muted">
                      Voraussetzung ist Docker. Danach läuft der Dienst unter{' '}
                      <code className="font-mono">http://localhost:{DEFAULT_PORT}/</code>, nur auf
                      diesem Rechner erreichbar. Lesen Sie die Dateien, bevor Sie sie ausführen — das
                      gilt für alles, was eine Webseite Ihnen zum Ausführen gibt. Die
                      Originalanleitung steht unter{' '}
                      <a
                        className="underline underline-offset-2 hover:text-ink"
                        href="https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md"
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        cobalt/docs/run-an-instance.md
                      </a>
                      .
                    </p>
                  </div>
                ) : null}
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
