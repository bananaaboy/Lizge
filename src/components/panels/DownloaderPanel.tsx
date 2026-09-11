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

type Mode = 'direct' | 'hls'

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

  const detectedHls = /\.m3u8(\?|$)/i.test(url.trim())
  const effectiveMode: Mode = detectedHls ? 'hls' : mode

  const reset = () => {
    setError(null)
    setPlaylist(null)
    setVariantUrl('')
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

  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[21px]">
        <Card tone="keylime">
          <Eyebrow>Downloader</Eyebrow>
          <h2 className="display-md mt-[11px] mb-[14px]">Medien direkt in den Tab laden</h2>
          <p className="max-w-[60ch] text-body leading-[1.6] text-charcoal/80">
            Der Browser holt die Datei selbst — es gibt keinen Server dazwischen, der die Adresse
            mitlesen könnte. Direkte Links landen im Arbeitsspeicher oder, wo die Dateisystem-API
            vorhanden ist, gleich auf der Festplatte. HLS-Playlisten werden segmentweise geladen und
            lokal zu einer MP4 zusammengefasst.
          </p>

          <div className="mt-[28px] flex flex-col gap-[18px]">
            <Field
              label="Adresse"
              hint={detectedHls ? 'HLS-Playlist erkannt.' : 'Direkter Link zu einer Audio- oder Videodatei.'}
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
                <Select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                  <option value="direct">Direkte Datei</option>
                  <option value="hls">HLS-Playlist (.m3u8)</option>
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
              {effectiveMode === 'direct' ? (
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
            <div className="mt-[18px] rounded-card bg-cream-paper p-[28px]">
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

        {error ? (
          <Notice tone="error" title="Nicht abrufbar">
            {error}
          </Notice>
        ) : null}

        <Notice title="Was hier nicht geht, und warum">
          Portale wie YouTube liefern ihre Medien ohne <code>Access-Control-Allow-Origin</code> aus.
          Der Browser lässt eine fremde Seite deshalb nicht an die Daten — eine Schutzmaßnahme, keine
          Lücke. Umgehen ließe sich das nur über einen fremden Server als Zwischenstation, und genau
          darauf verzichtet Lizge. Was funktioniert: eigene Dateien, offene Archive, Podcast-Feeds,
          Mediatheken mit CORS-Freigabe und HLS-Streams, die ihre Segmente freigeben.
        </Notice>
      </div>

      <aside className="flex flex-col gap-[21px]">
        <Card tone="mint">
          <AssetList />
        </Card>
      </aside>
    </div>
  )
}
