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

import { useEffect, useRef, useState } from 'react'

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
  localNetworkPermission,
  pageIsLocal,
  requestLocalAccess,
  SERVICE_DISCLAIMER,
  ServiceError,
  watchForInstance,
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
  BRIDGE_PORT,
  bridgeScript,
  MIRROR_PORT,
  mirrorScript,
  composeFile,
  DEFAULT_PORT,
  localSteps,
  manualPrerequisite,
  NODE_DOWNLOAD,
  nodeOnlyUnixScript,
  nodeOnlyWindowsScript,
  nodeUnixScript,
  nodeWindowsScript,
  localCandidates,
  oneLiner,
  rememberedInstances,
  rememberInstance,
  unixScript,
  windowsScript,
} from '../../lib/selfhost'
import { detectPlatform } from '../../lib/platform'
import { serviceConnection, setServiceConnection } from '../../lib/serviceState'
import { holdScreenAwake } from '../../lib/wakeLock'
import { kindFromMime, useSession } from '../../state/store'
import { AssetList } from '../AssetList'
import {
  ArrowRight,
  Badge,
  Button,
  Card,
  Dialog,
  Eyebrow,
  Field,
  Notice,
  Progress,
  Select,
  TextInput,
  Toggle,
} from '../ui/primitives'

type Mode = 'direct' | 'hls' | 'service'

const SERVICE_STORAGE_KEY = 'sondra:service'

