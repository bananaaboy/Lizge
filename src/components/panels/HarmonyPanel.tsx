/**
 * Harmony: key, chords and transcription.
 *
 * The two things a DAW mostly cannot do with a piece of audio you dropped in.
 * FL Studio 2026 names chords from the piano roll but not from a recording, and
 * its pitch-region detector is not a key finder — which is why producers buy a
 * separate plugin for exactly this. Nothing here needs one: a key is a
 * distribution over the twelve pitch classes, and that is measurable.
 *
 * Transcription is monophonic on purpose. A polyphonic transcriber needs a
 * trained model and a download to match; a single line — a bassline, a hook, a
 * vocal — is what people actually want to lift, and YIN does that honestly.
 */

import { useRef, useState } from 'react'

import { saveBytes } from '../../lib/download'
import { formatTimecode } from '../../lib/format'
import { PITCH_CLASSES } from '../../lib/chroma'
import { writeMidi } from '../../lib/midi'
import { midiName, type Note } from '../../lib/pitch'
import { estimateTempo } from '../../lib/tempo'
import { analyseHarmonyInWorker, type HarmonyOutcome } from '../../lib/workerClient'
import { useDecodedAudio } from '../../hooks/useDecodedAudio'
import { useActiveAsset, useSession } from '../../state/store'
import { AssetList } from '../AssetList'
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
  Stat,
  Toggle,
} from '../ui/primitives'

/** Camelot neighbours: the keys that mix with this one. */
function neighbours(camelot: string): string[] {
  const match = camelot.match(/^(\d+)([AB])$/)
  if (!match) return []
  const number = Number(match[1])
  const letter = match[2]
  const wrap = (value: number) => ((value - 1 + 12) % 12) + 1
  return [
    `${number}${letter === 'A' ? 'B' : 'A'}`,
    `${wrap(number - 1)}${letter}`,
    `${wrap(number + 1)}${letter}`,
  ]
}

/** The twelve pitch classes as a bar chart. */
function ChromaChart({ chroma }: { chroma: Float32Array }) {
  const peak = Math.max(...chroma, 1e-6)
  return (
    <div className="flex items-stretch gap-[3px]" style={{ height: 72 }}>
      {PITCH_CLASSES.map((name, index) => (
        <div key={name} className="flex h-full flex-1 flex-col items-center justify-end gap-[4px]">
          <div
            className="w-full rounded-t-[3px] bg-ink"
            style={{ height: `${Math.max(2, (chroma[index] / peak) * 100)}%` }}
            title={`${name}: ${(chroma[index] / peak).toFixed(2)}`}
          />
          <span className="shrink-0 text-[9px] leading-none text-muted">{name}</span>
        </div>
      ))}
    </div>
  )
}

/** Notes drawn as a piano roll, time across, pitch up. */
function NoteRoll({ notes }: { notes: Note[] }) {
  if (notes.length === 0) return null
  const lowest = Math.min(...notes.map((note) => note.midi))
  const highest = Math.max(...notes.map((note) => note.midi))
  const span = Math.max(1, highest - lowest + 1)
  const end = Math.max(...notes.map((note) => note.endSeconds))

  return (
    <div className="relative w-full overflow-hidden rounded-nav bg-panel-soft" style={{ height: 120 }}>
      {notes.map((note, index) => (
        <div
          key={`${note.midi}-${note.startSeconds}-${index}`}
          className="absolute rounded-[2px] bg-ink"
          style={{
            left: `${(note.startSeconds / end) * 100}%`,
            width: `${Math.max(0.4, ((note.endSeconds - note.startSeconds) / end) * 100)}%`,
            bottom: `${((note.midi - lowest) / span) * 100}%`,
            height: `${Math.max(4, 100 / span)}%`,
            opacity: 0.45 + (note.velocity / 127) * 0.55,
          }}
          title={`${midiName(note.midi)} · ${formatTimecode(note.startSeconds)}`}
        />
      ))}
    </div>
  )
}

type ViewMode = 'einfach' | 'detail'

