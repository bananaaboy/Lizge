/**
 * Phase-vocoder time stretching and pitch shifting.
 *
 * Playback rate alone couples pitch to length, which is wrong for a sampler —
 * you usually want a slice transposed but still locked to the bar. Stretching in
 * the STFT domain and resampling by the inverse ratio decouples the two.
 *
 * Pure functions over Float32Array, so this runs in a worker as happily as on
 * the main thread.
 */

import { Fft, sqrtHannWindow } from './fft'
import type { AudioData, Samples } from './wav'

const TWO_PI = Math.PI * 2

/** Wraps a phase difference into (−π, π]. */
function wrapPhase(phase: number): number {
  return phase - TWO_PI * Math.round(phase / TWO_PI)
}

/**
 * Stretches a channel by `factor` (2 = twice as long) leaving pitch untouched.
 *
 * Phases are propagated frame to frame from the instantaneous frequency, so
 * steady tones stay coherent instead of turning into the metallic smear a naive
 * overlap-add produces.
 */
export function timeStretch(input: Float32Array, factor: number, fftSize = 2048, analysisHop = 512): Samples {
  if (Math.abs(factor - 1) < 1e-6 || input.length === 0) return new Float32Array(input)

  const synthesisHop = Math.max(1, Math.round(analysisHop * factor))
  const fft = new Fft(fftSize)
  const window = sqrtHannWindow(fftSize)
  const bins = fftSize / 2 + 1

  const frames = Math.max(1, Math.floor((input.length - fftSize) / analysisHop) + 1)
  const outputLength = Math.round(input.length * factor) + fftSize
  const output = new Float64Array(outputLength)
  const weight = new Float64Array(outputLength)

  const lastPhase = new Float64Array(bins)
  const sumPhase = new Float64Array(bins)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  const magnitude = new Float64Array(bins)

  // Expected phase advance per frame for a bin at its centre frequency.
  const expected = new Float64Array(bins)
  for (let b = 0; b < bins; b += 1) expected[b] = (TWO_PI * analysisHop * b) / fftSize

  for (let f = 0; f < frames; f += 1) {
    const start = f * analysisHop
    im.fill(0)
    for (let i = 0; i < fftSize; i += 1) {
      const at = start + i
      re[i] = (at < input.length ? input[at] : 0) * window[i]
    }
    fft.forward(re, im)

    for (let b = 0; b < bins; b += 1) {
      const phase = Math.atan2(im[b], re[b])
      magnitude[b] = Math.hypot(re[b], im[b])

      // Deviation from the expected advance gives the true frequency.
      const deviation = wrapPhase(phase - lastPhase[b] - expected[b])
      lastPhase[b] = phase
      const trueFrequency = (expected[b] + deviation) / analysisHop
      sumPhase[b] = wrapPhase(sumPhase[b] + trueFrequency * synthesisHop)
    }

    for (let b = 0; b < bins; b += 1) {
      re[b] = magnitude[b] * Math.cos(sumPhase[b])
      im[b] = magnitude[b] * Math.sin(sumPhase[b])
    }
    for (let b = bins; b < fftSize; b += 1) {
      re[b] = re[fftSize - b]
      im[b] = -im[fftSize - b]
    }
    fft.inverse(re, im)

    const out = f * synthesisHop
    for (let i = 0; i < fftSize; i += 1) {
      const at = out + i
      if (at >= outputLength) break
      output[at] += re[i] * window[i]
      weight[at] += window[i] * window[i]
    }
  }

  const target = Math.max(1, Math.round(input.length * factor))
  const result = new Float32Array(target)
  for (let i = 0; i < target; i += 1) {
    result[i] = weight[i] > 1e-8 ? output[i] / weight[i] : 0
  }
  return result
}

/**
 * Catmull-Rom resampler. `ratio` above 1 produces a shorter, higher-pitched
 * result — the classic varispeed behaviour.
 */
export function resampleByRatio(input: Float32Array, ratio: number): Samples {
  if (Math.abs(ratio - 1) < 1e-9 || input.length === 0) return new Float32Array(input)

  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  const sample = (i: number) => input[Math.min(input.length - 1, Math.max(0, i))]

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio
    const index = Math.floor(position)
    const t = position - index

    const p0 = sample(index - 1)
    const p1 = sample(index)
    const p2 = sample(index + 1)
    const p3 = sample(index + 2)

    output[i] =
      0.5 *
      (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  }
  return output
}

export interface PitchOptions {
  semitones: number
  /** Keep the original duration by stretching before resampling. */
  preserveDuration: boolean
  fftSize?: number
}

/** Transposes audio, with or without holding its length. */
export function pitchShift(audio: AudioData, options: PitchOptions): AudioData {
  const { semitones, preserveDuration, fftSize = 2048 } = options
  if (Math.abs(semitones) < 1e-6) return audio

  const ratio = 2 ** (semitones / 12)

  const channels = audio.channels.map((channel) => {
    if (!preserveDuration) return resampleByRatio(channel, ratio)
    // Stretch by the pitch ratio, then play it back faster by the same ratio:
    // the two length changes cancel and only the pitch moves.
    const stretched = timeStretch(channel, ratio, fftSize, fftSize / 4)
    return resampleByRatio(stretched, ratio)
  })

  return { channels, sampleRate: audio.sampleRate }
}

/** Changes duration without moving pitch. `factor` 2 = half speed. */
export function stretchAudio(audio: AudioData, factor: number, fftSize = 2048): AudioData {
  if (Math.abs(factor - 1) < 1e-6) return audio
  return {
    channels: audio.channels.map((channel) => timeStretch(channel, factor, fftSize, fftSize / 4)),
    sampleRate: audio.sampleRate,
  }
}