/** Only the endpoint and the quality choices persist — never the API key. */
function readServiceSettings(): ServiceSettings {
  try {
    const raw = readStored(SERVICE_STORAGE_KEY, 'lizge:service')
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

/**
 * Reads a stored value, falling back to the key this app used under its old
 * name. Renaming the product should not quietly throw away what someone saved.
 */
function readStored(key: string, previous: string): string | null {
  try {
    const current = localStorage.getItem(key)
    if (current !== null) return current
    const legacy = localStorage.getItem(previous)
    if (legacy !== null) localStorage.setItem(key, legacy)
    return legacy
  } catch {
    return null
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
  //
  // Switching tabs is not a new load, though. This panel unmounts when another
  // one is shown, and starting from scratch on the way back threw away a live
  // connection while the status strip went on reporting it — the two disagreed,
  // and the panel was the one that was wrong. Both now read the same state.
  const [serviceEnabled, setServiceEnabled] = useState(() => serviceConnection().enabled)
  const [service, setService] = useState<ServiceSettings>(() => {
    const stored = readServiceSettings()
    // A live connection's address wins over the remembered one.
    const live = serviceConnection().endpoint
    return live ? { ...stored, endpoint: live } : stored
  })
  const [apiKey, setApiKey] = useState('')
  const [items, setItems] = useState<ServiceItem[] | null>(null)
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo | null>(() => serviceConnection().info)
  const [checking, setChecking] = useState(false)
  const [searching, setSearching] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [known, setKnown] = useState<string[]>(() => rememberedInstances())
  const [localWay, setLocalWay] = useState<'node' | 'docker'>('node')
  // What is already on this machine. Both start off, because assuming a
  // stranger has a developer's toolchain is how instructions end up skipping
  // the step they most needed to include.
  const [hasNode, setHasNode] = useState(false)
  const [hasGit, setHasGit] = useState(false)
  /** Setup lives in a dialog, so the page itself stays short. */
  const [setupDialog, setSetupDialog] = useState(false)
  /** Hands over the mirror, with this site's own address already in it. */
  const saveMirror = () =>
    saveBytes(
      new TextEncoder().encode(mirrorScript(window.location.origin)),
      'sondra-spiegel.mjs',
      'text/javascript',
    )

  /** The last hand-run check, kept verbatim so it can be read or pasted. */
  const [probe, setProbe] = useState<string | null>(null)
  /** How many fruitless sweeps the watcher has made, to know when to speak up. */
  const [sweeps, setSweeps] = useState(0)
  /** The guided setup is watching for an instance to come up. */
  const [waiting, setWaiting] = useState(false)
  const waitRef = useRef<AbortController | null>(null)
  /** The last file this panel fetched, so saving it is one click away. */
  const [fetched, setFetched] = useState<{ name: string; bytes: Uint8Array; mime: string } | null>(null)

  // A five-minute poll must not outlive the panel that started it.
  useEffect(() => () => waitRef.current?.abort(), [])


  const updateService = (patch: Partial<ServiceSettings>) => {
    setService((current) => {
      const next = { ...current, ...patch }
      writeServiceSettings(next)
      return next
    })
  }

  const platform = detectPlatform()
  // Empty on a page that is already local: there is nothing to mirror then, and
  // the launcher would be a step that buys nothing.
  const hostedOrigin = pageIsLocal() ? '' : window.location.origin
  const localCommand =
    localWay === 'docker'
      ? oneLiner()
      : localSteps({ hasNode, hasGit, platform, origin: window.location.origin }).join('\n')
  /** Node is missing and this system has no install command worth printing. */
  const needsNodeByHand = localWay === 'node' && manualPrerequisite({ hasNode, platform })
  const connected = serviceInfo !== null
  const endpointLabel = service.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')

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
    const mime = media.contentType ?? 'application/octet-stream'
    addAsset({
      name,
      bytes: media.bytes,
      mime,
      sizeBytes: media.bytes.byteLength,
      kind: kindFromMime(media.contentType ?? '', name),
      audio: null,
      durationSeconds: null,
      origin: 'download',
    })
    setFetched({ name, bytes: media.bytes, mime })
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

  /** Takes an instance into use and remembers where it was. */
  const adopt = (endpoint: string, info: ServiceInfo) => {
    updateService({ endpoint })
    setServiceInfo(info)
    setKnown(rememberInstance(endpoint))
    setSetupOpen(false)
    setError(null)
    setServiceConnection({ endpoint, info, searching: false })
  }

  /**
   * Looks on this machine the moment the switch goes on.
   *
   * Only this machine. A remembered remote address is filled in but not probed:
   * contacting a third party is the very thing this switch is a decision about,
   * so it waits for a deliberate click. Talking to localhost sends nothing
   * anywhere and costs nothing when the port is closed, so there is no reason
   * to make anyone ask for it.
   */
  const autoConnect = async () => {
    const controller = new AbortController()
    setSearching(true)
    try {
      const found = await findLocalInstance(localCandidates(), controller.signal)
      if (found) {
        adopt(found.endpoint, found.info)
        log('dienst', `Instanz auf diesem Rechner gefunden: ${found.endpoint}`)
        return
      }
      const remembered = rememberedInstances()[0]
      if (remembered && !service.endpoint.trim()) updateService({ endpoint: remembered })
    } finally {
      setSearching(false)
    }
  }

  const searchLocal = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setError(null)
    setServiceInfo(null)
    try {
      const found = await findLocalInstance(localCandidates(), controller.signal)
      if (found) {
        adopt(found.endpoint, found.info)
        log('dienst', `Lokale Instanz gefunden: ${found.endpoint} (cobalt ${found.info.version})`)
      } else {
        setError(
          `Auf diesem Rechner läuft nichts auf Port ${DEFAULT_PORT}. Mit „Befehl kopieren“ ` +
            'starten Sie einen Dienst; Sondra verbindet sich dann von selbst.',
        )
      }
    } finally {
      setSearching(false)
      abortRef.current = null
    }
  }

  const stopWaiting = () => {
    waitRef.current?.abort()
    waitRef.current = null
    setWaiting(false)
  }

  /**
   * Copies the command, then waits for the result of running it.
   *
   * The step people fall at is not the command — it is coming back to the page
   * afterwards and not knowing what to press. So nothing has to be pressed: the
   * page keeps looking until the instance answers and then connects itself.
   */
  const startAndWait = async () => {
    try {
      await navigator.clipboard.writeText(localCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 4000)
    } catch {
      // Clipboard access can be refused; the command is on screen either way.
    }

    stopWaiting()
    const controller = new AbortController()
    waitRef.current = controller
    setWaiting(true)
    setError(null)
    try {
      const found = await watchForInstance(localCandidates(), { signal: controller.signal })
      if (found) {
        adopt(found.endpoint, found.info)
        log('dienst', `Instanz gefunden: ${found.endpoint} (cobalt ${found.info.version})`)
      } else if (!controller.signal.aborted) {
        setError(
          `Fünf Minuten lang kam auf Port ${DEFAULT_PORT} keine Antwort. Läuft Docker? ` +
            '„Läuft schon — suchen“ prüft jederzeit erneut.',
        )
      }
    } finally {
      if (waitRef.current === controller) waitRef.current = null
      setWaiting(false)
    }
  }

  /**
   * Keeps looking for as long as the feature is on and nothing has answered.
   *
   * The old behaviour checked once when the switch went on and then stopped,
   * which is exactly backwards: the common case is switching it on, going away
   * to start the service, and coming back to a page that has long since given
   * up. Now the page is the one that waits. A refused connection on localhost
   * costs nothing, so doing it every few seconds is cheaper than making someone
   * wonder whether it worked.
   */
  useEffect(() => {
    if (!serviceEnabled || connected || waiting) return
    setSweeps(0)
    setServiceConnection({ searching: true })
    const controller = new AbortController()
    let stopped = false

    const sweep = async () => {
      while (!stopped && !controller.signal.aborted) {
        const found = await findLocalInstance(localCandidates(), controller.signal)
        if (found) {
          if (!stopped) {
            adopt(found.endpoint, found.info)
            log('dienst', `Instanz gefunden: ${found.endpoint} (cobalt ${found.info.version})`)
          }
          return
        }
        if (!stopped) setSweeps((count) => count + 1)
        await new Promise((resolve) => setTimeout(resolve, 4000))
      }
    }
    void sweep()

    return () => {
      stopped = true
      controller.abort()
      setServiceConnection({ searching: false })
    }
    // `adopt` and `log` are stable for the life of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceEnabled, connected, waiting])

  /**
   * One button: ask for what is needed, try every address, report what happened.
   *
   * This used to be two. The check ran quietly and then told you to press a
   * second button for the permission — which is a instruction, not a solution,
   * and it also meant the permission request no longer had the click behind it
   * that a prompt needs. A browser will only put that question on screen in
   * response to a real interaction, so the request that triggers it has to be
   * the first thing this does, not the second thing after a failure.
   */
  const runProbe = async () => {
    setProbe('Wird geprüft…')
    const hosted = !pageIsLocal()
    const before = await localNetworkPermission()

    // On a hosted page the annotated request comes first, while the click is
    // still fresh. That is the one that can raise the prompt.
    if (hosted && before !== 'denied') {
      setProbe(
        'Der Browser sollte jetzt fragen, ob diese Seite auf Ihren Rechner zugreifen darf. ' +
          'Erlauben Sie es — die Prüfung läuft danach weiter.',
      )
      for (const candidate of localCandidates()) {
        try {
          await requestLocalAccess(candidate)
          const info = await probeService(candidate, null, AbortSignal.timeout(8000))
          adopt(candidate, info)
          setProbe(`Verbunden mit ${candidate} — cobalt ${info.version}, ${info.services.length} Dienste.`)
          return
        } catch {
          // Next address. The report below says what the browser decided.
        }
      }
    }

    const permission = await localNetworkPermission()
    const browser = navigator.userAgent.match(/(Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? 'unbekannt'
    const lines: string[] = [
      `Diese Seite: ${window.location.origin}`,
      `Sicherer Kontext: ${window.isSecureContext ? 'ja' : 'nein'}`,
      `Erlaubnis für lokales Netzwerk: ${
        {
          granted: 'erteilt',
          denied: 'verweigert — der Browser fragt nicht mehr von selbst',
          prompt: 'noch nicht erteilt',
          unsupported: 'kennt dieser Browser nicht',
        }[permission]
      }`,
      `Browser: ${browser}`,
      '',
    ]

    for (const candidate of localCandidates()) {
      try {
        const info = await probeService(candidate, null, AbortSignal.timeout(5000))
        lines.push(`${candidate} → cobalt ${info.version}, ${info.services.length} Dienste`)
        adopt(candidate, info)
        setProbe(lines.join('\n'))
        return
      } catch (failure) {
        // Only the first sentence of each message: four paragraphs of identical
        // advice is a wall, and the summary underneath says it once. Split on a
        // period followed by a space — the naive split cut "127.0.0.1" down to
        // "127." and reported a truncated address as the thing that failed.
        const text = failure instanceof Error ? failure.message : String(failure)
        const first = text.split(/\.\s/)[0]
        lines.push(`${candidate} → ${first}${first.endsWith('.') ? '' : '.'}`)
      }
    }

    if (hosted) {
      lines.push('')
      // Leading with the permission was right until it kept not working.
      // Chrome reports it as available and never asks — measured on the real
      // site, not guessed — so pointing at it a fourth time would be advice
      // this app has no evidence for. The mirror depends on no browser
      // feature at all, so it goes first and the permission is the footnote.
      lines.push(
        permission === 'granted'
          ? 'Der Zugriff ist erlaubt, aber unter keiner Adresse antwortet ein Dienst. Läuft er, ' +
            'und steht in seinem Fenster port: 9000?'
          : 'Läuft der Dienst, dann hält ihn der Browser zurück, nicht Ihr Rechner. Der Spiegel ' +
            'unten löst das ohne Erlaubnis und ohne Nachfrage: er liefert Sondra von Ihrem ' +
            'Rechner aus, und zwischen zwei Dingen auf derselben Maschine gibt es keine Grenze, ' +
            'die jemand erlauben müsste.' +
            (permission === 'denied'
              ? ' Die Erlaubnis ist hier zusätzlich verweigert — im Schloss links in der ' +
                'Adresszeile wieder zu erlauben.'
              : ''),
      )
    } else {
      lines.push('')
      lines.push('Läuft der Dienst, und steht in seinem Fenster port: 9000?')
    }
    setProbe(lines.join('\n'))
  }

  /**
   * Stops using the service entirely.
   *
   * It has to switch the feature off too, not just drop the connection: the
   * watcher would otherwise find the very same instance again four seconds
   * later, which is not what anyone means by "disconnect".
   */
  const disconnect = () => {
    stopWaiting()
    setServiceEnabled(false)
    setServiceInfo(null)
    setItems(null)
    setError(null)
    setModeOverride(null)
    setServiceConnection({ endpoint: null, info: null, searching: false, enabled: false })
    log('dienst', 'Verbindung zum Dienst getrennt')
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
      adopt(service.endpoint.trim(), info)
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
                : 'Aus. Ohne sie gehen eigene Dateien, offene Archive, Podcast-Feeds und HLS-Streams mit CORS-Freigabe — YouTube nicht.'
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
              setServiceConnection({ enabled: value })
              if (value) {
                void autoConnect()
              } else {
                stopWaiting()
                setServiceInfo(null)
                setServiceConnection({ endpoint: null, info: null, searching: false })
              }
            }}
          />

          {serviceEnabled ? (
            /* Two things stay on the page: what is true right now, and a
               way in. The rest is read once and then never again, so it
               lives behind a door instead of pushing the address field —
               the part used every single time — below the fold. */
            <div className="mt-[14px] flex flex-col gap-[11px]">
              {/* What is true right now, stated before anything else. Someone
                  who just switched this on wants one answer — does YouTube work
                  yet — and that is a sentence, not a form. */}
              <div className="flex flex-wrap items-center gap-[9px] rounded-card bg-raised px-[14px] py-[11px]">
                <span
                  aria-hidden
                  className={`size-[9px] shrink-0 rounded-full ${connected ? 'bg-ink' : 'bg-ink/25'}`}
                />
                <p className="min-w-0 flex-1 text-[13px] text-ink">
                  {connected ? (
                    <>
                      Verbunden mit <span className="font-mono text-[12px]">{endpointLabel}</span>
                    </>
                  ) : waiting ? (
                    'Wartet auf den Dienst — läuft er, wird er hier von selbst auftauchen.'
                  ) : (
                    <>
                      Noch kein Dienst. Sondra schaut alle paar Sekunden auf{' '}
                      <span className="font-mono text-[12px]">localhost:{DEFAULT_PORT}</span> nach und
                      verbindet sich von selbst, sobald dort einer antwortet.
                    </>
                  )}
                </p>
                {connected ? (
                  <Button size="sm" variant="quiet" onClick={disconnect}>
                    Trennen
                  </Button>
                ) : null}
              </div>

              {!connected && sweeps >= 7 ? (
                <Notice tone="warn" title="Es antwortet nichts auf diesem Rechner">
                  {pageIsLocal() ? (
                    <>
                      Läuft der Dienst wirklich, und auf Port {DEFAULT_PORT}? Im Fenster, in dem Sie
                      ihn gestartet haben, muss <span className="font-mono">port: {DEFAULT_PORT}</span>{' '}
                      stehen und es darf nicht geschlossen sein.
                    </>
                  ) : (
                    <>
                      Läuft der Dienst, liegt es nicht an ihm. Diese Seite kommt aus dem Netz und
                      greift auf Ihren eigenen Rechner zu — das sperren Browser, teils mit einer
                      Rückfrage, teils ohne. „Zugriff erlauben“ stellt die Frage, falls Ihrer sie
                      kennt.
                      <span className="mt-[9px] block border-t border-line pt-[9px]">
                        Sicher geht es anders herum: Holen Sie Sondra auf diesen Rechner, statt den
                        Rechner von außen anzusprechen. Der Spiegel ist eine Datei, ein Befehl, und
                        danach gibt es keine Sperre mehr, weil es keine Grenze mehr zu überschreiten
                        gibt.
                      </span>
                      <span className="mt-[11px] flex flex-wrap items-center gap-[9px]">
                        <Button size="sm" onClick={saveMirror}>
                          Spiegel herunterladen
                        </Button>
                        <code className="rounded-nav bg-panel-soft px-[9px] py-[5px] font-mono text-[11px] text-prose">
                          node sondra-spiegel.mjs
                        </code>
                      </span>
                      <span className="mt-[7px] block text-muted">
                        Danach <code className="font-mono">localhost:{MIRROR_PORT}</code> öffnen
                        statt dieser Adresse. Es ist dieselbe Seite, nur von Ihrem Rechner
                        ausgeliefert.
                      </span>
                    </>
                  )}
                </Notice>
              ) : null}

              <div className="flex flex-wrap items-center gap-[9px]">
                <Button size="sm" variant="quiet" onClick={() => setSetupDialog(true)}>
                  {connected ? 'Dienst ändern' : 'Dienst einrichten'}
                </Button>
                {!connected ? (
                  <Button size="sm" onClick={runProbe}>
                    {pageIsLocal() ? 'Jetzt prüfen' : 'Verbinden und Zugriff erlauben'}
                  </Button>
                ) : null}
                {connected ? (
                  <span className="text-[12px] text-muted">
                    Portal-Links im Feld oben gehen jetzt.
                  </span>
                ) : null}
              </div>

              {probe ? (
                <div className="rounded-card bg-raised p-[21px]">
                  <div className="flex items-baseline justify-between gap-[11px]">
                    <p className="text-[12px] font-semibold text-ink">Ergebnis der Prüfung</p>
                    <button
                      type="button"
                      onClick={() => setProbe(null)}
                      className="rounded-nav text-[12px] text-muted hover:text-ink"
                    >
                      Ausblenden
                    </button>
                  </div>
                  <pre className="mt-[7px] overflow-x-auto font-mono text-[11px] leading-[1.6] whitespace-pre-wrap text-prose">
                    {probe}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}

          <Dialog open={setupDialog} onClose={() => setSetupDialog(false)} title="Dienst einrichten">
            <div className="flex flex-col gap-[21px]">
                {connected ? (
                  <>
                    <div className="flex flex-wrap items-center gap-[7px]">
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

                    <div className="grid gap-[14px] sm:grid-cols-2">
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

                      {/* Only asked for once something is connected, because an
                          empty key field on a screen with no service is just
                          another thing to worry about. */}
                      <Field label="Zugangsschlüssel" className="sm:col-span-2">
                        <TextInput
                          type="password"
                          autoComplete="off"
                          placeholder="optional, wird nicht gespeichert"
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  /* What is left once the browser is ruled out: somebody has to
                     run a service. Either someone you know, or you. There is no
                     third option — see the note in the first card for why. */
                  <div className="flex flex-col gap-[11px]">
                    <div className="rounded-card bg-raised p-[21px] ring-1 ring-inset ring-ink/20">
                      <p className="text-[13px] font-semibold text-ink">Eine fremde Instanz benutzen</p>
                      <p className="mt-[3px] text-[12px] leading-[1.5] text-muted">
                        Wenn Sie eine Adresse haben — von jemandem, der so einen Dienst betreibt —
                        genügt sie hier. Kein Programm, kein Terminal, kein Konto.
                      </p>
                      <div className="mt-[11px] flex flex-wrap items-center gap-[9px]">
                        <TextInput
                          type="url"
                          inputMode="url"
                          className="min-w-[200px] flex-1"
                          placeholder="https://meine-instanz.example/"
                          value={service.endpoint}
                          onChange={(event) => {
                            updateService({ endpoint: event.target.value })
                            setServiceInfo(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void checkService()
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={checkService}
                          disabled={checking || waiting || !service.endpoint.trim()}
                        >
                          {checking ? 'Prüft…' : 'Verbinden'}
                        </Button>
                      </div>
                      {known.length > 0 ? (
                        <div className="mt-[9px] flex flex-wrap items-center gap-[7px]">
                          <span className="text-[12px] text-muted">Zuletzt benutzt</span>
                          {known.map((entry) => (
                            <button
                              key={entry}
                              type="button"
                              onClick={() => {
                                updateService({ endpoint: entry })
                                setServiceInfo(null)
                              }}
                              title={entry}
                              className="max-w-[200px] truncate rounded-pill bg-panel-soft px-[11px] py-[5px] text-[12px] text-ink hover:bg-panel-mid"
                            >
                              {entry.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </button>
                          ))}
                        </div>
                      ) : null}


                      <details className="mt-[9px] border-t border-line pt-[9px]">
                        <summary className="cursor-pointer list-none text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                          Warum gibt es nichts Leichteres?
                        </summary>
                        <p className="mt-[7px] text-[12px] leading-[1.5] text-muted">
                        Ein Browser kommt an YouTube nicht heran.
                        Die Server, auf denen die Videodaten liegen, nehmen Anfragen nur von
                        youtube.com selbst an — mit oder ohne Link in der Hand. Holen muss also
                        immer ein Server, und den betreibt entweder jemand, den Sie kennen, oder
                        Sie selbst. Öffentliche Verzeichnisse solcher Dienste gibt es derzeit keine
                        mehr; die bekannten Listen sind abgeschaltet, nachdem automatisierte Abrufe
                        die Betreiber leergesaugt hatten. Der offizielle Dienst führt YouTube nicht
                        mehr und verlangt eine Bot-Prüfung, die diese Seite nicht lösen kann.
                        Der Dienst gehört dann jemand anderem, sieht Ihren Link und Ihre IP, und
                        kann langsam oder morgen weg sein.
                      </p>
                      </details>
                    </div>
                    <div className="rounded-card bg-raised p-[21px]">
                      <p className="mb-[11px] text-[13px] font-semibold text-ink">
                        Eigenen Dienst betreiben
                      </p>
                      {/* No fold in here: the dialog is already the fold. */}
                      <>
                        <div className="mt-[11px]">
                          {/* Two ways to the same service. Node leads because it is
                              the one that cannot fail for reasons outside your
                              control: Docker Desktop on Windows needs WSL2, which
                              needs a virtual machine, and that stack has open bugs
                              no amount of reinstalling gets past. */}
                          <div
                            role="radiogroup"
                            aria-label="Art der Installation"
                            className="flex flex-wrap gap-[2px] rounded-pill bg-panel-soft p-[3px]"
                          >
                            {(
                              [
                                { id: 'node', label: 'Ohne Docker' },
                                { id: 'docker', label: 'Mit Docker' },
                              ] as const
                            ).map((choice) => (
                              <button
                                key={choice.id}
                                type="button"
                                role="radio"
                                aria-checked={localWay === choice.id}
                                onClick={() => setLocalWay(choice.id)}
                                className={`rounded-pill px-[14px] py-[6px] text-[13px] transition-colors ${
                                  localWay === choice.id ? 'bg-ink text-on-ink' : 'text-ink hover:bg-panel-mid'
                                }`}
                              >
                                {choice.label}
                              </button>
                            ))}
                          </div>

                          {localWay === 'node' ? (
                            /* Asking beats assuming. The commands below are then
                               the ones for this machine and no others, so the list
                               can be pasted start to finish without anyone having
                               to work out which half applies to them. */
                            <div className="mt-[16px] rounded-nav bg-panel-soft p-[16px]">
                              <p className="mb-[9px] text-[12px] font-semibold text-ink">
                                Was ist auf diesem Rechner schon da?
                              </p>
                              <div className="flex flex-col gap-[9px]">
                                <Toggle
                                  label="Node.js"
                                  hint={
                                    hasNode
                                      ? undefined
                                      : 'Aus: die Anleitung fängt mit dem Installieren an.'
                                  }
                                  checked={hasNode}
                                  onChange={setHasNode}
                                />
                                <Toggle
                                  label="Git"
                                  hint={
                                    hasGit
                                      ? undefined
                                      : 'Aus: der Quelltext kommt als Archiv, Git wird nicht gebraucht.'
                                  }
                                  checked={hasGit}
                                  onChange={setHasGit}
                                />
                              </div>
                              <p className="mt-[9px] text-[12px] leading-[1.5] text-muted">
                                Nicht sicher? Beide aus lassen — dann steht alles da, und ein Schritt,
                                der schon erledigt ist, schadet nicht.
                              </p>
                              {!pageIsLocal() ? (
                                <p className="mt-[9px] border-t border-line pt-[9px] text-[12px] leading-[1.5] text-prose/85">
                                  Noch eines vorweg: Sobald der Dienst läuft, fragt der Browser,
                                  ob diese Seite auf Ihren Rechner zugreifen darf. Erlauben Sie
                                  es — ohne diese Erlaubnis bleibt der Dienst unerreichbar, egal
                                  wie richtig er läuft.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <p className="mt-[11px] text-[12px] leading-[1.5] text-muted">
                            {localWay === 'node' ? (
                              <>
                                Node.js ist ein gewöhnlicher Installer, ohne virtuelle Maschine — genau
                                das ist der Unterschied zu Docker Desktop, das unter Windows WSL2
                                voraussetzt und daran auch scheitern kann.
                                {!hasGit ? (
                                  <>
                                    {' '}
                                    <span className="text-prose/85">
                                      Ohne Git kommt der Quelltext als Archiv. Die drei{' '}
                                      <code className="font-mono">.git</code>-Zeilen darin sind kein
                                      Git: der Dienst liest daraus nur seine eigene Versionsangabe und
                                      startet sonst nicht. Drei Textdateien genügen ihm.
                                    </span>
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <>
                                Ein Befehl, danach läuft es dauerhaft mit. Braucht{' '}
                                <a
                                  className="underline underline-offset-2 hover:text-ink"
                                  href="https://docs.docker.com/get-docker/"
                                  target="_blank"
                                  rel="noreferrer noopener"
                                >
                                  Docker
                                </a>
                                , unter Windows also auch WSL2 und eine virtuelle Maschine.
                              </>
                            )}
                          </p>

                          {waiting ? (
                            <div className="mt-[11px] flex flex-wrap items-center gap-[11px]">
                              <p className="min-w-0 flex-1 text-[12px] leading-[1.5] text-prose/85">
                                Ist kopiert. Jetzt ins Terminal einfügen und ausführen — Sondra schaut
                                weiter nach und verbindet sich selbst, sobald der Dienst antwortet.
                              </p>
                              <Button size="sm" variant="quiet" onClick={stopWaiting}>
                                Abbrechen
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-[11px] flex flex-wrap items-center gap-[7px]">
                              <Button size="sm" onClick={startAndWait} disabled={searching}>
                                {copied
                                  ? 'Kopiert — einfügen und ausführen'
                                  : localWay === 'docker'
                                    ? 'Befehl kopieren'
                                    : 'Befehle kopieren'}
                                <ArrowRight />
                              </Button>
                              <Button size="sm" variant="quiet" onClick={searchLocal} disabled={searching}>
                                {searching ? 'Sucht…' : 'Läuft schon — suchen'}
                              </Button>
                            </div>
                          )}

                          {needsNodeByHand ? (
                            /* No package manager worth guessing at on this system,
                               so the one step that cannot be a command says so
                               plainly instead of being silently left out. */
                            <div className="mt-[9px] flex flex-wrap items-center gap-[11px] rounded-nav bg-panel-soft px-[11px] py-[9px]">
                              <p className="min-w-0 flex-1 text-[12px] leading-[1.5] text-prose/85">
                                Zuerst Node.js installieren — über die Paketverwaltung Ihres Systems
                                oder mit dem LTS-Installer. Danach gelten die Befehle darunter.
                              </p>
                              <Button
                                size="sm"
                                variant="quiet"
                                onClick={() => window.open(NODE_DOWNLOAD, '_blank', 'noopener')}
                              >
                                Node.js holen
                              </Button>
                            </div>
                          ) : null}

                          <code className="mt-[9px] block rounded-nav bg-panel-soft px-[11px] py-[9px] font-mono text-[11px] leading-[1.6] whitespace-pre-wrap text-prose">
                            {localCommand}
                          </code>

                          <p className="mt-[9px] text-[12px] leading-[1.5] text-muted">
                            {localWay !== 'docker' ? (
                              <>
                                Unter Windows nehmen Sie besser das fertige Skript unten: PowerShell
                                schreibt eine Datei mit <code className="font-mono">&gt;</code> in einer
                                Kodierung, die der Dienst nicht liest. Das Fenster muss offen bleiben,
                                solange der Dienst läuft.
                              </>
                            ) : (
                              <>
                                Der Dienst hört danach nur auf{' '}
                                <code className="font-mono">localhost:{DEFAULT_PORT}</code> und ist von
                                außen nicht erreichbar.
                              </>
                            )}{' '}
                            Lesen Sie, was Sie ausführen, bevor Sie es tun — das gilt für alles, was
                            eine Webseite Ihnen dafür in die Hand gibt.
                          </p>

                          {localWay === 'node' ? (
                            <p className="mt-[7px] text-[12px] leading-[1.5] text-muted">
                              Meldet <code className="font-mono">corepack</code> einen Fehler — etwa{' '}
                              <code className="font-mono">EPERM</code>, wenn Node über nvm verwaltet
                              wird —, einfach weitermachen. Die Zeile besorgt nur pnpm; ist es schon
                              da, läuft der Rest unverändert durch.
                            </p>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => setSetupOpen((value) => !value)}
                            aria-expanded={setupOpen}
                            className="mt-[9px] rounded-nav text-[12px] text-muted underline underline-offset-2 hover:text-ink"
                          >
                            {setupOpen ? 'Weniger' : 'Lieber fertige Dateien statt Befehlen?'}
                          </button>

                          {setupOpen ? (
                            <div className="mt-[9px] flex flex-col gap-[9px] text-[12px] leading-[1.5] text-prose/85">
                              <p className="text-muted">
                                Ein Skript, das den Ordner anlegt und den Dienst startet. Alles hier
                                entsteht im Browser, nichts wird nachgeladen.
                              </p>
                              <div className="flex flex-wrap gap-[7px]">
                                {localWay !== 'docker' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="quiet"
                                      onClick={() =>
                                        saveBytes(
                                          new TextEncoder().encode(
                                            hasGit
                                            ? nodeWindowsScript(DEFAULT_PORT, hostedOrigin)
                                            : nodeOnlyWindowsScript(DEFAULT_PORT, hostedOrigin),
                                          ),
                                          hasGit ? 'cobalt-ohne-docker.ps1' : 'cobalt-nur-node.ps1',
                                          'text/plain',
                                        )
                                      }
                                    >
                                      Skript für Windows
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="quiet"
                                      onClick={() =>
                                        saveBytes(
                                          new TextEncoder().encode(
                                            hasGit
                                            ? nodeUnixScript(DEFAULT_PORT, hostedOrigin)
                                            : nodeOnlyUnixScript(DEFAULT_PORT, hostedOrigin),
                                          ),
                                          hasGit ? 'cobalt-ohne-docker.sh' : 'cobalt-nur-node.sh',
                                          'text/x-shellscript',
                                        )
                                      }
                                    >
                                      Skript für macOS/Linux
                                    </Button>
                                  </>
                                ) : (
                                  <>
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
                                  </>
                                )}
                              </div>
                              {!pageIsLocal() ? (
                                <div className="rounded-nav bg-panel-soft p-[16px] ring-1 ring-inset ring-ink/20">
                                  <p className="text-[13px] font-semibold text-ink">
                                    Sondra lokal öffnen — der sichere Weg
                                  </p>
                                  <p className="mt-[4px] text-[12px] leading-[1.5] text-muted">
                                    Solange diese Seite aus dem Netz kommt und der Dienst auf Ihrem
                                    Rechner läuft, steht eine Browsersperre dazwischen. Der Spiegel
                                    liefert dieselbe Seite von Ihrem Rechner aus — dann liegen beide
                                    auf derselben Maschine und die Sperre entfällt. Keine
                                    Abhängigkeiten, nichts wird gespeichert, und der mehrfädige
                                    FFmpeg-Kern bleibt erhalten.
                                  </p>
                                  <div className="mt-[11px] flex flex-wrap items-center gap-[9px]">
                                    <Button size="sm" onClick={saveMirror}>
                                      Spiegel herunterladen
                                    </Button>
                                    <code className="rounded-nav bg-raised px-[9px] py-[5px] font-mono text-[11px] text-prose">
                                      node sondra-spiegel.mjs
                                    </code>
                                  </div>
                                  <p className="mt-[9px] text-[12px] leading-[1.5] text-muted">
                                    Dann <code className="font-mono">localhost:{MIRROR_PORT}</code>{' '}
                                    öffnen. Von dort aus findet Sondra den Dienst ohne jede
                                    Erlaubnis.
                                  </p>
                                </div>
                              ) : null}

                              {!pageIsLocal() ? (
                                <div className="rounded-nav bg-panel-soft p-[16px]">
                                  <p className="text-[13px] font-semibold text-ink">
                                    Falls der Browser nicht nach Erlaubnis fragt
                                  </p>
                                  <p className="mt-[4px] text-[12px] leading-[1.5] text-muted">
                                    Ältere Browser kennen die Abfrage nicht. Dann muss der Dienst
                                    selbst für die Anfrage bürgen, und dafür gibt es diese Brücke:
                                    eine Datei, ein Befehl, keine Abhängigkeiten. Sie läuft vor dem
                                    Dienst und beantwortet die Rückfrage des Browsers.
                                  </p>
                                  <div className="mt-[11px] flex flex-wrap items-center gap-[9px]">
                                    <Button
                                      size="sm"
                                      variant="quiet"
                                      onClick={() =>
                                        saveBytes(
                                          new TextEncoder().encode(bridgeScript()),
                                          'sondra-bruecke.mjs',
                                          'text/javascript',
                                        )
                                      }
                                    >
                                      Brücke herunterladen
                                    </Button>
                                    <code className="rounded-nav bg-raised px-[9px] py-[5px] font-mono text-[11px] text-prose">
                                      node sondra-bruecke.mjs
                                    </code>
                                  </div>
                                  <p className="mt-[9px] text-[12px] leading-[1.5] text-muted">
                                    Läuft dann auf{' '}
                                    <code className="font-mono">localhost:{BRIDGE_PORT}</code> —
                                    Sondra sucht dort von selbst mit, es ist nichts einzutragen.
                                  </p>
                                </div>
                              ) : null}
                              <p className="text-muted">
                                Auf einem eigenen Server statt auf dem Laptop geht es genauso; die
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
                      </>
                    </div>
                  </div>
                )}

                {/* Terms last, under the controls they apply to. */}
                <div className="rounded-card bg-raised p-[21px] text-[12px] leading-[1.5] ring-1 ring-inset ring-ink/30">
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
          </Dialog>
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