export function HarmonyPanel() {
  const asset = useActiveAsset()
  const log = useSession((state) => state.log)
  const { audio, decode, status: decodeStatus } = useDecodedAudio(asset)

  // Most of the time the answer is two numbers. The detailed view is for when
  // you disagree with them and want to see the evidence.
  const [mode, setMode] = useState<ViewMode>('einfach')
  const [transcribe, setTranscribe] = useState(true)
  const [chordWindow, setChordWindow] = useState(0.5)
  const [clarity, setClarity] = useState(0.55)
  const [minimumNote, setMinimumNote] = useState(0.08)
  const [quantize, setQuantize] = useState(0)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<HarmonyOutcome | null>(null)
  const [bpm, setBpm] = useState(120)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const analyse = async () => {
    if (!asset) return
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const decoded = audio ?? (await decode())
      if (!decoded) return

      // The MIDI export needs a tempo, and the note grid needs one too.
      const tempo = estimateTempo(decoded)
      setBpm(tempo.bpm)

      const outcome = await analyseHarmonyInWorker(
        decoded,
        {
          chordWindow,
          // The pitch tracker is the expensive half and simple mode does not
          // show its result, so it is skipped there.
          transcribe: mode === 'detail' && transcribe,
          minimumClarity: clarity,
          minimumNoteSeconds: minimumNote,
          quantizeSeconds: quantize > 0 ? (60 / tempo.bpm) * quantize : 0,
        },
        (fraction, hint) => {
          setProgress(fraction)
          setNote(hint ?? null)
        },
        controller.signal,
      )

      setResult(outcome)
      log(
        'harmonie',
        `${outcome.key.label} (${outcome.key.camelot}), ${outcome.chords.length} Akkorde` +
          (transcribe ? `, ${outcome.notes.length} Noten` : ''),
      )
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(message)
        log('harmonie', message, 'error')
      }
    } finally {
      setRunning(false)
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  const exportMidi = () => {
    if (!result || result.notes.length === 0) return
    const base = asset?.name.replace(/\.[^.]+$/, '') ?? 'melodie'
    const bytes = writeMidi(result.notes, { bpm, trackName: base })
    saveBytes(bytes, `${base}.mid`, 'audio/midi')
    log('harmonie', `${result.notes.length} Noten als MIDI gespeichert`)
  }

  const confident = (result?.key.confidence ?? 0) >= 0.4

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-[18px]">
        <Card tone="keylime" size="compact">
          <div className="flex flex-wrap items-center justify-between gap-x-[14px] gap-y-[9px]">
            <Eyebrow>Harmonie</Eyebrow>
            <div role="radiogroup" aria-label="Ansicht" className="flex gap-[3px] rounded-pill bg-raised p-[3px]">
              {(['einfach', 'detail'] as ViewMode[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="radio"
                  aria-checked={mode === entry}
                  onClick={() => setMode(entry)}
                  className={`rounded-pill px-[14px] py-[5px] text-[12px] transition-colors ${
                    mode === entry ? 'bg-ink text-on-ink' : 'text-ink hover:bg-panel-mid'
                  }`}
                >
                  {entry === 'einfach' ? 'Einfach' : 'Detail'}
                </button>
              ))}
            </div>
          </div>

          {!asset ? (
            <div className="mt-[14px]">
              <FileDrop />
            </div>
          ) : (
            <>
              {mode === 'detail' ? (
                <p className="mt-[11px] max-w-[62ch] text-[13px] leading-[1.55] text-prose/85">
                  Die Tonart wird aus der Verteilung der zwölf Tonklassen geschätzt und mit den
                  Profilen von Krumhansl und Kessler verglichen. Die Melodieerkennung ist
                  einstimmig — für eine Basslinie, ein Hook oder eine Gesangsspur, nicht für den
                  ganzen Mix.
                </p>
              ) : (
                <p className="mt-[11px] text-[13px] leading-[1.55] text-muted">
                  Tempo und Tonart. Für Akkorde, Tonklassen und die Melodie auf „Detail“ wechseln.
                </p>
              )}

              <div className="mt-[14px] flex flex-wrap items-center gap-[9px]">
                <Button size="sm" onClick={analyse} disabled={running}>
                  {running ? 'Analysiert…' : 'Analysieren'}
                  {!running ? <ArrowRight /> : null}
                </Button>
                {running ? (
                  <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
                    Abbrechen
                  </Button>
                ) : null}
                {mode === 'detail' && result && result.notes.length > 0 ? (
                  <Button size="sm" variant="quiet" onClick={exportMidi}>
                    MIDI speichern ({result.notes.length} Noten)
                  </Button>
                ) : null}
              </div>

              {running || decodeStatus === 'decoding' ? (
                <div className="mt-[11px]">
                  <Progress value={progress} label={note ?? 'Wird dekodiert'} />
                </div>
              ) : null}
            </>
          )}
        </Card>

        {error ? (
          <Notice tone="error" title="Analyse fehlgeschlagen">
            {error}
          </Notice>
        ) : null}

        {result && mode === 'einfach' ? (
          <Card tone="slate" size="compact">
            <div className="grid gap-[14px] rounded-card bg-raised p-[21px] sm:grid-cols-3">
              <Stat label="Tempo" value={`${Math.round(bpm)} BPM`} emphasis />
              <Stat label="Tonart" value={result.key.label} emphasis />
              <Stat
                label="Camelot"
                value={result.key.camelot}
                emphasis
                note={confident ? 'eindeutig' : `knapp vor ${result.key.alternative.camelot}`}
              />
            </div>
            {audio ? (
              <div className="mt-[14px]">
                <AudioPreview sources={[{ id: 'source', label: 'Original', audio }]} waveHeight={44} />
              </div>
            ) : null}
          </Card>
        ) : null}

        {result && mode === 'detail' ? (
          <>
            <Card tone="slate" size="compact">
              <Eyebrow>Tonart</Eyebrow>
              <div className="mt-[14px] grid gap-[14px] rounded-card bg-raised p-[18px] sm:grid-cols-4">
                <Stat label="Tempo" value={`${Math.round(bpm)} BPM`} emphasis />
                <Stat label="Tonart" value={result.key.label} emphasis />
                <Stat label="Camelot" value={result.key.camelot} emphasis note="für harmonisches Mixen" />
                <Stat
                  label="Sicherheit"
                  value={`${Math.round(result.key.confidence * 100)} %`}
                  note={confident ? 'eindeutig' : 'knappe Entscheidung'}
                />
              </div>

              {audio ? (
                <div className="mt-[14px] rounded-card bg-raised p-[18px]">
                  <AudioPreview sources={[{ id: 'source', label: 'Original', audio }]} waveHeight={44} />
                </div>
              ) : null}

              {!confident ? (
                <p className="mt-[11px] text-[12px] leading-[1.5] text-muted">
                  Dicht dahinter liegt {result.key.alternative.label} ({result.key.alternative.camelot}).
                  Parallele Dur- und Moll-Tonarten enthalten dieselben zwölf Töne — welche von beiden
                  gemeint ist, entscheidet sich am Grundton, nicht am Tonvorrat. Im Zweifel beide
                  gegen den eigenen Track hören.
                </p>
              ) : null}

              <div className="mt-[14px] flex flex-wrap items-center gap-[7px]">
                <span className="text-[12px] text-muted">Passt zu</span>
                {neighbours(result.key.camelot).map((code) => (
                  <Badge key={code}>{code}</Badge>
                ))}
              </div>

              <div className="mt-[18px] rounded-card bg-raised p-[18px]">
                <p className="mb-[11px] text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                  Tonklassen
                </p>
                <ChromaChart chroma={result.chroma} />
              </div>
            </Card>

            {result.chords.length > 0 ? (
              <Card tone="mint" size="compact">
                <Eyebrow>Akkorde · {result.chords.filter((span) => span.root !== null).length}</Eyebrow>
                <div className="mt-[14px] flex flex-wrap gap-[4px]">
                  {result.chords.map((span, index) => (
                    <span
                      key={`${span.label}-${span.startSeconds}-${index}`}
                      title={`${formatTimecode(span.startSeconds)} – ${formatTimecode(span.endSeconds)}`}
                      className={`numeric rounded-nav px-[11px] py-[6px] text-[13px] ${
                        span.root === null ? 'bg-raised text-muted' : 'bg-raised text-ink'
                      }`}
                    >
                      {span.label}
                    </span>
                  ))}
                </div>
              </Card>
            ) : null}

            {result.notes.length > 0 ? (
              <Card tone="slate" size="compact">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Eyebrow>Melodie · {result.notes.length} Noten</Eyebrow>
                  <span className="numeric text-[12px] text-muted">
                    {midiName(Math.min(...result.notes.map((n) => n.midi)))} –{' '}
                    {midiName(Math.max(...result.notes.map((n) => n.midi)))} · {bpm} BPM
                  </span>
                </div>
                <div className="mt-[14px]">
                  <NoteRoll notes={result.notes} />
                </div>
                <div className="mt-[14px]">
                  <Button size="sm" onClick={exportMidi}>
                    Als MIDI speichern
                    <ArrowRight />
                  </Button>
                </div>
              </Card>
            ) : transcribe ? (
              <Notice title="Keine Melodie gefunden">
                Der Tonhöhenverfolger arbeitet einstimmig. Auf einem vollen Mix findet er selten
                etwas Brauchbares — trennen Sie vorher im Reiter „Spuren“ den Gesang heraus, oder
                senken Sie unten die geforderte Klarheit.
              </Notice>
            ) : null}
          </>
        ) : null}
      </div>

      <aside className="flex flex-col gap-[18px]">
        {mode === 'detail' ? (
        <Card tone="mint" size="compact">
          <Eyebrow>Einstellungen</Eyebrow>
          <div className="mt-[11px] flex flex-col gap-[14px]">
            <Field label="Akkordfenster" hint="Kürzer folgt schnellen Wechseln, länger ist ruhiger.">
              <Select value={chordWindow} onChange={(event) => setChordWindow(Number(event.target.value))}>
                <option value={0.25}>0,25 s</option>
                <option value={0.5}>0,5 s</option>
                <option value={1}>1 s</option>
                <option value={2}>2 s</option>
              </Select>
            </Field>

            <Toggle
              label="Melodie verfolgen"
              hint="Der aufwendige Teil. Ohne ihn gibt es nur Tonart und Akkorde."
              checked={transcribe}
              onChange={setTranscribe}
            />

            {transcribe ? (
              <>
                <Slider
                  label="Geforderte Klarheit"
                  display={clarity.toFixed(2)}
                  min={0.3}
                  max={0.9}
                  step={0.05}
                  value={clarity}
                  onChange={(event) => setClarity(Number(event.target.value))}
                />
                <Slider
                  label="Kürzeste Note"
                  display={`${Math.round(minimumNote * 1000)} ms`}
                  min={0.03}
                  max={0.3}
                  step={0.01}
                  value={minimumNote}
                  onChange={(event) => setMinimumNote(Number(event.target.value))}
                />
                <Field label="Auf Raster ziehen" hint="Verschiebt Notenanfänge auf das Tempo-Raster.">
                  <Select value={quantize} onChange={(event) => setQuantize(Number(event.target.value))}>
                    <option value={0}>Aus</option>
                    <option value={0.25}>1/16</option>
                    <option value={0.5}>1/8</option>
                    <option value={1}>1/4</option>
                  </Select>
                </Field>
              </>
            ) : null}
          </div>
        </Card>
        ) : null}

        {result && mode === 'detail' ? (
          <Card tone="cream" size="compact" className="ring-1 ring-inset ring-line">
            <Eyebrow>Nächstbeste</Eyebrow>
            <ul className="mt-[11px] flex flex-col gap-[7px] text-[13px]">
              {result.key.scores.map((entry) => (
                <li key={entry.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-prose/85">
                    {entry.label} <span className="text-muted">{entry.camelot}</span>
                  </span>
                  <span className="numeric shrink-0 text-muted">{entry.score.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card tone="cream" size="compact" className="ring-1 ring-inset ring-line">
          <AssetList />
        </Card>
      </aside>
    </div>
  )
}
