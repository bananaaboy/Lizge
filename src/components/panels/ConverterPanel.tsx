/**
 * Format conversion through FFmpeg WASM.
 *
 * The exact command is shown before it runs. That is partly a convenience for
 * people who know FFmpeg, and partly the point of the app: you can see there is
 * no network call in it.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  BITRATES,
  buildConvertArgs,
  findFormat,
  OUTPUT_FORMATS,
  previewCommand,
  SAMPLE_RATES,
  VIDEO_PRESETS,
} from '../../lib/convert'
import { saveBytes } from '../../lib/download'
import { loadFfmpeg, onFfmpegProgress, runFfmpeg, sanitize } from '../../lib/ffmpegClient'
import { formatBytes, withExtension } from '../../lib/format'
import { holdScreenAwake } from '../../lib/wakeLock'
import { createZip } from '../../lib/zip'
import { formatTimecode } from '../../lib/format'
import { useDecodedAudio } from '../../hooks/useDecodedAudio'
import { kindFromMime, useActiveAsset, useSession } from '../../state/store'
import { AssetList } from '../AssetList'
import { FileDrop } from '../FileDrop'
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
  Slider,
  Stat,
  Toggle,
} from '../ui/primitives'

interface Outcome {
  name: string
  bytes: Uint8Array
  mime: string
  sourceBytes: number
  elapsedMs: number
}

type QueueState = 'pending' | 'running' | 'done' | 'error'

interface QueueItem {
  id: string
  name: string
  state: QueueState
  outputBytes: number | null
  message?: string
}

const STATE_MARK: Record<QueueState, string> = {
  pending: '·',
  running: '▸',
  done: '✓',
  error: '✕',
}

export function ConverterPanel() {
  const asset = useActiveAsset()
  const settings = useSession((state) => state.convert)
  const setConvert = useSession((state) => state.setConvert)
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Batch mode: one settings pass applied to everything in the session, which
  // is the common case for a folder of recordings.
  const assets = useSession((state) => state.assets)
  const [batch, setBatch] = useState(false)
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [archive, setArchive] = useState<Uint8Array<ArrayBuffer> | null>(null)

  const format = useMemo(() => findFormat(settings.formatId), [settings.formatId])

  // Duration comes from a decode, which is worth doing only if the user opens
  // the trim controls — decoding a two-hour video to place a slider is absurd.
  const { audio, decode, status: decodeStatus } = useDecodedAudio(asset)
  const [trimOpen, setTrimOpen] = useState(false)
  const duration = asset?.durationSeconds ?? (audio ? audio.channels[0].length / audio.sampleRate : null)

  const command = useMemo(() => {
    if (!asset) return null
    const input = `in_${sanitize(asset.name)}`
    const output = `out.${format.extension}`
    return previewCommand(buildConvertArgs(input, output, settings))
  }, [asset, format.extension, settings])

  useEffect(() => onFfmpegProgress((fraction) => setProgress(fraction)), [])

  const convert = async () => {
    if (!asset) return
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setProgress(0)
    setError(null)
    setOutcome(null)

    const started = performance.now()
    try {
      await loadFfmpeg()
      const inputName = `in_${sanitize(asset.name)}`
      const outputName = `out.${format.extension}`
      const args = buildConvertArgs(inputName, outputName, settings)
      log('konverter', `ffmpeg ${args.join(' ')}`)

      const { files } = await runFfmpeg({
        input: { [inputName]: asset.bytes },
        output: [outputName],
        args,
        signal: controller.signal,
      })

      const bytes = files[outputName]
      setOutcome({
        name: withExtension(asset.name, format.extension),
        bytes,
        mime: format.mime,
        sourceBytes: asset.sizeBytes,
        elapsedMs: performance.now() - started,
      })
      log('konverter', `${format.label} erzeugt — ${formatBytes(bytes.byteLength)}`)
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') {
        log('konverter', 'Abgebrochen', 'warn')
      } else {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(message)
        log('konverter', message, 'error')
      }
    } finally {
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  /** Runs the current settings over every asset in the session, in order. */
  const convertBatch = async () => {
    if (assets.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    const releaseWakeLock = await holdScreenAwake()

    setRunning(true)
    setError(null)
    setOutcome(null)
    setArchive(null)
    setQueue(assets.map((entry) => ({ id: entry.id, name: entry.name, state: 'pending', outputBytes: null })))

    const produced: { name: string; data: Uint8Array }[] = []
    const mark = (id: string, patch: Partial<QueueItem>) =>
      setQueue((current) => current?.map((item) => (item.id === id ? { ...item, ...patch } : item)) ?? null)

    try {
      await loadFfmpeg()
      for (const entry of assets) {
        if (controller.signal.aborted) break
        mark(entry.id, { state: 'running' })
        const inputName = `in_${sanitize(entry.name)}`
        const outputName = `out.${format.extension}`
        try {
          const { files } = await runFfmpeg({
            input: { [inputName]: entry.bytes },
            output: [outputName],
            args: buildConvertArgs(inputName, outputName, settings),
            signal: controller.signal,
          })
          const bytes = files[outputName]
          produced.push({ name: withExtension(entry.name, format.extension), data: bytes })
          mark(entry.id, { state: 'done', outputBytes: bytes.byteLength })
        } catch (failure) {
          if (controller.signal.aborted) break
          // One bad file should not abandon the other nineteen.
          const message = failure instanceof Error ? failure.message.split('\n')[0] : String(failure)
          mark(entry.id, { state: 'error', message })
          log('konverter', `${entry.name}: ${message}`, 'error')
        }
      }

      if (produced.length > 0) {
        setArchive(createZip(produced.map((file) => ({ name: file.name, data: file.data }))))
        log('konverter', `${produced.length} von ${assets.length} Dateien umgewandelt`)
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure)
      setError(message)
      log('konverter', message, 'error')
    } finally {
      releaseWakeLock()
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  const isLossy = !format.lossless && format.kind !== 'image'
  const showVbr = format.id === 'mp3' || format.id === 'vorbis'

  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[21px]">
        <Card tone="keylime">
          <Eyebrow>Konverter</Eyebrow>
          <h2 className="display-md mt-[11px] mb-[14px]">Format umwandeln</h2>
          <p className="max-w-[56ch] text-body leading-[1.6] text-prose/85">
            FFmpeg läuft als WebAssembly in einem Web Worker dieses Tabs. Die Datei wird in ein
            In-Memory-Dateisystem geschrieben, dort transkodiert und wieder ausgelesen — sie verlässt
            den Arbeitsspeicher Ihres Rechners zu keinem Zeitpunkt.
          </p>

          {!asset ? (
            <div className="mt-[28px]">
              <FileDrop />
            </div>
          ) : (
            <>
              <div className="mt-[28px] grid gap-[18px] sm:grid-cols-2">
                <Field label="Zielformat">
                  <Select
                    value={settings.formatId}
                    onChange={(event) => setConvert({ formatId: event.target.value })}
                  >
                    {(['audio', 'video', 'image'] as const).map((kind) => (
                      <optgroup
                        key={kind}
                        label={kind === 'audio' ? 'Audio' : kind === 'video' ? 'Video' : 'Bild'}
                      >
                        {OUTPUT_FORMATS.filter((f) => f.kind === kind).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label} — {f.hint}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>

                {isLossy && !showVbr ? (
                  <Field label="Audio-Bitrate">
                    <Select
                      value={settings.audioBitrateKbps}
                      onChange={(event) => setConvert({ audioBitrateKbps: Number(event.target.value) })}
                    >
                      {BITRATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate} kbit/s
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}

                {showVbr ? (
                  <Field
                    label="Qualität"
                    hint={settings.useVariableBitrate ? 'Variable Bitrate, 0 = beste' : undefined}
                  >
                    <Select
                      value={settings.useVariableBitrate ? `q${settings.audioQuality}` : `b${settings.audioBitrateKbps}`}
                      onChange={(event) => {
                        const value = event.target.value
                        if (value.startsWith('q')) {
                          setConvert({ useVariableBitrate: true, audioQuality: Number(value.slice(1)) })
                        } else {
                          setConvert({ useVariableBitrate: false, audioBitrateKbps: Number(value.slice(1)) })
                        }
                      }}
                    >
                      <optgroup label="Variable Bitrate">
                        {[0, 2, 4, 6].map((q) => (
                          <option key={q} value={`q${q}`}>
                            VBR q{q}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Konstante Bitrate">
                        {BITRATES.map((rate) => (
                          <option key={rate} value={`b${rate}`}>
                            {rate} kbit/s
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Field>
                ) : null}

                {format.id === 'wav' ? (
                  <Field label="Bittiefe">
                    <Select
                      value={settings.wavBitDepth}
                      onChange={(event) =>
                        setConvert({ wavBitDepth: Number(event.target.value) as 16 | 24 | 32 })
                      }
                    >
                      <option value={16}>16 Bit PCM</option>
                      <option value={24}>24 Bit PCM</option>
                      <option value={32}>32 Bit Float</option>
                    </Select>
                  </Field>
                ) : null}

                <Field label="Abtastrate">
                  <Select
                    value={String(settings.sampleRate)}
                    onChange={(event) =>
                      setConvert({
                        sampleRate: event.target.value === 'source' ? 'source' : Number(event.target.value),
                      })
                    }
                  >
                    <option value="source">Wie Quelle</option>
                    {SAMPLE_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate / 1000} kHz
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Kanäle">
                  <Select
                    value={String(settings.channels)}
                    onChange={(event) =>
                      setConvert({
                        channels: event.target.value === 'source' ? 'source' : (Number(event.target.value) as 1 | 2),
                      })
                    }
                  >
                    <option value="source">Wie Quelle</option>
                    <option value={1}>Mono</option>
                    <option value={2}>Stereo</option>
                  </Select>
                </Field>

                {format.kind === 'video' ? (
                  <>
                    <Field label="Encoder-Preset" hint="Langsamer heißt kleiner bei gleicher Qualität.">
                      <Select
                        value={settings.videoPreset}
                        onChange={(event) => setConvert({ videoPreset: event.target.value })}
                      >
                        {VIDEO_PRESETS.map((preset) => (
                          <option key={preset} value={preset}>
                            {preset}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Höhe">
                      <Select
                        value={String(settings.videoHeight)}
                        onChange={(event) =>
                          setConvert({
                            videoHeight:
                              event.target.value === 'source' ? 'source' : Number(event.target.value),
                          })
                        }
                      >
                        <option value="source">Wie Quelle</option>
                        {[2160, 1440, 1080, 720, 480, 360].map((height) => (
                          <option key={height} value={height}>
                            {height}p
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="sm:col-span-2">
                      <Slider
                        label="CRF"
                        display={`${settings.videoCrf}`}
                        min={14}
                        max={40}
                        step={1}
                        value={settings.videoCrf}
                        onChange={(event) => setConvert({ videoCrf: Number(event.target.value) })}
                      />
                      <p className="mt-[7px] text-[12px] text-muted">
                        Niedriger ist besser und größer. 18 gilt als sichtbar verlustfrei, 23 als guter
                        Kompromiss.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-[28px]">
                <Toggle
                  label="Zuschneiden"
                  hint="Nur einen Ausschnitt umwandeln. Bildgenau, weil am Ausgang gesucht wird."
                  checked={trimOpen}
                  onChange={(value) => {
                    setTrimOpen(value)
                    if (value && !duration) void decode()
                    if (!value) setConvert({ trimStartSeconds: null, trimEndSeconds: null })
                  }}
                />

                {trimOpen ? (
                  duration ? (
                    <div className="mt-[18px] grid gap-[21px] sm:grid-cols-2">
                      <Slider
                        label="Anfang"
                        display={formatTimecode(settings.trimStartSeconds ?? 0)}
                        min={0}
                        max={duration}
                        step={0.01}
                        value={settings.trimStartSeconds ?? 0}
                        onChange={(event) => {
                          const start = Number(event.target.value)
                          setConvert({
                            trimStartSeconds: start,
                            // Keep the end after the start, or ffmpeg writes nothing.
                            trimEndSeconds: Math.max(start + 0.1, settings.trimEndSeconds ?? duration),
                          })
                        }}
                      />
                      <Slider
                        label="Ende"
                        display={formatTimecode(settings.trimEndSeconds ?? duration)}
                        min={0}
                        max={duration}
                        step={0.01}
                        value={settings.trimEndSeconds ?? duration}
                        onChange={(event) => {
                          const end = Number(event.target.value)
                          setConvert({
                            trimEndSeconds: end,
                            trimStartSeconds: Math.min(end - 0.1, settings.trimStartSeconds ?? 0),
                          })
                        }}
                      />
                      <p className="numeric text-[12px] text-muted sm:col-span-2">
                        Ausschnitt{' '}
                        {formatTimecode(
                          (settings.trimEndSeconds ?? duration) - (settings.trimStartSeconds ?? 0),
                        )}{' '}
                        von {formatTimecode(duration)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-[14px] text-[13px] text-muted">
                      {decodeStatus === 'decoding' ? 'Länge wird ermittelt…' : 'Länge noch unbekannt.'}
                    </p>
                  )
                ) : null}
              </div>

              {command ? (
                <div className="mt-[28px]">
                  <Eyebrow>Befehl</Eyebrow>
                  <pre className="mt-[11px] overflow-x-auto rounded-card bg-raised p-[18px] font-mono text-[12px] leading-[1.6] text-prose ring-1 ring-inset ring-line">
                    <code>{command}</code>
                  </pre>
                </div>
              ) : null}

              <div className="mt-[21px]">
                <Toggle
                  label={`Alle ${assets.length} Dateien der Sitzung umwandeln`}
                  hint="Dieselben Einstellungen nacheinander auf jede Datei anwenden, Ergebnis als ZIP."
                  checked={batch}
                  onChange={(value) => {
                    setBatch(value)
                    setQueue(null)
                    setArchive(null)
                  }}
                  disabled={assets.length < 2}
                />
              </div>

              <div className="mt-[21px] flex flex-wrap items-center gap-[11px]">
                <Button onClick={batch ? convertBatch : convert} disabled={running}>
                  {running ? 'Läuft…' : batch ? `${assets.length} Dateien umwandeln` : 'Umwandeln'}
                  {!running ? <ArrowRight /> : null}
                </Button>
                {running ? (
                  <Button variant="quiet" onClick={() => abortRef.current?.abort()}>
                    Abbrechen
                  </Button>
                ) : null}
              </div>

              {running ? (
                <div className="mt-[18px]">
                  <Progress value={progress} label="Transkodierung" />
                </div>
              ) : null}
            </>
          )}
        </Card>

        {error ? (
          <Notice tone="error" title="Umwandlung fehlgeschlagen">
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-[1.5]">{error}</pre>
          </Notice>
        ) : null}

        {queue ? (
          <Card tone="slate">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Stapel</Eyebrow>
              <span className="numeric text-[12px] text-muted">
                {queue.filter((item) => item.state === 'done').length} von {queue.length} fertig
              </span>
            </div>

            <ul className="mt-[18px] flex flex-col gap-[7px]">
              {queue.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-[11px] rounded-card bg-raised px-[18px] py-[11px]"
                >
                  <span
                    aria-hidden
                    className={`numeric w-[14px] shrink-0 text-center text-[13px] ${
                      item.state === 'running' ? 'text-ink pulse-dot' : 'text-muted'
                    }`}
                  >
                    {STATE_MARK[item.state]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-ink">{item.name}</span>
                  {item.outputBytes !== null ? (
                    <span className="numeric shrink-0 text-[12px] text-muted">
                      {formatBytes(item.outputBytes)}
                    </span>
                  ) : null}
                  {item.message ? (
                    <span className="w-full text-[12px] text-muted">{item.message}</span>
                  ) : null}
                </li>
              ))}
            </ul>

            {archive ? (
              <div className="mt-[21px]">
                <Button
                  onClick={() =>
                    saveBytes(archive, `lizge-${format.extension}-${queue.length}.zip`, 'application/zip')
                  }
                >
                  Alle als ZIP speichern ({formatBytes(archive.byteLength)})
                  <ArrowRight />
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}

        {outcome ? (
          <Card tone="slate">
            <Eyebrow>Ergebnis</Eyebrow>
            <div className="mt-[18px] grid gap-[21px] rounded-card bg-raised p-[28px] sm:grid-cols-3">
              <Stat label="Größe" value={formatBytes(outcome.bytes.byteLength)} emphasis />
              <Stat
                label="Gegenüber Quelle"
                value={`${Math.round((outcome.bytes.byteLength / outcome.sourceBytes) * 100)} %`}
                note={formatBytes(outcome.sourceBytes)}
              />
              <Stat label="Dauer" value={`${(outcome.elapsedMs / 1000).toFixed(1)} s`} />
            </div>
            <div className="mt-[18px] flex flex-wrap gap-[11px]">
              <Button onClick={() => saveBytes(outcome.bytes, outcome.name, outcome.mime)}>
                Speichern
                <ArrowRight />
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
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
                  log('konverter', `${outcome.name} in die Sitzung übernommen`)
                }}
              >
                In die Sitzung übernehmen
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      <aside className="flex flex-col gap-[21px]">
        <Card tone="mint">
          <AssetList />
          <div className="mt-[18px]">
            <FileDrop compact />
          </div>
        </Card>
        <Card tone="cream" className="ring-1 ring-inset ring-line">
          <Eyebrow>Quelle</Eyebrow>
          {asset ? (
            <div className="mt-[14px] flex flex-col gap-[11px]">
              <p className="break-all text-body text-ink">{asset.name}</p>
              <div className="flex flex-wrap gap-[7px]">
                <Badge>{formatBytes(asset.sizeBytes)}</Badge>
                <Badge>{asset.kind === 'video' ? 'Video' : asset.kind === 'audio' ? 'Audio' : 'Unbekannt'}</Badge>
                {asset.mime ? <Badge>{asset.mime}</Badge> : null}
              </div>
            </div>
          ) : (
            <p className="mt-[14px] text-[13px] text-muted">Keine Datei ausgewählt.</p>
          )}
        </Card>
      </aside>
    </div>
  )
}
