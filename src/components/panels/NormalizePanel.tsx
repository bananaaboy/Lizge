/**
 * Loudness measurement and normalisation.
 *
 * The measurement is a real BS.1770-4 implementation — K-weighting, 400 ms
 * gated blocks, 4× oversampled true peak — not a peak scan wearing a LUFS
 * label, so the numbers match what a broadcast meter would report.
 */

import { useRef, useState } from 'react'

import { saveBytes } from '../../lib/download'
import { formatDb, formatDuration, formatLufs } from '../../lib/format'
import { LOUDNESS_PRESETS, type GainPlan, type LoudnessReport } from '../../lib/loudness'
import { encodeWav } from '../../lib/wav'
import { measureLoudnessInWorker, normalizeInWorker } from '../../lib/workerClient'
import { withExtension } from '../../lib/format'
import { useDecodedAudio } from '../../hooks/useDecodedAudio'
import { useActiveAsset, useSession } from '../../state/store'
import { AssetList } from '../AssetList'
import { FileDrop } from '../FileDrop'
import { Waveform } from '../Waveform'
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

/** Horizontal LUFS gauge: measured value against the target. */
function LoudnessGauge({ report, target }: { report: LoudnessReport; target: number }) {
  const low = -40
  const high = 0
  const position = (value: number) => `${Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100))}%`

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="relative h-[28px] rounded-pill bg-forest-ink/10">
        <div
          className="absolute inset-y-0 left-0 rounded-pill bg-forest-ink/70"
          style={{ width: position(report.integratedLufs) }}
        />
        <div
          className="absolute inset-y-[-6px] w-[2px] rounded-pill bg-forest-ink"
          style={{ left: position(target) }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[11px] text-charcoal/55">
        <span className="numeric">−40</span>
        <span className="numeric">Ziel {target} LUFS</span>
        <span className="numeric">0</span>
      </div>
    </div>
  )
}

function ReportGrid({ report }: { report: LoudnessReport }) {
  return (
    <div className="grid gap-[21px] rounded-card bg-cream-paper p-[28px] sm:grid-cols-3">
      <Stat label="Integriert" value={formatLufs(report.integratedLufs)} emphasis />
      <Stat label="Loudness Range" value={`${report.loudnessRangeLu.toFixed(1)} LU`} />
      <Stat label="True Peak" value={`${report.truePeakDbtp.toFixed(2)} dBTP`} />
      <Stat label="Momentan max." value={formatLufs(report.momentaryMaxLufs)} />
      <Stat label="Kurzzeit max." value={formatLufs(report.shortTermMaxLufs)} />
      <Stat
        label="Sample Peak"
        value={`${report.samplePeakDbfs.toFixed(2)} dBFS`}
        note={formatDuration(report.durationSeconds)}
      />
    </div>
  )
}

