/**
 * In-browser sampler.
 *
 * Wavesurfer draws and scrubs; regions are the slices. Playback goes through the
 * Web Audio API directly rather than through Wavesurfer, so a pad can be
 * retriggered while the previous one is still ringing — which is the whole point
 * of a pad grid.
 *
 * Export work (pitch, stretch) is handed to a worker; the phase vocoder is far
 * too slow to run on the thread that has to keep the pads responsive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'

import { applyFades, getAudioContext, normalizePeak, resumeAudioContext, reverseAudio, sliceAudio, toAudioBuffer } from '../../lib/audio'
import { saveBytes } from '../../lib/download'
import { clamp, dbToGain, formatTimecode, withExtension } from '../../lib/format'
import { detectOnsets, divideEvenly } from '../../lib/onsets'
import { readPalette, withAlpha, type ResolvedTheme } from '../../lib/theme'
import { encodeWav, type AudioData } from '../../lib/wav'
import { renderSliceInWorker } from '../../lib/workerClient'
import { createZip } from '../../lib/zip'
import { useDecodedAudio } from '../../hooks/useDecodedAudio'
import { useActiveAsset, useSession } from '../../state/store'
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
  Toggle,
} from '../ui/primitives'

interface Slice {
  id: string
  start: number
  end: number
}

const PAD_KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'y', 'x', 'c', 'v']

export function SamplerPanel({ theme }: { theme: ResolvedTheme }) {
  const asset = useActiveAsset()
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)
  const { audio, decode, status } = useDecodedAudio(asset)

  const containerRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const voicesRef = useRef<AudioBufferSourceNode[]>([])

  const [slices, setSlices] = useState<Slice[]>([])
  const [activeSlice, setActiveSlice] = useState<string | null>(null)
  const [playingPad, setPlayingPad] = useState<number | null>(null)

  const [semitones, setSemitones] = useState(0)
  const [preserveDuration, setPreserveDuration] = useState(true)
  const [stretchFactor, setStretchFactor] = useState(1)
  const [gainDb, setGainDb] = useState(0)
  const [fadeMs, setFadeMs] = useState(5)
  const [reversed, setReversed] = useState(false)
  const [normalize, setNormalize] = useState(false)
  const [loop, setLoop] = useState(false)

  const [sliceCount, setSliceCount] = useState(8)
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    if (asset && !audio && status === 'idle') void decode()
  }, [asset, audio, status, decode])

  /* --- wavesurfer lifecycle ---------------------------------------------- */
  useEffect(() => {
    const container = containerRef.current
    if (!container || !audio) return

    // Wavesurfer takes colour strings, so the palette is read out of the
    // cascade; the effect re-runs on a theme switch and rebuilds the instance.
    const palette = readPalette()
    const regions = RegionsPlugin.create()
    const wave = WaveSurfer.create({
      container,
      height: 132,
      waveColor: withAlpha(palette.ink, 0.35),
      progressColor: palette.ink,
      cursorColor: palette.ink,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins: [regions],
    })

    waveRef.current = wave
    regionsRef.current = regions

    const context = getAudioContext()
    const buffer = toAudioBuffer(audio, context)
    bufferRef.current = buffer
    // Feed the decoded buffer straight in — re-decoding the file for display
    // would double the work for no benefit.
    wave.loadBlob(new Blob([encodeWav(audio, 16).slice().buffer as ArrayBuffer], { type: 'audio/wav' }))

    regions.enableDragSelection({ color: withAlpha(palette.ink, 0.12) })

    const syncRegions = () => {
      setSlices(
        regions
          .getRegions()
          .map((region) => ({ id: region.id, start: region.start, end: region.end }))
          .sort((a, b) => a.start - b.start),
      )
    }

    regions.on('region-created', syncRegions)
    regions.on('region-updated', syncRegions)
    regions.on('region-removed', syncRegions)
    regions.on('region-clicked', (region: Region, event: MouseEvent) => {
      event.stopPropagation()
      setActiveSlice(region.id)
      playRange(region.start, region.end)
    })

    return () => {
      wave.destroy()
      waveRef.current = null
      regionsRef.current = null
      bufferRef.current = null
      setSlices([])
      setActiveSlice(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio])

  /* --- theme ------------------------------------------------------------- */
  useEffect(() => {
    const wave = waveRef.current
    if (!wave) return
    // Recolour in place. Rebuilding the instance would discard every region the
    // user has drawn, which is far too high a price for flipping to dark mode.
    const frame = requestAnimationFrame(() => {
      const palette = readPalette()
      wave.setOptions({
        waveColor: withAlpha(palette.ink, 0.35),
        progressColor: palette.ink,
        cursorColor: palette.ink,
      })
      regionsRef.current?.getRegions().forEach((region) => {
        region.setOptions({ color: withAlpha(palette.ink, 0.1), start: region.start, end: region.end })
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [theme])

  /* --- playback ----------------------------------------------------------- */
  const stopVoices = useCallback(() => {
    voicesRef.current.forEach((voice) => {
      try {
        voice.stop()
      } catch {
        /* already finished */
      }
    })
    voicesRef.current = []
    setPlayingPad(null)
  }, [])

  const playRange = useCallback(
    (start: number, end: number, padIndex?: number) => {
      const buffer = bufferRef.current
      if (!buffer) return
      void resumeAudioContext()

      const context = getAudioContext()
      const source = context.createBufferSource()
      source.buffer = buffer
      // Varispeed is the right default for a pad: it is what hardware samplers
      // do, and it is instant. The phase vocoder is reserved for export.
      source.playbackRate.value = 2 ** (semitones / 12)
      source.loop = loop
      if (loop) {
        source.loopStart = start
        source.loopEnd = end
      }

      const gain = context.createGain()
      gain.gain.value = dbToGain(gainDb)
      source.connect(gain).connect(context.destination)

      const duration = (end - start) / source.playbackRate.value
      source.start(0, start, loop ? undefined : end - start)
      if (!loop) source.stop(context.currentTime + duration + 0.05)

      voicesRef.current.push(source)
      source.onended = () => {
        voicesRef.current = voicesRef.current.filter((voice) => voice !== source)
        if (padIndex !== undefined) setPlayingPad((current) => (current === padIndex ? null : current))
      }
      if (padIndex !== undefined) setPlayingPad(padIndex)
    },
    [gainDb, loop, semitones],
  )

  /* --- keyboard pads ------------------------------------------------------ */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return

      if (event.key === ' ') {
        event.preventDefault()
        stopVoices()
        return
      }
      const index = PAD_KEYS.indexOf(event.key.toLowerCase())
      if (index >= 0 && slices[index]) {
        event.preventDefault()
        setActiveSlice(slices[index].id)
        playRange(slices[index].start, slices[index].end, index)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playRange, slices, stopVoices])

  useEffect(() => stopVoices, [stopVoices])

  /* --- slicing ------------------------------------------------------------ */
  const applySlicePoints = (points: number[], duration: number) => {
    const regions = regionsRef.current
    if (!regions) return
    regions.clearRegions()
    points.forEach((start, index) => {
      const end = index + 1 < points.length ? points[index + 1] : duration
      if (end - start < 0.01) return
      regions.addRegion({
        start,
        end,
        color: withAlpha(readPalette().ink, 0.1),
        drag: true,
        resize: true,
      })
    })
  }

  const sliceByOnsets = () => {
    if (!audio) return
    const duration = (audio.channels[0]?.length ?? 0) / audio.sampleRate
    const points = detectOnsets(audio)
    applySlicePoints(points, duration)
    log('sampler', `${points.length} Transienten gefunden`)
  }

  const sliceEvenly = () => {
    if (!audio) return
    const duration = (audio.channels[0]?.length ?? 0) / audio.sampleRate
    applySlicePoints(divideEvenly(duration, sliceCount), duration)
    log('sampler', `In ${sliceCount} gleiche Teile zerlegt`)
  }

  /* --- export ------------------------------------------------------------- */
  const buildSlice = useCallback(
    async (slice: Slice): Promise<AudioData | null> => {
      if (!audio) return null
      let piece = sliceAudio(audio, slice.start, slice.end)
      if (reversed) piece = reverseAudio(piece)

      if (Math.abs(semitones) > 1e-6 || Math.abs(stretchFactor - 1) > 1e-6) {
        piece = await renderSliceInWorker(
          piece,
          { semitones, stretchFactor, preserveDuration },
          (fraction) => setProgress(fraction),
        )
      }

      const fade = fadeMs / 1000
      piece = applyFades(piece, fade, fade)
      if (normalize) piece = normalizePeak(piece, -0.3)

      const gain = dbToGain(gainDb)
      if (Math.abs(gain - 1) > 1e-6) {
        piece = {
          channels: piece.channels.map((channel) => {
            const out = new Float32Array(channel.length)
            for (let i = 0; i < channel.length; i += 1) out[i] = clamp(channel[i] * gain, -1, 1)
            return out
          }),
          sampleRate: piece.sampleRate,
        }
      }
      return piece
    },
    [audio, fadeMs, gainDb, normalize, preserveDuration, reversed, semitones, stretchFactor],
  )

  const exportSlice = async (slice: Slice, index: number) => {
    setRendering(true)
    try {
      const piece = await buildSlice(slice)
      if (!piece) return
      const name = withExtension(`${asset?.name ?? 'sample'}_slice${index + 1}`, 'wav')
      saveBytes(encodeWav(piece, 24), name, 'audio/wav')
      log('sampler', `${name} exportiert`)
    } finally {
      setRendering(false)
      setProgress(null)
    }
  }

  /** Renders every slice once, then either keeps them or zips them. */
  const renderAll = async (destination: 'session' | 'zip') => {
    setRendering(true)
    const base = asset?.name.replace(/\.[^.]+$/, '') ?? 'sample'
    const files: { name: string; data: Uint8Array }[] = []
    try {
      for (const [index, slice] of slices.entries()) {
        const piece = await buildSlice(slice)
        if (!piece) continue
        const bytes = encodeWav(piece, 24)
        const name = `${base}_slice${String(index + 1).padStart(2, '0')}.wav`
        if (destination === 'zip') {
          files.push({ name: `${base}/${name}`, data: bytes })
        } else {
          addAsset({
            name,
            bytes,
            mime: 'audio/wav',
            sizeBytes: bytes.byteLength,
            kind: 'audio',
            audio: piece,
            durationSeconds: (piece.channels[0]?.length ?? 0) / piece.sampleRate,
            origin: 'derived',
          })
        }
      }
      if (destination === 'zip' && files.length > 0) {
        saveBytes(createZip(files), `${base}-slices.zip`, 'application/zip')
        log('sampler', `${files.length} Slices als ZIP gespeichert`)
      } else if (destination === 'session') {
        log('sampler', `${slices.length} Slices in die Sitzung übernommen`)
      }
    } finally {
      setRendering(false)
      setProgress(null)
    }
  }

  const selected = useMemo(() => slices.find((slice) => slice.id === activeSlice) ?? null, [activeSlice, slices])

  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[21px]">
        <Card tone="keylime">
          <Eyebrow>Sampler</Eyebrow>
          <h2 className="display-md mt-[11px] mb-[14px]">Schneiden, loopen, transponieren</h2>
          <p className="max-w-[60ch] text-body leading-[1.6] text-prose/85">
            Ziehen Sie über die Wellenform, um einen Bereich zu setzen, oder lassen Sie Lizge an den
            Transienten schneiden. Die Pads spielen über die Web Audio API — Tonhöhe live per
            Abspielrate, beim Export wahlweise längentreu über einen Phasenvocoder.
          </p>

          {!asset ? (
            <div className="mt-[28px]">
              <FileDrop />
            </div>
          ) : (
            <>
              <div className="lizge-wave mt-[28px] rounded-card bg-raised p-[21px]">
                <div ref={containerRef} />
                {!audio ? (
                  <p className="py-[28px] text-center text-[13px] text-muted">
                    {status === 'decoding' ? 'Wird dekodiert…' : 'Warten auf Audio'}
                  </p>
                ) : null}
              </div>

              <div className="mt-[18px] flex flex-wrap items-center gap-[11px]">
                <Button size="sm" onClick={sliceByOnsets} disabled={!audio}>
                  An Transienten schneiden
                </Button>
                <Button size="sm" variant="quiet" onClick={sliceEvenly} disabled={!audio}>
                  Gleichmäßig teilen
                </Button>
                <Select
                  value={sliceCount}
                  onChange={(event) => setSliceCount(Number(event.target.value))}
                  className="w-auto"
                  aria-label="Anzahl der Teile"
                >
                  {[2, 4, 8, 12, 16].map((count) => (
                    <option key={count} value={count}>
                      {count} Teile
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => regionsRef.current?.clearRegions()}>
                  Leeren
                </Button>
                <Button size="sm" variant="ghost" onClick={stopVoices}>
                  Stopp (Leertaste)
                </Button>
              </div>
            </>
          )}
        </Card>

        {slices.length > 0 ? (
          <Card tone="slate">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Pads</Eyebrow>
              <span className="text-[12px] text-muted">Tasten 1–4, Q–R, A–F, Y–V</span>
            </div>

            <div className="mt-[18px] grid grid-cols-2 gap-[11px] sm:grid-cols-4">
              {slices.slice(0, 16).map((slice, index) => {
                const isPlaying = playingPad === index
                const isSelected = slice.id === activeSlice
                return (
                  <button
                    key={slice.id}
                    type="button"
                    onClick={() => {
                      setActiveSlice(slice.id)
                      playRange(slice.start, slice.end, index)
                    }}
                    className={`flex aspect-4/3 flex-col items-start justify-between rounded-card p-[14px] text-left transition-colors ${
                      isPlaying
                        ? 'bg-ink text-on-ink'
                        : isSelected
                          ? 'bg-panel-mid text-ink'
                          : 'bg-raised text-ink hover:bg-panel-soft'
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">
                      {PAD_KEYS[index] ?? '—'}
                    </span>
                    <span className="numeric text-[12px] opacity-80">
                      {formatTimecode(slice.start)}
                      <br />
                      {(slice.end - slice.start).toFixed(2)} s
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-[21px] flex flex-wrap gap-[11px]">
              <Button onClick={() => renderAll('session')} disabled={rendering} variant="quiet">
                {rendering ? 'Wird gerendert…' : `Alle ${slices.length} übernehmen`}
              </Button>
              <Button onClick={() => renderAll('zip')} disabled={rendering} variant="quiet">
                Alle als ZIP
              </Button>
              {selected ? (
                <Button
                  onClick={() => exportSlice(selected, slices.indexOf(selected))}
                  disabled={rendering}
                >
                  Auswahl als WAV
                  <ArrowRight />
                </Button>
              ) : null}
            </div>

            {rendering ? (
              <div className="mt-[18px]">
                <Progress value={progress} label="Phasenvocoder" />
              </div>
            ) : null}
          </Card>
        ) : null}

        {audio && slices.length === 0 ? (
          <Notice title="Noch keine Slices">
            Ziehen Sie mit der Maus über die Wellenform, um einen Bereich aufzuziehen, oder nutzen Sie
            die Schaltflächen oben. Ein Klick auf einen Bereich spielt ihn ab.
          </Notice>
        ) : null}
      </div>

      <aside className="flex flex-col gap-[21px]">
        <Card tone="mint">
          <Eyebrow>Klang</Eyebrow>
          <div className="mt-[18px] flex flex-col gap-[21px]">
            <Slider
              label="Tonhöhe"
              display={`${semitones > 0 ? '+' : ''}${semitones} HT`}
              min={-24}
              max={24}
              step={1}
              value={semitones}
              onChange={(event) => setSemitones(Number(event.target.value))}
            />
            <Slider
              label="Länge"
              display={`${stretchFactor.toFixed(2)}×`}
              min={0.25}
              max={4}
              step={0.05}
              value={stretchFactor}
              onChange={(event) => setStretchFactor(Number(event.target.value))}
            />
            <Slider
              label="Pegel"
              display={`${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)} dB`}
              min={-24}
              max={12}
              step={0.5}
              value={gainDb}
              onChange={(event) => setGainDb(Number(event.target.value))}
            />
            <Slider
              label="Blende"
              display={`${fadeMs} ms`}
              min={0}
              max={200}
              step={1}
              value={fadeMs}
              onChange={(event) => setFadeMs(Number(event.target.value))}
            />

            <Toggle
              label="Länge beim Transponieren halten"
              hint="Phasenvocoder beim Export. Ohne Haken klingt es wie ein Bandgerät."
              checked={preserveDuration}
              onChange={setPreserveDuration}
            />
            <Toggle label="Schleife" checked={loop} onChange={setLoop} />
            <Toggle label="Rückwärts" checked={reversed} onChange={setReversed} />
            <Toggle
              label="Auf −0,3 dBFS normalisieren"
              checked={normalize}
              onChange={setNormalize}
            />
          </div>
        </Card>

        {selected ? (
          <Card tone="cream" className="ring-1 ring-inset ring-line">
            <Eyebrow>Auswahl</Eyebrow>
            <div className="mt-[14px] flex flex-wrap gap-[7px]">
              <Badge>{formatTimecode(selected.start)}</Badge>
              <Badge>bis {formatTimecode(selected.end)}</Badge>
              <Badge tone="forest">{(selected.end - selected.start).toFixed(3)} s</Badge>
            </div>
            <div className="mt-[18px]">
              <Field label="Feinabstimmung">
                <div className="grid grid-cols-2 gap-[11px]">
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      const region = regionsRef.current
                        ?.getRegions()
                        .find((candidate) => candidate.id === selected.id)
                      region?.setOptions({ start: Math.max(0, selected.start - 0.01), end: selected.end })
                    }}
                  >
                    Anfang −10 ms
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      const region = regionsRef.current
                        ?.getRegions()
                        .find((candidate) => candidate.id === selected.id)
                      region?.setOptions({ start: selected.start + 0.01, end: selected.end })
                    }}
                  >
                    Anfang +10 ms
                  </Button>
                </div>
              </Field>
            </div>
          </Card>
        ) : null}

        <Card tone="cream" className="ring-1 ring-inset ring-line">
          <AssetList />
          <div className="mt-[18px]">
            <FileDrop compact />
          </div>
        </Card>
      </aside>
    </div>
  )
}
