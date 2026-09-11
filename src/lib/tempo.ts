/**
 * Tempo estimation and beat gridding.
 *
 * A chopper lives or dies on cutting in time. Transient detection finds where
 * hits are; this finds how far apart they *should* be, so slices can be forced
 * onto a grid of bars and beats rather than onto whatever the onset detector
 * happened to notice.
 *
 * The method is autocorrelation of the onset strength envelope: compute how
 * much the spectrum rises frame to frame, then ask which lag makes that signal
 * line up with itself best. A drum loop has a very strong peak at its beat
 * period, which is why this works far better on rhythmic material than on a
 * string pad — and the returned confidence says which one you gave it.
 */

import { magnitudeOf, stft } from './fft'
import { mixToMono, type AudioData } from './wav'

export interface TempoEstimate {
  bpm: number
  /** 0–1. Below roughly 0.3 the estimate is a guess, and the UI should say so. */
  confidence: number
  /** Seconds from the file start to the first beat of the grid. */
  offsetSeconds: number
}

const FFT_SIZE = 1024
const HOP_SIZE = 256
/** The range of tempos worth considering, in BPM. */
const MIN_BPM = 60
const MAX_BPM = 200

/** Spectral flux: the summed positive change across the spectrum per frame. */
function onsetEnvelope(audio: AudioData): {
  envelope: Float32Array
  frameRate: number
  /** Mean spectral change relative to spectral level — how transient the material is. */
  activity: number
} {
  const mono = mixToMono(audio).channels[0]
  const spec = stft(mono, FFT_SIZE, HOP_SIZE)
  const magnitude = magnitudeOf(spec)
  const { frames, bins } = spec

  const envelope = new Float32Array(frames)
  let fluxTotal = 0
  let levelTotal = 0
  for (let f = 1; f < frames; f += 1) {
    let sum = 0
    let level = 0
    for (let b = 0; b < bins; b += 1) {
      const now = magnitude[f * bins + b]
      const delta = now - magnitude[(f - 1) * bins + b]
      if (delta > 0) sum += delta
      level += now
    }
    envelope[f] = sum
    fluxTotal += sum
    levelTotal += level
  }
  // A sustained tone barely changes frame to frame; a drum loop changes a lot.
  // This separates "no rhythm here" from "rhythm I could not pin down".
  const activity = levelTotal > 0 ? fluxTotal / levelTotal : 0

  // Subtract a local mean so a loud section does not dominate the correlation.
  const smoothed = new Float32Array(frames)
  const window = 16
  for (let f = 0; f < frames; f += 1) {
    let mean = 0
    const from = Math.max(0, f - window)
    const to = Math.min(frames, f + window)
    for (let i = from; i < to; i += 1) mean += envelope[i]
    mean /= to - from
    smoothed[f] = Math.max(0, envelope[f] - mean)
  }

  return { envelope: smoothed, frameRate: audio.sampleRate / HOP_SIZE, activity }
}