export function NormalizePanel() {
  const asset = useActiveAsset()
  const settings = useSession((state) => state.normalization)
  const setNormalization = useSession((state) => state.setNormalization)
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)
  const { audio, decode, status: decodeStatus } = useDecodedAudio(asset)

  const [busy, setBusy] = useState<'idle' | 'measuring' | 'normalizing'>('idle')
  const [progress, setProgress] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [before, setBefore] = useState<LoudnessReport | null>(null)
  const [after, setAfter] = useState<LoudnessReport | null>(null)
  const [plan, setPlan] = useState<GainPlan | null>(null)
  const [result, setResult] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = () => {
    setAfter(null)
    setPlan(null)
    setResult(null)
    setError(null)
  }

  const measure = async () => {
    if (!asset) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy('measuring')
    reset()
    try {
      const decoded = audio ?? (await decode())
      if (!decoded) return
      const report = await measureLoudnessInWorker(
        decoded,
        (fraction, hint) => {
          setProgress(fraction)
          setNote(hint ?? null)
        },
        controller.signal,
      )
      setBefore(report)
      log('normalisierung', `Gemessen: ${formatLufs(report.integratedLufs)}, ${report.truePeakDbtp.toFixed(2)} dBTP`)
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(message)
        log('normalisierung', message, 'error')
      }
    } finally {
      setBusy('idle')
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  const normalize = async () => {
    if (!asset) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy('normalizing')
    reset()
    try {
      const decoded = audio ?? (await decode())
      if (!decoded) return
      const outcome = await normalizeInWorker(
        decoded,
        settings,
        (fraction, hint) => {
          setProgress(fraction)
          setNote(hint ?? null)
        },
        controller.signal,
      )
      setBefore(outcome.before)
      setAfter(outcome.after)
      setPlan(outcome.plan)
      // 24-bit keeps the gain move clean without doubling the file size.
      setResult(encodeWav(outcome.audio, 24))
      log(
        'normalisierung',
        `${formatDb(outcome.plan.appliedDb)} angewandt → ${formatLufs(outcome.after.integratedLufs)}`,
      )
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(message)
        log('normalisierung', message, 'error')
      }
    } finally {
      setBusy('idle')
      setProgress(null)
      setNote(null)
      abortRef.current = null
    }
  }

  const running = busy !== 'idle'

  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-[21px]">
        <Card tone="keylime">
          <Eyebrow>Lautheit</Eyebrow>
          <h2 className="display-md mt-[11px] mb-[14px]">Nach EBU R128 normalisieren</h2>
          <p className="max-w-[58ch] text-body leading-[1.6] text-charcoal/80">
            Gemessen wird die integrierte Lautheit mit K-Bewertung und zweistufigem Gate, dazu die
            Loudness Range und der True Peak bei vierfacher Überabtastung. Die Rechnung läuft in einem
            Web Worker, damit die Oberfläche bedienbar bleibt.
          </p>

          {!asset ? (
            <div className="mt-[28px]">
              <FileDrop />
            </div>
          ) : (
            <>
              <div className="mt-[28px] rounded-card bg-cream-paper p-[21px]">
                <Waveform audio={audio} height={84} />
              </div>

              <div className="mt-[21px] grid gap-[18px] sm:grid-cols-2">
                <Field label="Verfahren">
                  <Select
                    value={settings.mode}
                    onChange={(event) =>
                      setNormalization({ mode: event.target.value as 'lufs' | 'peak' })
                    }
                  >
                    <option value="lufs">Lautheit (LUFS)</option>
                    <option value="peak">Spitzenpegel (dBFS)</option>
                  </Select>
                </Field>

                <Field label="Vorgabe">
                  <Select
                    value={
                      LOUDNESS_PRESETS.find(
                        (preset) =>
                          preset.lufs === settings.targetLufs &&
                          preset.ceiling === settings.truePeakCeilingDbtp,
                      )?.id ?? 'custom'
                    }
                    onChange={(event) => {
                      const preset = LOUDNESS_PRESETS.find((p) => p.id === event.target.value)
                      if (preset) {
                        setNormalization({
                          targetLufs: preset.lufs,
                          truePeakCeilingDbtp: preset.ceiling,
                        })
                      }
                    }}
                  >
                    <option value="custom">Eigene Werte</option>
                    {LOUDNESS_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label} · {preset.lufs} LUFS
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="sm:col-span-2 grid gap-[21px] sm:grid-cols-2">
                  {settings.mode === 'lufs' ? (
                    <Slider
                      label="Zielwert"
                      display={`${settings.targetLufs} LUFS`}
                      min={-31}
                      max={-6}
                      step={0.5}
                      value={settings.targetLufs}
                      onChange={(event) => setNormalization({ targetLufs: Number(event.target.value) })}
                    />
                  ) : (
                    <Slider
                      label="Zielwert"
                      display={`${settings.targetPeakDbfs} dBFS`}
                      min={-12}
                      max={0}
                      step={0.1}
                      value={settings.targetPeakDbfs}
                      onChange={(event) => setNormalization({ targetPeakDbfs: Number(event.target.value) })}
                    />
                  )}
                  <Slider
                    label="True-Peak-Grenze"
                    display={`${settings.truePeakCeilingDbtp} dBTP`}
                    min={-6}
                    max={0}
                    step={0.1}
                    value={settings.truePeakCeilingDbtp}
                    onChange={(event) =>
                      setNormalization({ truePeakCeilingDbtp: Number(event.target.value) })
                    }
                  />
                </div>

                <Toggle
                  label="Übersteuerung verhindern"
                  hint="Nimmt die Verstärkung zurück, statt die Grenze zu überschreiten."
                  checked={settings.preventClipping}
                  onChange={(value) => setNormalization({ preventClipping: value })}
                />
                <Toggle
                  label="Limiter statt Rücknahme"
                  hint="Hält den Zielwert und begrenzt nur die Spitzen. Lauter, aber ein Eingriff."
                  checked={settings.useLimiter}
                  onChange={(value) => setNormalization({ useLimiter: value })}
                />
              </div>

              <div className="mt-[28px] flex flex-wrap items-center gap-[11px]">
                <Button onClick={normalize} disabled={running}>
                  {busy === 'normalizing' ? 'Läuft…' : 'Messen und normalisieren'}
                  {!running ? <ArrowRight /> : null}
                </Button>
                <Button variant="quiet" onClick={measure} disabled={running}>
                  {busy === 'measuring' ? 'Wird gemessen…' : 'Nur messen'}
                </Button>
                {running ? (
                  <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                    Abbrechen
                  </Button>
                ) : null}
              </div>

              {running || decodeStatus === 'decoding' ? (
                <div className="mt-[18px]">
                  <Progress value={progress} label={note ?? 'Wird dekodiert'} />
                </div>
              ) : null}
            </>
          )}
        </Card>

        {error ? (
          <Notice tone="error" title="Fehlgeschlagen">
            {error}
          </Notice>
        ) : null}

        {before ? (
          <Card tone="slate">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>{after ? 'Vorher' : 'Messung'}</Eyebrow>
              {after ? null : <Badge>{settings.targetLufs} LUFS angestrebt</Badge>}
            </div>
            <div className="mt-[18px]">
              <ReportGrid report={before} />
            </div>
            <div className="mt-[21px] rounded-card bg-cream-paper p-[28px]">
              <LoudnessGauge report={before} target={settings.targetLufs} />
            </div>
          </Card>
        ) : null}

        {after && plan ? (
          <Card tone="sage">
            <Eyebrow>Nachher</Eyebrow>
            <div className="mt-[18px]">
              <ReportGrid report={after} />
            </div>

            <div className="mt-[21px] flex flex-wrap gap-[7px]">
              <Badge tone="forest">{formatDb(plan.appliedDb)} angewandt</Badge>
              {plan.reducedByCeiling ? (
                <Badge>
                  Von {formatDb(plan.requestedDb)} zurückgenommen, um die True-Peak-Grenze zu halten
                </Badge>
              ) : null}
              {plan.limiterEngaged ? <Badge>Limiter hat eingegriffen</Badge> : null}
            </div>

            {result ? (
              <div className="mt-[21px] flex flex-wrap gap-[11px]">
                <Button
                  onClick={() => saveBytes(result, withExtension(asset?.name ?? 'audio', 'wav'), 'audio/wav')}
                >
                  Als WAV speichern
                  <ArrowRight />
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    const name = `normalisiert_${withExtension(asset?.name ?? 'audio', 'wav')}`
                    addAsset({
                      name,
                      bytes: result,
                      mime: 'audio/wav',
                      sizeBytes: result.byteLength,
                      kind: 'audio',
                      audio: null,
                      durationSeconds: null,
                      origin: 'derived',
                    })
                    log('normalisierung', `${name} in die Sitzung übernommen`)
                  }}
                >
                  In die Sitzung übernehmen
                </Button>
              </div>
            ) : null}
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
        <Card tone="cream" className="ring-1 ring-inset ring-border-mist">
          <Eyebrow>Zielwerte</Eyebrow>
          <dl className="mt-[14px] flex flex-col gap-[11px] text-[13px]">
            {LOUDNESS_PRESETS.map((preset) => (
              <div key={preset.id} className="flex items-baseline justify-between gap-3">
                <dt className="text-charcoal/75">{preset.label}</dt>
                <dd className="numeric shrink-0 text-forest-ink">{preset.lufs} LUFS</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
    </div>
  )
}
