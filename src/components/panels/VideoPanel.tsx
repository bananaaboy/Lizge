/**
 * Video: cut, straighten, crop, change speed, pull the sound out, make a GIF.
 *
 * The whole panel is arranged around the one thing a video tool has that an
 * audio tool does not — you can see the material. So the picture is the centre
 * of the screen, the cut is made on a timeline underneath it rather than in two
 * number fields, and the crop is dragged onto the frame itself.
 *
 * Every edit lands in a single FFmpeg pass (see lib/video.ts), and a cut that
 * asks for nothing else copies the streams instead of re-encoding them: minutes
 * become seconds and the picture stays bit-for-bit the original.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { saveBytes } from '../../lib/download'
import { loadFfmpeg, onFfmpegProgress, probeMedia, runFfmpeg, sanitize } from '../../lib/ffmpegClient'
import { formatBytes, formatTimecode } from '../../lib/format'
import {
  DEFAULT_VIDEO_OPS,
  VIDEO_PRESETS,
  buildAudioExtraction,
  buildAudioReplacement,
  buildFrameGrab,
  buildVideoJob,
  type VideoContainer,
  type VideoOps,
} from '../../lib/video'
import { holdScreenAwake } from '../../lib/wakeLock'
import { kindFromMime, useActiveAssetOfKind, useAssetsOfKind, useSession } from '../../state/store'
import { SessionCard } from '../AssetList'
import { FileDrop } from '../FileDrop'
import {
  ArrowRight,
  Button,
  Card,
  Eyebrow,
  Field,
  Notice,
  Progress,
  Reveal,
  Select,
  Slider,
  Stat,
} from '../ui/primitives'

interface Outcome {
  name: string
  bytes: Uint8Array
  mime: string
  kind: 'video' | 'audio' | 'image'
}

function useObjectUrl(bytes: Uint8Array | null, mime: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!bytes) return setUrl(null)
    const view = bytes.slice()
    const next = URL.createObjectURL(new Blob([view.buffer as ArrayBuffer], { type: mime }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [bytes, mime])
  return url
}

/**
 * The cut, made where it can be seen.
 *
 * One clip, two handles and a playhead. Not a multi-track timeline — that is a
 * different piece of software — but everything a single-clip edit needs, and
 * the numbers stay visible so the result is never a surprise.
 */
