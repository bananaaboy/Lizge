/**
 * Chroma features: how much energy sits on each of the twelve pitch classes.
 *
 * Fold every octave onto one, and a spectrum becomes a statement about harmony
 * rather than about timbre — an A is an A whether it came from a bass or a
 * violin. Everything harmonic in this app is built on that one vector: key
 * estimation reads its long-term average, chord estimation reads it over time.
 *
 * Bins are mapped to pitch classes by frequency rather than by index, and each
 * bin's contribution is weighted by how close it sits to the pitch centre, so a
 * slightly detuned instrument still lands on the right class instead of
 * smearing across its neighbours.
 */

import { magnitudeOf, stft } from './fft'
import { mixToMono, type AudioData } from './wav'

export const PITCH_CLASSES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
export type PitchClass = (typeof PITCH_CLASSES)[number]

const FFT_SIZE = 8192 // ~5.4 Hz resolution at 44.1 kHz, enough to separate low notes
const HOP_SIZE = 2048
/** Analysis range: roughly C2 to C7. Below that, bass notes blur the profile. */
const MIN_HZ = 65
const MAX_HZ = 2100
/** Roughly C2 to C4: where root notes live. */
const BASS_MAX_HZ = 260
const A4_HZ = 440

export interface ChromaResult {
  /** `frames × 12`, frame-major, each frame normalised to a unit maximum. */
  frames: Float32Array
  frameCount: number
  /** Seconds covered by one frame step. */
  frameSeconds: number
  /** Mean over all frames, weighted by frame energy. */
  average: Float32Array
  /**
   * The same, from the bass register only.
   *
   * A key and its relative minor contain identical pitch classes, so the
   * long-term average cannot tell them apart — the difference is which note
   * behaves as the tonic, and the bass is where that shows.
   */
  bass: Float32Array
  /** The opening of the piece — the clearest statement of the tonic. */
  head: Float32Array
  /** The closing, which is a weaker cue because endings are often unresolved. */
  tail: Float32Array
}

/** MIDI note number for a frequency, as a real number. */
function midiOf(hz: number): number {
  return 69 + 12 * Math.log2(hz / A4_HZ)
}

/**
 * Computes a chromagram.
 *
 * `tuningOffset` shifts the reference in semitones, so material recorded at 432
 * Hz or a tape that runs slightly fast still maps onto the right classes.
 */
export function chromagram(audio: AudioData, tuningOffset = 0): ChromaResult {
  const mono = mixToMono(audio).channels[0]
  const spec = stft(mono, FFT_SIZE, HOP_SIZE)
  const magnitude = magnitudeOf(spec)
  const { frames, bins } = spec
  const binHz = audio.sampleRate / FFT_SIZE

  // Pre-compute each bin's pitch class and its weight, since they never change.
  const classOf = new Int8Array(bins).fill(-1)
  const weightOf = new Float32Array(bins)
  for (let b = 1; b < bins; b += 1) {
    const hz = b * binHz
    if (hz < MIN_HZ || hz > MAX_HZ) continue
    const midi = midiOf(hz) - tuningOffset
    const nearest = Math.round(midi)
    const cents = Math.abs(midi - nearest)
    // A raised-cosine window over ±50 cents: dead centre counts fully, a
    // quarter-tone away counts for nothing.
    weightOf[b] = 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, cents * 2))
    classOf[b] = ((nearest % 12) + 12) % 12
  }

  const result = new Float32Array(frames * 12)
  const average = new Float32Array(12)
  const bass = new Float32Array(12)
  const head = new Float32Array(12)
  const tail = new Float32Array(12)
  // The first and last eighth carry the opening and the cadence, which is where
  // a piece states its tonic most plainly.
  const edgeFrames = Math.max(1, Math.round(frames / 8))

  const bassRow = new Float32Array(12)

  for (let f = 0; f < frames; f += 1) {
    const row = f * 12
    const offset = f * bins
    bassRow.fill(0)

    for (let b = 1; b < bins; b += 1) {
      const pitchClass = classOf[b]
      if (pitchClass < 0) continue
      // Magnitude rather than power: power lets one loud note swamp the chord.
      const value = magnitude[offset + b] * weightOf[b]
      result[row + pitchClass] += value
      if (b * binHz <= BASS_MAX_HZ) bassRow[pitchClass] += value
    }

    let peak = 0
    for (let c = 0; c < 12; c += 1) peak = Math.max(peak, result[row + c])
    if (peak > 0) {
      const atHead = f < edgeFrames
      const atTail = f >= frames - edgeFrames
      for (let c = 0; c < 12; c += 1) {
        result[row + c] /= peak
        // Louder frames carry more weight in the average, so silence and noise
        // between phrases do not dilute the profile.
        average[c] += result[row + c] * peak
        if (atHead) head[c] += result[row + c] * peak
        if (atTail) tail[c] += result[row + c] * peak
      }
    }

    // Only the strongest bass class per frame counts; summing them all would
    // just reproduce the overall average an octave lower.
    let bassPeak = 0
    let bassClass = -1
    for (let c = 0; c < 12; c += 1) {
      if (bassRow[c] > bassPeak) {
        bassPeak = bassRow[c]
        bassClass = c
      }
    }
    if (bassClass >= 0) bass[bassClass] += bassPeak
  }

  const unit = (vector: Float32Array) => {
    let peak = 0
    for (let c = 0; c < 12; c += 1) peak = Math.max(peak, vector[c])
    if (peak > 0) for (let c = 0; c < 12; c += 1) vector[c] /= peak
  }
  unit(average)
  unit(bass)
  unit(head)
  unit(tail)

  return {
    frames: result,
    frameCount: frames,
    frameSeconds: HOP_SIZE / audio.sampleRate,
    average,
    bass,
    head,
    tail,
  }
}

/**
 * Estimates how far the recording sits from concert pitch, in semitones.
 *
 * Tries a range of offsets and keeps the one whose chroma is most peaked: a
 * correctly tuned mapping concentrates energy in twelve classes, a wrong one
 * spreads it between them.
 */
export function estimateTuning(audio: AudioData): number {
  let best = 0
  let bestScore = -Infinity
  for (let cents = -50; cents <= 50; cents += 10) {
    const offset = cents / 100
    const { average } = chromagram(audio, offset)
    // Sum of squares is maximal when the energy is concentrated.
    let score = 0
    for (let c = 0; c < 12; c += 1) score += average[c] * average[c]
    if (score > bestScore) {
      bestScore = score
      best = offset
    }
  }
  return best
}
