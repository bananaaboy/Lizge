/**
 * Stem separation.
 *
 * Two engines, one panel. The built-in signal-processing separator needs nothing
 * but the file. An ONNX model — Demucs, Spleeter, anything the user has — can be
 * loaded on top and runs through WebGPU when the machine has it.
 */

import { useRef, useState } from 'react'

import { saveBytes } from '../../lib/download'
import { hasWebGpuAdapter, detectCapabilities, suggestedThreads } from '../../lib/capabilities'
import { formatBytes, withExtension } from '../../lib/format'
import { STEM_IDS, STEM_LABELS, toInstrumental, type StemId } from '../../lib/separation'
import { encodeWav, type AudioData } from '../../lib/wav'
import { holdScreenAwake } from '../../lib/wakeLock'
import { separateInWorker } from '../../lib/workerClient'
import { createZip } from '../../lib/zip'
import { useDecodedAudio } from '../../hooks/useDecodedAudio'
import { useActiveAsset, useSession } from '../../state/store'
import { SessionCard } from '../AssetList'
import { AudioPreview } from '../AudioPreview'
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
  Toggle,
} from '../ui/primitives'

type Stems = Record<StemId, AudioData>

export function StemsPanel() {
  const asset = useActiveAsset()
  const options = useSession((state) => state.separation)
  const setSeparation = useSession((state) => state.setSeparation)
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)
  const { audio, decode } = useDecodedAudio(asset)

  const caps = detectCapabilities()
  const [model, setModel] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [preferWebGpu, setPreferWebGpu] = useState(caps.webgpu)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [stems, setStems] = useState<Stems | null>(null)
  const [instrumental, setInstrumental] = useState<AudioData | null>(null)
  const [engine, setEngine] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)

  const run = async () => {
    if (!asset) return
    const controller = new AbortController()
    abortRef.current = controller
    // Separation on a long track runs for minutes; a sleeping machine would
    // suspend the tab and lose all of it.
    const releaseWakeLock = await holdScreenAwake()
    setRunning(true)
    setError(null)
    setStems(null)
    setInstrumental(null)

    try {
      const decoded = audio ?? (await decode())
      if (!decoded) return

      const gpu = preferWebGpu && (await hasWebGpuAdapter())
      const outcome = await separateInWorker(
        decoded,
        options,
        {
          model: model ? model.bytes.slice() : null,
          threads: suggestedThreads(caps),
          preferWebGpu: gpu,
        },
        (fraction, hint) => {
          setProgress(fraction)
          setNote(hint ?? null)
        },
        controller.signal,
      )

      setStems(outcome.stems)
      setInstrumental(toInstrumental(decoded, outcome.stems.vocals))
      setEngine(
        outcome.engine === 'onnx'
          ? `Neuronales Modell · ${outcome.provider === 'webgpu' ? 'WebGPU' : 'WASM'}`
          : 'Signalverarbeitung im Browser',
      )
      log('spuren', `Trennung abgeschlossen (${outcome.engine})`)
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(message)
        log('spuren', message, 'error')
      }
    } finally {
      releaseWakeLock()
      setRunning(false)
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  /** All stems in one archive, rather than five separate save prompts. */
  const exportAll = () => {
    if (!stems) return
    const base = asset?.name.replace(/\.[^.]+$/, '') ?? 'audio'
    const files = STEM_IDS.map((id) => ({
      name: `${base}/${id}.wav`,
      data: encodeWav(stems[id], 24),
    }))
    if (instrumental) files.push({ name: `${base}/instrumental.wav`, data: encodeWav(instrumental, 24) })
    saveBytes(createZip(files), `${base}-stems.zip`, 'application/zip')
    log('spuren', `${files.length} Spuren als ZIP gespeichert`)
  }

  const exportStem = (id: StemId | 'instrumental', data: AudioData) => {
    const base = asset?.name ?? 'audio'
    const name = withExtension(`${base}_${id}`, 'wav')
    saveBytes(encodeWav(data, 24), name, 'audio/wav')
  }

  const keepStem = (id: StemId | 'instrumental', data: AudioData) => {
    const base = asset?.name ?? 'audio'
    const name = withExtension(`${base}_${id}`, 'wav')
    const bytes = encodeWav(data, 24)
    addAsset({
      name,
      bytes,
      mime: 'audio/wav',
      sizeBytes: bytes.byteLength,
      kind: 'audio',
      audio: data,
      durationSeconds: (data.channels[0]?.length ?? 0) / data.sampleRate,
      origin: 'derived',
    })
    log('spuren', `${name} in die Sitzung übernommen`)
  }

  const isMono = (audio?.channels.length ?? 2) < 2

  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[21px]">
        <Card tone="keylime">
          <Eyebrow>Spuren trennen</Eyebrow>
          <h2 className="display-md mt-[8px] mb-[12px]">Gesang, Schlagzeug, Bass und Rest</h2>
          <details className="max-w-[60ch]">
            <summary className="cursor-pointer list-none text-[13px] text-muted underline underline-offset-2 hover:text-ink">
              Wie die Trennung rechnet
            </summary>
            <p className="mt-[9px] text-[13px] leading-[1.6] text-prose/85">
              Das eingebaute Verfahren trennt harmonische von perkussiven Anteilen über Medianfilter im
              Spektrogramm und schätzt den Gesang aus der Mittenkohärenz zwischen links und rechts. Vier
              Masken, die sich zu eins ergänzen — die Spuren addieren sich exakt zum Original zurück.
            </p>
          </details>

          {!asset ? (
            <div className="mt-[28px]">
              <FileDrop />
            </div>
          ) : (
            <>
              {isMono && audio ? (
                <div className="mt-[21px]">
                  <Notice tone="warn" title="Mono-Material">
                    Ohne Stereobild gibt es keine Mitteninformation, aus der sich der Gesang ableiten
                    ließe. Die Trennung stützt sich dann allein auf Frequenzbänder und
                    harmonisch/perkussiv — das Ergebnis ist deutlich grober.
                  </Notice>
                </div>
              ) : null}

              {/* Four expert dials, defaulted sensibly and folded away. They
                  used to be the first thing on screen, ahead of the button
                  that uses them — which puts a decision in front of anyone
                  who only wanted the thing to run. */}
              <details className="mt-[21px] rounded-card bg-panel-soft p-[18px]">
                <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink">
                  Feineinstellungen
                  <span className="ml-[7px] font-normal text-muted">
                    für Ausnahmefälle — die Vorgaben passen meistens
                  </span>
                </summary>
                <div className="mt-[18px] grid gap-[21px] sm:grid-cols-2">
                  <Slider
                    label="Mittenschärfe"
                    display={options.vocalFocus.toFixed(2)}
                    min={0}
                    max={0.9}
                    step={0.05}
                    value={options.vocalFocus}
                    onChange={(event) => setSeparation({ vocalFocus: Number(event.target.value) })}
                  />
                  <Slider
                    label="Maskenhärte"
                    display={options.maskExponent.toFixed(1)}
                    min={1}
                    max={4}
                    step={0.5}
                    value={options.maskExponent}
                    onChange={(event) => setSeparation({ maskExponent: Number(event.target.value) })}
                  />
                  <Field label="Auflösung" hint="Größer trennt Töne feiner, verschmiert aber Transienten.">
                    <Select
                      value={options.fftSize}
                      onChange={(event) => {
                        const fftSize = Number(event.target.value)
                        setSeparation({ fftSize, hopSize: fftSize / 4 })
                      }}
                    >
                      <option value={2048}>2048 — transientenfreundlich</option>
                      <option value={4096}>4096 — ausgewogen</option>
                      <option value={8192}>8192 — feine Tonhöhen</option>
                    </Select>
                  </Field>
                  <Field label="Medianfenster" hint="Länge der Harmonisch-/Perkussiv-Filter.">
                    <Select
                      value={options.timeKernel}
                      onChange={(event) => {
                        const kernel = Number(event.target.value)
                        setSeparation({ timeKernel: kernel, freqKernel: kernel })
                      }}
                    >
                      <option value={9}>9 — schnell</option>
                      <option value={17}>17 — Standard</option>
                      <option value={31}>31 — gründlich</option>
                    </Select>
                  </Field>
                </div>
              </details>

              <div className="mt-[28px] flex flex-wrap items-center gap-[11px]">
                <Button onClick={run} disabled={running}>
                  {running ? 'Wird getrennt…' : 'Spuren trennen'}
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
                  <Progress value={progress} label={note ?? 'Analyse'} />
                </div>
              ) : null}
            </>
          )}
        </Card>

        {error ? (
          <Notice tone="error" title="Trennung fehlgeschlagen">
            {error}
          </Notice>
        ) : null}

        {stems ? (
          <Card tone="slate">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Spuren</Eyebrow>
              <div className="flex flex-wrap items-center gap-[7px]">
                {engine ? <Badge>{engine}</Badge> : null}
                <Button size="sm" onClick={exportAll}>
                  Alle als ZIP
                </Button>
              </div>
            </div>

            <div className="mt-[18px] flex flex-col gap-[11px]">
              {STEM_IDS.map((id) => (
                <div key={id} className="rounded-card bg-raised p-[18px]">
                  <div className="mb-[11px] flex flex-wrap items-center justify-between gap-3">
                    <span className="text-subheading text-ink">{STEM_LABELS[id]}</span>
                    <div className="flex gap-[7px]">
                      <Button size="sm" variant="quiet" onClick={() => keepStem(id, stems[id])}>
                        Übernehmen
                      </Button>
                      <Button size="sm" onClick={() => exportStem(id, stems[id])}>
                        WAV
                      </Button>
                    </div>
                  </div>
                  {/* Gegen das Original umschaltbar: ob eine Trennung etwas
                      taugt, hört man nur im direkten Vergleich. */}
                  <AudioPreview
                    sources={
                      audio
                        ? [
                            { id: `${id}-stem`, label: STEM_LABELS[id], audio: stems[id] },
                            { id: `${id}-source`, label: 'Original', audio },
                          ]
                        : [{ id: `${id}-stem`, label: STEM_LABELS[id], audio: stems[id] }]
                    }
                  />
                </div>
              ))}

              {instrumental ? (
                <div className="rounded-card bg-raised p-[18px]">
                  <div className="mb-[11px] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-subheading text-ink">Instrumental</span>
                      <span className="text-[12px] text-muted">
                        Original minus Gesang — exakt, weil subtrahiert statt neu maskiert.
                      </span>
                    </div>
                    <div className="flex gap-[7px]">
                      <Button size="sm" variant="quiet" onClick={() => keepStem('instrumental', instrumental)}>
                        Übernehmen
                      </Button>
                      <Button size="sm" onClick={() => exportStem('instrumental', instrumental)}>
                        WAV
                      </Button>
                    </div>
                  </div>
                  <AudioPreview
                    sources={
                      audio
                        ? [
                            { id: 'instrumental', label: 'Instrumental', audio: instrumental },
                            { id: 'instrumental-source', label: 'Original', audio },
                          ]
                        : [{ id: 'instrumental', label: 'Instrumental', audio: instrumental }]
                    }
                  />
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>

      <aside className="flex flex-col gap-[21px]">
        <SessionCard />

        <Card tone="cream">
          <Eyebrow>Neuronales Modell</Eyebrow>
          <p className="mt-[9px] text-[13px] leading-[1.55] text-prose/85">
            Optional. Ohne Modell rechnet das eingebaute Verfahren.
          </p>
          <details className="mt-[7px]">
            <summary className="cursor-pointer list-none text-[12px] text-muted underline underline-offset-2 hover:text-ink">
              Warum keins mitgeliefert wird
            </summary>
            <p className="mt-[7px] text-[12px] leading-[1.55] text-prose/85">
              Ein Demucs-Export wiegt Hunderte Megabyte, die sonst jeder Besuch herunterlädt. Ihr
              eigenes <code>.onnx</code> wird lokal ausgeführt und verlässt das Gerät nicht.
            </p>
          </details>

          <input
            ref={modelInputRef}
            type="file"
            accept=".onnx"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const bytes = new Uint8Array(await file.arrayBuffer())
              setModel({ name: file.name, bytes })
              log('spuren', `Modell ${file.name} geladen (${formatBytes(bytes.byteLength)})`)
            }}
          />

          <div className="mt-[18px] flex flex-wrap gap-[7px]">
            <Button size="sm" variant="quiet" onClick={() => modelInputRef.current?.click()}>
              {model ? 'Anderes Modell' : 'Modell wählen'}
            </Button>
            {model ? (
              <Button size="sm" variant="ghost" onClick={() => setModel(null)}>
                Entfernen
              </Button>
            ) : null}
          </div>

          {model ? (
            <div className="mt-[14px] flex flex-wrap gap-[7px]">
              <Badge>{model.name}</Badge>
              <Badge>{formatBytes(model.bytes.byteLength)}</Badge>
            </div>
          ) : null}

          <div className="mt-[18px]">
            <Toggle
              label="WebGPU bevorzugen"
              hint={
                caps.webgpu
                  ? 'Deutlich schneller als WASM, wenn der Treiber mitspielt.'
                  : 'Dieser Browser bietet keine WebGPU-Schnittstelle an.'
              }
              checked={preferWebGpu}
              onChange={setPreferWebGpu}
              disabled={!caps.webgpu}
            />
          </div>
        </Card>
      </aside>
    </div>
  )
}