function Timeline({
  duration,
  start,
  end,
  position,
  onChange,
  onSeek,
}: {
  duration: number
  start: number
  end: number
  position: number
  onChange: (next: { start: number; end: number }) => void
  onSeek: (seconds: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [grabbing, setGrabbing] = useState<'start' | 'end' | null>(null)

  const secondsAt = useCallback(
    (clientX: number) => {
      const box = ref.current?.getBoundingClientRect()
      if (!box || duration <= 0) return 0
      return Math.min(duration, Math.max(0, ((clientX - box.left) / box.width) * duration))
    },
    [duration],
  )

  useEffect(() => {
    if (!grabbing) return
    const move = (event: PointerEvent) => {
      const at = secondsAt(event.clientX)
      // The handles are not allowed to cross; a quarter second of clip is the
      // smallest thing worth keeping.
      if (grabbing === 'start') onChange({ start: Math.min(at, end - 0.25), end })
      else onChange({ start, end: Math.max(at, start + 0.25) })
    }
    const up = () => setGrabbing(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [grabbing, secondsAt, onChange, start, end, duration])

  const percent = (seconds: number) => (duration > 0 ? (seconds / duration) * 100 : 0)

  return (
    <div className="mt-[14px]">
      <div
        ref={ref}
        onPointerDown={(event) => {
          if (grabbing) return
          onSeek(secondsAt(event.clientX))
        }}
        className="relative h-[52px] w-full cursor-pointer touch-none overflow-hidden rounded-card bg-panel-soft select-none"
      >
        {/* everything outside the selection, dimmed */}
        <div className="absolute inset-y-0 left-0 bg-ink/10" style={{ width: `${percent(start)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-ink/10" style={{ width: `${100 - percent(end)}%` }} />

        <div
          className="absolute inset-y-0 border-y-2 border-ink/40 bg-ink/5"
          style={{ left: `${percent(start)}%`, width: `${percent(end) - percent(start)}%` }}
        />

        {(['start', 'end'] as const).map((side) => (
          <div
            key={side}
            role="slider"
            aria-label={side === 'start' ? 'Anfang' : 'Ende'}
            aria-valuenow={Math.round(side === 'start' ? start : end)}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            tabIndex={0}
            onPointerDown={(event) => {
              event.stopPropagation()
              setGrabbing(side)
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 1 : 0.1
              const delta = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0
              if (!delta) return
              event.preventDefault()
              if (side === 'start') onChange({ start: Math.min(Math.max(0, start + delta), end - 0.25), end })
              else onChange({ start, end: Math.min(duration, Math.max(end + delta, start + 0.25)) })
            }}
            className="absolute inset-y-0 z-10 w-[12px] -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${percent(side === 'start' ? start : end)}%` }}
          >
            <div className="mx-auto h-full w-[4px] rounded-pill bg-ink" />
          </div>
        ))}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-[2px] bg-ink-hover"
          style={{ left: `${percent(position)}%` }}
        />
      </div>

      <div className="mt-[7px] flex items-center justify-between text-[12px] text-muted">
        <span className="numeric">{formatTimecode(start)}</span>
        <span className="numeric text-ink">
          Auswahl {formatTimecode(Math.max(0, end - start))}
        </span>
        <span className="numeric">{formatTimecode(end)}</span>
      </div>
    </div>
  )
}

export function VideoPanel() {
  const asset = useActiveAssetOfKind('video')
  const audioAssets = useAssetsOfKind('audio')
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)

  const [ops, setOps] = useState<VideoOps>(DEFAULT_VIDEO_OPS)
  const [duration, setDuration] = useState(0)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [position, setPosition] = useState(0)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [dragging, setDragging] = useState<VideoOps['crop']>(null)
  // The browser could not play the file, so the picture is unavailable — the
  // edit is not.
  const [unplayable, setUnplayable] = useState(false)
  const [probing, setProbing] = useState(false)
  const [replacement, setReplacement] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const patch = (next: Partial<VideoOps>) => setOps((value) => ({ ...value, ...next }))

  const sourceUrl = useObjectUrl(asset?.bytes ?? null, asset?.mime || 'video/mp4')
  const outcomeUrl = useObjectUrl(outcome?.bytes ?? null, outcome?.mime ?? 'video/mp4')

  useEffect(() => onFfmpegProgress((fraction) => setProgress(fraction)), [])

  useEffect(() => {
    setOps(DEFAULT_VIDEO_OPS)
    setOutcome(null)
    setError(null)
    setDuration(0)
    setSize(null)
    setUnplayable(false)
  }, [asset?.id])

  /**
   * When the browser will not decode the file, ask FFmpeg instead.
   *
   * A Chromium build without H.264 — and this is common, it is the licensed
   * codec — reports a duration of zero and no error worth the name. Every
   * control that needs a length would then sit disabled with nothing to
   * explain it. FFmpeg is already here and knows the answer.
   */
  const probedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!asset || !unplayable || duration > 0) return
    // Guarded by a ref rather than the `probing` flag: a flag this effect sets
    // itself and also depends on re-runs the effect, whose cleanup cancels the
    // run that is still in flight — and "läuft…" then never clears.
    if (probedRef.current === asset.id) return
    probedRef.current = asset.id
    setProbing(true)
    void probeMedia(asset.bytes, asset.name)
      .then((facts) => {
        if (facts.durationSeconds) {
          setDuration(facts.durationSeconds)
          setOps((value) => ({ ...value, end: facts.durationSeconds ?? 0 }))
        }
        if (facts.width && facts.height) setSize({ width: facts.width, height: facts.height })
      })
      .finally(() => setProbing(false))
  }, [asset, unplayable, duration])

  /* -- crop, dragged onto the frame ---------------------------------------- */
  const pointFrom = (event: React.PointerEvent) => {
    const box = frameRef.current?.getBoundingClientRect()
    if (!box) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    }
  }

  const live = dragging ?? ops.crop

  /* -- running ------------------------------------------------------------- */
  const run = async (
    build: () => { args: string[]; extension: string; mime: string },
    label: string,
    kind: Outcome['kind'],
    extraInputs: Record<string, Uint8Array> = {},
  ) => {
    if (!asset) return
    const controller = new AbortController()
    abortRef.current = controller
    const release = await holdScreenAwake()
    setRunning(true)
    setProgress(0)
    setError(null)
    setOutcome(null)
    setNote(label)

    try {
      await loadFfmpeg()
      const inputName = sanitize(`in_${asset.name}`)
      const built = build()
      const output = `out.${built.extension}`
      const args = built.args.map((arg) => (arg === '@input' ? inputName : arg))

      log('video', `ffmpeg ${args.join(' ')}`)
      const { files } = await runFfmpeg({
        input: { [inputName]: asset.bytes, ...extraInputs },
        output: [output],
        args: [...args, output],
        signal: controller.signal,
      })

      const bytes = files[output]
      if (!bytes || bytes.byteLength < 1024) {
        throw new Error(
          `Es kamen nur ${bytes?.byteLength ?? 0} Bytes heraus. Meist liegt das an einem Codec, ` +
            'den dieser FFmpeg-Aufbau nicht schreiben kann — ein anderes Zielformat hilft oft.',
        )
      }
      const name = sanitize(`${asset.name.replace(/\.[^.]+$/, '')}.${built.extension}`)
      setOutcome({ name, bytes, mime: built.mime, kind })
      log('video', `${name} fertig (${formatBytes(bytes.byteLength)})`)
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      const message = failure instanceof Error ? failure.message : String(failure)
      setError(message)
      log('video', message, 'error')
    } finally {
      release()
      setRunning(false)
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  const keep = () => {
    if (!outcome) return
    addAsset({
      name: outcome.name,
      bytes: outcome.bytes,
      mime: outcome.mime,
      sizeBytes: outcome.bytes.byteLength,
      kind: kindFromMime(outcome.mime, outcome.name),
      audio: null,
      durationSeconds: null,
      origin: 'derived',
    })
    log('video', `${outcome.name} in die Sitzung übernommen`)
  }

  const selection = useMemo(
    () => ({ start: ops.start, end: ops.end > 0 ? ops.end : duration }),
    [ops.start, ops.end, duration],
  )

  if (!asset) {
    return (
      <Card tone="keylime">
        <Eyebrow>Video</Eyebrow>
        <h2 className="display-md mt-[8px] mb-[12px]">Schneiden, drehen, Ton herauslösen</h2>
        <p className="mb-[16px] max-w-[62ch] text-body leading-[1.55] text-prose/85">
          In der Sitzung liegt noch kein Video. MP4, MOV, MKV, WebM und AVI werden gelesen; gerechnet
          wird mit FFmpeg als WebAssembly, also auf Ihrem Gerät.
        </p>
        <FileDrop />
      </Card>
    )
  }

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-[16px]">
        <Card tone="keylime">
          <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
            <Eyebrow>Video</Eyebrow>
            <span className="truncate text-[12px] text-muted">
              {asset.name}
              {size ? ` · ${size.width}×${size.height}` : ''}
            </span>
          </div>

          {/* -- the picture --------------------------------------------------- */}
          <div
            ref={frameRef}
            onPointerDown={(event) => {
              const start = pointFrom(event)
              if (!start) return
              event.currentTarget.setPointerCapture(event.pointerId)
              setDragging({ x: start.x, y: start.y, width: 0, height: 0 })
            }}
            onPointerMove={(event) => {
              if (!dragging) return
              const now = pointFrom(event)
              if (!now) return
              setDragging((value) => (value ? { ...value, width: now.x - value.x, height: now.y - value.y } : value))
            }}
            onPointerUp={() => {
              if (!dragging) return
              const rect = {
                x: Math.min(dragging.x, dragging.x + dragging.width),
                y: Math.min(dragging.y, dragging.y + dragging.height),
                width: Math.abs(dragging.width),
                height: Math.abs(dragging.height),
              }
              setDragging(null)
              patch({ crop: rect.width < 0.03 || rect.height < 0.03 ? null : rect })
            }}
            className="relative mt-[14px] touch-none overflow-hidden rounded-card bg-panel-soft select-none"
          >
            <video
              ref={videoRef}
              src={sourceUrl ?? undefined}
              controls
              playsInline
              onLoadedMetadata={(event) => {
                const element = event.currentTarget
                setDuration(element.duration || 0)
                setSize({ width: element.videoWidth, height: element.videoHeight })
                setOps((value) => ({ ...value, end: element.duration || 0 }))
              }}
              onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
              onError={() => setUnplayable(true)}
              className={`max-h-[400px] w-full bg-black ${unplayable ? 'hidden' : ''}`}
            />
            {unplayable ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-[8px] p-[24px] text-center">
                <p className="text-body text-ink">Keine Vorschau möglich</p>
                <p className="max-w-[46ch] text-[13px] leading-[1.5] text-muted">
                  {probing
                    ? 'Länge und Auflösung werden mit FFmpeg ermittelt…'
                    : 'Dieser Browser kann das enthaltene Format nicht abspielen — bei H.264 ist ' +
                      'das eine Lizenzfrage, kein Fehler in der Datei. Schneiden, Drehen und ' +
                      'Umwandeln funktionieren trotzdem; nur sehen können Sie es erst im Ergebnis.'}
                </p>
              </div>
            ) : null}
            {live && Math.abs(live.width) > 0.01 ? (
              <div
                aria-hidden
                className="pointer-events-none absolute border-2 border-ink bg-ink/10"
                style={{
                  left: `${Math.min(live.x, live.x + live.width) * 100}%`,
                  top: `${Math.min(live.y, live.y + live.height) * 100}%`,
                  width: `${Math.abs(live.width) * 100}%`,
                  height: `${Math.abs(live.height) * 100}%`,
                }}
              />
            ) : null}
          </div>

          {duration > 0 ? (
            <Timeline
              duration={duration}
              start={selection.start}
              end={selection.end}
              position={position}
              onChange={({ start, end }) => patch({ start, end })}
              onSeek={(seconds) => {
                if (videoRef.current && !unplayable) videoRef.current.currentTime = seconds
                setPosition(seconds)
              }}
            />
          ) : null}

          <div className="mt-[10px] flex flex-wrap items-center gap-[9px] text-[12px] text-muted">
            <span>Über das Bild ziehen schneidet den Ausschnitt zu.</span>
            <div className="ml-auto flex gap-[6px]">
              {ops.crop ? (
                <Button size="sm" variant="ghost" onClick={() => patch({ crop: null })}>
                  Ausschnitt zurück
                </Button>
              ) : null}
              {ops.start > 0 || (ops.end > 0 && ops.end < duration) ? (
                <Button size="sm" variant="ghost" onClick={() => patch({ start: 0, end: duration })}>
                  Ganze Länge
                </Button>
              ) : null}
            </div>
          </div>

          {/* -- settings ------------------------------------------------------ */}
          <div className="mt-[18px] grid gap-[14px] sm:grid-cols-2">
            <Field label="Qualität" hint={VIDEO_PRESETS.find((p) => p.id === ops.preset)?.hint}>
              <Select value={ops.preset} onChange={(event) => patch({ preset: event.target.value })}>
                {VIDEO_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" hint={
              ops.container === 'mp4' ? 'H.264 und AAC — läuft überall'
                : ops.container === 'webm' ? 'VP9 und Opus — kleiner, langsamer zu rechnen'
                : 'Kurze Schleife ohne Ton, eigene Farbpalette'
            }>
              <Select
                value={ops.container}
                onChange={(event) => patch({ container: event.target.value as VideoContainer })}
              >
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
                <option value="gif">GIF</option>
              </Select>
            </Field>
          </div>

          <div className="mt-[16px] flex flex-wrap items-center gap-[7px]">
            <span className="mr-[4px] text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
              Drehen
            </span>
            {([0, 90, 180, 270] as const).map((angle) => (
              <Button key={angle} size="sm" variant={ops.rotate === angle ? 'primary' : 'quiet'}
                onClick={() => patch({ rotate: angle })}>
                {angle === 0 ? 'Keine' : `${angle}°`}
              </Button>
            ))}
            <Button size="sm" variant={ops.flipH ? 'primary' : 'quiet'} onClick={() => patch({ flipH: !ops.flipH })}>
              Spiegeln
            </Button>
            <Button size="sm" variant={ops.mute ? 'primary' : 'quiet'} onClick={() => patch({ mute: !ops.mute })}>
              {ops.mute ? 'Ton ist aus' : 'Ton entfernen'}
            </Button>
          </div>

          <Reveal label="Geschwindigkeit ändern" className="mt-[16px]">
            <div className="rounded-card bg-panel-soft p-[16px]">
              <Slider
                label="Tempo"
                display={ops.speed === 1 ? 'unverändert' : `${ops.speed.toFixed(2)}×`}
                min={0.25} max={4} step={0.05} value={ops.speed}
                onChange={(event) => patch({ speed: Number(event.target.value) })}
              />
              <p className="mt-[9px] text-[12px] leading-[1.5] text-muted">
                Unter 1 wird es Zeitlupe, darüber Zeitraffer. Der Ton geht mit und behält die
                Tonhöhe — <code className="font-mono">atempo</code> resampelt, statt schneller
                abzuspielen.
              </p>
            </div>
          </Reveal>

          {/* -- go ------------------------------------------------------------ */}
          <div className="mt-[18px] flex flex-wrap items-center gap-[10px]">
            <Button
              disabled={running || duration === 0}
              onClick={() => void run(() => buildVideoJob(ops, '@input', duration, size), 'Video wird gerechnet', 'video')}
            >
              {running ? 'Läuft…' : ops.container === 'gif' ? 'GIF erzeugen' : 'Video rendern'}
              {!running ? <ArrowRight /> : null}
            </Button>
            {running ? (
              <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                Abbrechen
              </Button>
            ) : null}
            {!running && buildVideoJob(ops, '@input', duration, size).copyOnly ? (
              <span className="text-[12px] text-muted">
                Nur ein Schnitt — die Spuren werden kopiert statt neu gerechnet.
              </span>
            ) : null}
          </div>

          {running ? (
            <div className="mt-[14px]">
              <Progress value={progress} label={note ?? 'Läuft'} />
            </div>
          ) : null}

          {error ? (
            <div className="mt-[14px]">
              <Notice tone="error" title="Nicht gelungen">{error}</Notice>
            </div>
          ) : null}
        </Card>

        {/* -- result -------------------------------------------------------- */}
        {outcome ? (
          <Card tone="slate" size="compact">
            <Eyebrow>Ergebnis</Eyebrow>
            <div className="mt-[14px] grid gap-[14px] rounded-card bg-raised p-[18px] sm:grid-cols-3">
              <Stat label="Datei" value={outcome.name.slice(-28)} note={outcome.mime} />
              <Stat label="Größe" value={formatBytes(outcome.bytes.byteLength)} emphasis
                note={`vorher ${formatBytes(asset.sizeBytes)}`} />
              <Stat
                label="Gegenüber Quelle"
                value={`${Math.round((outcome.bytes.byteLength / asset.sizeBytes) * 100)} %`}
              />
            </div>

            {outcomeUrl ? (
              <div className="mt-[14px] overflow-hidden rounded-card bg-raised">
                {outcome.kind === 'video' ? (
                  <video src={outcomeUrl} controls playsInline className="max-h-[320px] w-full bg-black" />
                ) : outcome.kind === 'image' ? (
                  <img src={outcomeUrl} alt="" className="mx-auto max-h-[320px]" />
                ) : (
                  <audio src={outcomeUrl} controls className="w-full p-[14px]" />
                )}
              </div>
            ) : null}

            <div className="mt-[14px] flex flex-wrap gap-[10px]">
              <Button onClick={() => saveBytes(outcome.bytes, outcome.name, outcome.mime)}>
                Speichern
                <ArrowRight />
              </Button>
              <Button variant="quiet" onClick={keep}>
                In die Sitzung übernehmen
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      {/* -- the things a video can also give you --------------------------- */}
      <aside className="flex flex-col gap-[16px]">
        <Card tone="mint" size="compact">
          <Eyebrow>Aus diesem Video</Eyebrow>
          <p className="mt-[9px] text-[13px] leading-[1.5] text-prose/85">
            Alles hier landet in der Sitzung und lässt sich danach mit den übrigen Werkzeugen
            weiterbearbeiten.
          </p>

          <div className="mt-[12px] flex flex-col gap-[7px]">
            <Button size="sm" variant="quiet" disabled={running}
              onClick={() => void run(() => buildAudioExtraction('@input', 'copy'), 'Ton wird herausgelöst', 'audio')}>
              Ton herauslösen — unverändert
            </Button>
            <Button size="sm" variant="quiet" disabled={running}
              onClick={() => void run(() => buildAudioExtraction('@input', 'wav'), 'Ton wird herausgelöst', 'audio')}>
              Ton als WAV — zum Weiterrechnen
            </Button>
            <Button size="sm" variant="quiet" disabled={running}
              onClick={() => void run(() => buildAudioExtraction('@input', 'mp3'), 'Ton wird herausgelöst', 'audio')}>
              Ton als MP3
            </Button>
            <Button size="sm" variant="quiet" disabled={running}
              onClick={() => void run(() => buildFrameGrab('@input', position), 'Einzelbild wird geholt', 'image')}>
              Einzelbild bei {formatTimecode(position)}
            </Button>
          </div>
        </Card>

        {audioAssets.length > 0 ? (
          <Card tone="cream" size="compact">
            <Eyebrow>Ton ersetzen</Eyebrow>
            <p className="mt-[9px] text-[13px] leading-[1.5] text-prose/85">
              Das Bild bleibt unangetastet, nur die Tonspur wird getauscht.
            </p>
            <div className="mt-[12px] flex flex-col gap-[9px]">
              <Select value={replacement} onChange={(event) => setReplacement(event.target.value)}>
                <option value="">Tonspur wählen…</option>
                {audioAssets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                disabled={running || !replacement}
                onClick={() => {
                  const track = audioAssets.find((entry) => entry.id === replacement)
                  if (!track) return
                  const name = sanitize(`add_${track.name}`)
                  void run(
                    () => buildAudioReplacement('@input', name),
                    'Tonspur wird getauscht',
                    'video',
                    { [name]: track.bytes },
                  )
                }}
              >
                Tonspur einsetzen
              </Button>
            </div>
          </Card>
        ) : null}

        <SessionCard />
      </aside>
    </div>
  )
}