/** Estimates tempo and where the grid starts. */
export function estimateTempo(audio: AudioData): TempoEstimate {
  const { envelope, frameRate, activity } = onsetEnvelope(audio)
  const frames = envelope.length
  if (frames < 64) return { bpm: 120, confidence: 0, offsetSeconds: 0 }

  const minLag = Math.floor((60 / MAX_BPM) * frameRate)
  const maxLag = Math.min(frames - 1, Math.ceil((60 / MIN_BPM) * frameRate))
  if (maxLag <= minLag) return { bpm: 120, confidence: 0, offsetSeconds: 0 }

  let energy = 0
  for (let f = 0; f < frames; f += 1) energy += envelope[f] * envelope[f]
  if (energy <= 0) return { bpm: 120, confidence: 0, offsetSeconds: 0 }

  let bestLag = minLag
  let bestScore = -Infinity
  const scores = new Float64Array(maxLag + 1)

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0
    for (let f = lag; f < frames; f += 1) sum += envelope[f] * envelope[f - lag]
    // Normalise by overlap length, or long lags would always look weaker.
    let score = sum / (frames - lag)
    // A tempo whose double also correlates is more likely the real one; this
    // nudges the estimate away from picking half-time.
    const doubled = lag * 2
    if (doubled <= maxLag) {
      let harmonic = 0
      for (let f = doubled; f < frames; f += 1) harmonic += envelope[f] * envelope[f - doubled]
      score += (0.5 * harmonic) / Math.max(1, frames - doubled)
    }
    scores[lag] = score
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  // Confidence: how far the winning lag stands above the typical lag.
  let mean = 0
  let count = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    mean += scores[lag]
    count += 1
  }
  mean /= Math.max(1, count)
  let variance = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) variance += (scores[lag] - mean) ** 2
  const deviation = Math.sqrt(variance / Math.max(1, count))
  const sharpness = deviation > 0 ? Math.max(0, Math.min(1, (bestScore - mean) / (6 * deviation))) : 0
  // Both have to hold: the correlation peak must stand out *and* the material
  // must have transients at all. A held chord satisfies the first on its own.
  const transient = Math.max(0, Math.min(1, activity / 0.035))
  const confidence = sharpness * transient

  const bpm = (60 * frameRate) / bestLag
  return {
    bpm: Math.round(bpm * 10) / 10,
    confidence,
    offsetSeconds: gridOffset(envelope, frameRate, bestLag),
  }
}

/**
 * Finds which phase of the beat grid lines up with the onsets.
 *
 * Without this the grid starts at sample zero, which is only right when the
 * recording begins exactly on a downbeat.
 */
function gridOffset(envelope: Float32Array, frameRate: number, lag: number): number {
  let bestPhase = 0
  let bestSum = -Infinity
  for (let phase = 0; phase < lag; phase += 1) {
    let sum = 0
    for (let f = phase; f < envelope.length; f += lag) sum += envelope[f]
    if (sum > bestSum) {
      bestSum = sum
      bestPhase = phase
    }
  }
  return bestPhase / frameRate
}

export interface GridOptions {
  bpm: number
  offsetSeconds: number
  /** 1 = one slice per beat, 0.5 = per eighth, 4 = per bar in 4/4. */
  beatsPerSlice: number
  durationSeconds: number
}

/** Slice boundaries on a tempo grid, in seconds. */
export function beatGrid({ bpm, offsetSeconds, beatsPerSlice, durationSeconds }: GridOptions): number[] {
  const step = (60 / bpm) * beatsPerSlice
  if (!Number.isFinite(step) || step <= 0.01) return [0]

  const points: number[] = []
  // Walk backwards from the detected phase so the grid covers the head of the
  // file too, rather than leaving the pickup bar unsliced.
  let start = offsetSeconds
  while (start - step > 0) start -= step
  for (let at = start; at < durationSeconds - 0.01; at += step) points.push(Math.max(0, at))
  return points.length > 0 ? points : [0]
}

/**
 * Nudges a cut to the nearest zero crossing.
 *
 * Cutting mid-waveform leaves a step, and a step is a click. Fades hide it, but
 * a chopper that has to fade every slice cannot make tight cuts, so the cut is
 * moved instead — at most a few milliseconds, far less than the grid resolution.
 */
export function snapToZeroCrossing(audio: AudioData, seconds: number, windowMs = 12): number {
  const frames = audio.channels[0]?.length ?? 0
  if (frames === 0) return seconds

  const target = Math.round(seconds * audio.sampleRate)
  const radius = Math.round((windowMs / 1000) * audio.sampleRate)
  const channel = audio.channels[0]

  let best = target
  let bestDistance = Infinity
  const from = Math.max(1, target - radius)
  const to = Math.min(frames - 1, target + radius)

  for (let i = from; i <= to; i += 1) {
    // A rising crossing keeps consecutive slices in phase with each other.
    const crosses = channel[i - 1] <= 0 && channel[i] > 0
    if (!crosses) continue
    const distance = Math.abs(i - target)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }

  return best / audio.sampleRate
}
