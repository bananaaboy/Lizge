/**
 * ITU-R BS.1770-4 / EBU R128 loudness measurement, in plain TypeScript.
 *
 * Runs inside a worker, so it cannot lean on the Web Audio API — the
 * K-weighting biquads, the gated mean-square integration and the 4× true-peak
 * oversampler are all implemented here. Filter coefficients are derived
 * analytically for the material's own sample rate (the approach libebur128
 * uses), so nothing has to be resampled to 48 kHz first.
 */

import type { AudioData } from './wav'

export interface LoudnessReport {
  /** Gated programme loudness over the whole file. */
  integratedLufs: number
  /** Loudness range in LU (EBU Tech 3342). */
  loudnessRangeLu: number
  /** Loudest 400 ms window. */
  momentaryMaxLufs: number
  /** Loudest 3 s window. */
  shortTermMaxLufs: number
  /** Highest sample value, in dBFS. */
  samplePeakDbfs: number
  /** Highest inter-sample value at 4× oversampling, in dBTP. */
  truePeakDbtp: number
  sampleRate: number
  durationSeconds: number
}

export interface NormalizationSettings {
  mode: 'lufs' | 'peak'
  /** Target programme loudness in LUFS, used when mode is 'lufs'. */
  targetLufs: number
  /** Target peak in dBFS, used when mode is 'peak'. */
  targetPeakDbfs: number
  /** Ceiling the output must not exceed, in dBTP. */
  truePeakCeilingDbtp: number
  /** Pull the gain back to respect the ceiling instead of limiting. */
  preventClipping: boolean
  /** Soft-knee limiter for the peaks that survive the gain move. */
  useLimiter: boolean
}

export const DEFAULT_NORMALIZATION: NormalizationSettings = {
  mode: 'lufs',
  targetLufs: -14, // streaming-platform convention
  targetPeakDbfs: -1,
  truePeakCeilingDbtp: -1,
  preventClipping: true,
  useLimiter: false,
}

/** Common delivery targets, offered as presets in the UI. */
export const LOUDNESS_PRESETS = [
  { id: 'streaming', label: 'Streaming (Spotify, Apple)', lufs: -14, ceiling: -1 },
  { id: 'youtube', label: 'YouTube', lufs: -14, ceiling: -1 },
  { id: 'broadcast', label: 'Broadcast EBU R128', lufs: -23, ceiling: -1 },
  { id: 'atsc', label: 'Broadcast ATSC A/85', lufs: -24, ceiling: -2 },
  { id: 'podcast', label: 'Podcast', lufs: -16, ceiling: -1 },
  { id: 'club', label: 'Club / laut', lufs: -9, ceiling: -0.3 },
] as const

const ABSOLUTE_GATE_LUFS = -70
const RELATIVE_GATE_LU = -10
const LRA_RELATIVE_GATE_LU = -20

interface BiquadCoefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/**
 * Stage 1 of K-weighting: a +4 dB high shelf standing in for the acoustic
 * effect of a listener's head.
 */
function shelvingFilter(sampleRate: number): BiquadCoefficients {
  const f0 = 1681.974450955533
  const gain = 3.999843853973347
  const q = 0.7071752369554196

  const k = Math.tan((Math.PI * f0) / sampleRate)
  const vh = 10 ** (gain / 20)
  const vb = vh ** 0.4996667741545416
  const a0 = 1 + k / q + k * k

  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  }
}

/** Stage 2 of K-weighting: an RLB high-pass at roughly 38 Hz. */
function highPassFilter(sampleRate: number): BiquadCoefficients {
  const f0 = 38.13547087602444
  const q = 0.5003270373238773
  const k = Math.tan((Math.PI * f0) / sampleRate)
  const a0 = 1 + k / q + k * k

  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  }
}

/** Direct-form-I biquad over a copy of the channel. */
function filterChannel(input: Float32Array, c: BiquadCoefficients): Float32Array {
  const out = new Float32Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i += 1) {
    const x0 = input[i]
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    out[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }
  return out
}

/**
 * BS.1770 channel weights. Index order follows the WAV convention
 * (L, R, C, LFE, Ls, Rs); the LFE channel is excluded from the measurement.
 */
function channelWeights(count: number): number[] {
  switch (count) {
    case 1:
      return [1]
    case 2:
      return [1, 1]
    case 3:
      return [1, 1, 1]
    case 4:
      return [1, 1, 1.41, 1.41]
    case 6:
      return [1, 1, 1, 0, 1.41, 1.41]
    default:
      return Array.from({ length: count }, () => 1)
  }
}

function loudnessOfMeanSquares(meanSquares: number[], weights: number[]): number {
  let sum = 0
  for (let c = 0; c < meanSquares.length; c += 1) sum += weights[c] * meanSquares[c]
  return sum > 0 ? -0.691 + 10 * Math.log10(sum) : -Infinity
}

interface BlockSet {
  /** Per-block, per-channel mean square. */
  meanSquares: Float64Array[]
  loudness: Float64Array
  count: number
}

/** Sliding-window mean squares over K-weighted channels. */
function computeBlocks(
  filtered: Float32Array[],
  sampleRate: number,
  blockSeconds: number,
  stepSeconds: number,
  weights: number[],
): BlockSet {
  const blockSize = Math.round(blockSeconds * sampleRate)
  const stepSize = Math.round(stepSeconds * sampleRate)
  const frames = filtered[0]?.length ?? 0
  const count = frames >= blockSize ? Math.floor((frames - blockSize) / stepSize) + 1 : 0

  const meanSquares = filtered.map(() => new Float64Array(Math.max(count, 0)))
  const loudness = new Float64Array(Math.max(count, 0))

  for (let c = 0; c < filtered.length; c += 1) {
    const channel = filtered[c]
    // Prefix sums of x² turn every block into two lookups instead of a loop.
    const prefix = new Float64Array(frames + 1)
    for (let i = 0; i < frames; i += 1) prefix[i + 1] = prefix[i] + channel[i] * channel[i]
    for (let b = 0; b < count; b += 1) {
      const start = b * stepSize
      meanSquares[c][b] = (prefix[start + blockSize] - prefix[start]) / blockSize
    }
  }

  for (let b = 0; b < count; b += 1) {
    let sum = 0
    for (let c = 0; c < filtered.length; c += 1) sum += weights[c] * meanSquares[c][b]
    loudness[b] = sum > 0 ? -0.691 + 10 * Math.log10(sum) : -Infinity
  }

  return { meanSquares, loudness, count }
}

/** Two-stage gate from BS.1770-4: absolute at −70 LUFS, then −10 LU relative. */
function gatedLoudness(blocks: BlockSet, weights: number[]): number {
  if (blocks.count === 0) return -Infinity
  const channels = blocks.meanSquares.length

  const averageOver = (keep: (index: number) => boolean): number[] | null => {
    const sums = new Array<number>(channels).fill(0)
    let used = 0
    for (let b = 0; b < blocks.count; b += 1) {
      if (!keep(b)) continue
      used += 1
      for (let c = 0; c < channels; c += 1) sums[c] += blocks.meanSquares[c][b]
    }
    if (used === 0) return null
    return sums.map((s) => s / used)
  }

  const absolute = averageOver((b) => blocks.loudness[b] > ABSOLUTE_GATE_LUFS)
  if (!absolute) return -Infinity

  const relativeThreshold = loudnessOfMeanSquares(absolute, weights) + RELATIVE_GATE_LU
  const gated = averageOver(
    (b) => blocks.loudness[b] > ABSOLUTE_GATE_LUFS && blocks.loudness[b] > relativeThreshold,
  )
  return gated ? loudnessOfMeanSquares(gated, weights) : -Infinity
}

/** EBU Tech 3342 loudness range: the 10th-to-95th percentile spread. */
function loudnessRange(blocks: BlockSet, weights: number[]): number {
  if (blocks.count === 0) return 0

  const above: number[] = []
  const channels = blocks.meanSquares.length
  const sums = new Array<number>(channels).fill(0)
  let used = 0
  for (let b = 0; b < blocks.count; b += 1) {
    if (blocks.loudness[b] <= ABSOLUTE_GATE_LUFS) continue
    used += 1
    for (let c = 0; c < channels; c += 1) sums[c] += blocks.meanSquares[c][b]
  }
  if (used === 0) return 0

  const threshold = loudnessOfMeanSquares(
    sums.map((s) => s / used),
    weights,
  ) + LRA_RELATIVE_GATE_LU

  for (let b = 0; b < blocks.count; b += 1) {
    if (blocks.loudness[b] > ABSOLUTE_GATE_LUFS && blocks.loudness[b] > threshold) {
      above.push(blocks.loudness[b])
    }
  }
  if (above.length < 2) return 0

  above.sort((a, b) => a - b)
  const at = (percentile: number) => above[Math.min(above.length - 1, Math.round(percentile * (above.length - 1)))]
  return at(0.95) - at(0.1)
}

/**
 * 4× polyphase oversampling for inter-sample peaks.
 *
 * A windowed-sinc kernel is split into four phases; each phase is a short FIR
 * over the original samples, so no full-rate buffer is ever materialised.
 *
 * The tap count per phase is odd and the kernel is centred on a tap, which makes
 * phase 0 the identity — every other tap lands on a sinc zero — so the original
 * samples pass through untouched and only the three intermediate phases have to
 * be evaluated.
 *
 * Past the ends the signal is treated as silent rather than held at its edge
 * value. That is what a streaming meter does (its filter state starts at zero),
 * and holding the edge instead makes the filter ring against an artificial
 * plateau, which over-reads badly on high-frequency material.
 */
function truePeak(channels: Float32Array[]): number {
  const factor = 4
  const tapsPerPhase = 13 // odd, so one phase is the identity
  const half = (tapsPerPhase - 1) / 2
  const kernelLength = tapsPerPhase * factor
  const center = half * factor

  const kernel = new Float64Array(kernelLength)
  for (let i = 0; i < kernelLength; i += 1) {
    const x = (i - center) / factor
    const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
    // Blackman window keeps the stop-band low enough for peak estimation.
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / (kernelLength - 1)) +
      0.08 * Math.cos((4 * Math.PI * i) / (kernelLength - 1))
    kernel[i] = sinc * w
  }

  // Phase 0 reproduces the input, so only the three intermediate phases are
  // evaluated; the sample peak covers the rest.
  const phases: Float64Array[] = []
  for (let p = 1; p < factor; p += 1) {
    const phase = new Float64Array(tapsPerPhase)
    let sum = 0
    for (let t = 0; t < tapsPerPhase; t += 1) {
      phase[t] = kernel[t * factor + p]
      sum += phase[t]
    }
    // Unity DC gain, so a constant signal keeps exactly its level.
    if (Math.abs(sum) > 1e-9) for (let t = 0; t < tapsPerPhase; t += 1) phase[t] /= sum
    phases.push(phase)
  }

  let peak = 0
  for (const channel of channels) {
    const length = channel.length
    for (let i = 0; i < length; i += 1) {
      const magnitude = Math.abs(channel[i])
      if (magnitude > peak) peak = magnitude
      for (const phase of phases) {
        let acc = 0
        for (let t = 0; t < tapsPerPhase; t += 1) {
          const at = i + t - half
          if (at >= 0 && at < length) acc += channel[at] * phase[t]
        }
        const value = acc < 0 ? -acc : acc
        if (value > peak) peak = value
      }
    }
  }
  return peak
}

function samplePeak(channels: Float32Array[]): number {
  let peak = 0
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const magnitude = Math.abs(channel[i])
      if (magnitude > peak) peak = magnitude
    }
  }
  return peak
}

const toDb = (linear: number) => (linear > 0 ? 20 * Math.log10(linear) : -Infinity)

/** Full R128 measurement. `onProgress` is called with a 0–1 fraction. */
export function measureLoudness(audio: AudioData, onProgress?: (fraction: number) => void): LoudnessReport {
  const { channels, sampleRate } = audio
  const weights = channelWeights(channels.length)

  onProgress?.(0.05)
  const shelf = shelvingFilter(sampleRate)
  const highPass = highPassFilter(sampleRate)
  const filtered = channels.map((channel, index) => {
    const result = filterChannel(filterChannel(channel, shelf), highPass)
    onProgress?.(0.05 + (0.45 * (index + 1)) / channels.length)
    return result
  })

  const momentary = computeBlocks(filtered, sampleRate, 0.4, 0.1, weights)
  onProgress?.(0.62)
  const shortTerm = computeBlocks(filtered, sampleRate, 3, 0.1, weights)
  onProgress?.(0.74)

  const integratedLufs = gatedLoudness(momentary, weights)
  const loudnessRangeLu = loudnessRange(shortTerm, weights)
  onProgress?.(0.8)

  let momentaryMax = -Infinity
  for (let b = 0; b < momentary.count; b += 1) momentaryMax = Math.max(momentaryMax, momentary.loudness[b])
  let shortTermMax = -Infinity
  for (let b = 0; b < shortTerm.count; b += 1) shortTermMax = Math.max(shortTermMax, shortTerm.loudness[b])

  const peakLinear = samplePeak(channels)
  onProgress?.(0.85)
  const truePeakLinear = truePeak(channels)
  onProgress?.(1)

  return {
    integratedLufs,
    loudnessRangeLu,
    momentaryMaxLufs: momentaryMax,
    shortTermMaxLufs: shortTermMax,
    samplePeakDbfs: toDb(peakLinear),
    // True peak can only ever be at or above sample peak; guard against
    // rounding in the interpolator dipping below it.
    truePeakDbtp: toDb(Math.max(truePeakLinear, peakLinear)),
    sampleRate,
    durationSeconds: (channels[0]?.length ?? 0) / sampleRate,
  }
}

export interface GainPlan {
  /** Gain the target asks for, before any ceiling is applied. */
  requestedDb: number
  /** Gain actually applied. */
  appliedDb: number
  /** True if the ceiling forced `appliedDb` below `requestedDb`. */
  reducedByCeiling: boolean
  /** True if the limiter had to engage. */
  limiterEngaged: boolean
  predictedPeakDbtp: number
}

/**
 * Works out the gain move for a measurement, then applies it in place-ish
 * (a new AudioData is returned; the input is left untouched).
 */
export function applyNormalization(
  audio: AudioData,
  report: LoudnessReport,
  settings: NormalizationSettings,
): { audio: AudioData; plan: GainPlan } {
  const requestedDb =
    settings.mode === 'lufs'
      ? settings.targetLufs - report.integratedLufs
      : settings.targetPeakDbfs - report.samplePeakDbfs

  let appliedDb = Number.isFinite(requestedDb) ? requestedDb : 0
  let reducedByCeiling = false

  // Pulling the gain back is the transparent option; limiting is the loud one.
  const headroomDb = settings.truePeakCeilingDbtp - report.truePeakDbtp
  if (settings.preventClipping && !settings.useLimiter && appliedDb > headroomDb) {
    appliedDb = headroomDb
    reducedByCeiling = true
  }

  const gain = 10 ** (appliedDb / 20)
  const ceiling = 10 ** (settings.truePeakCeilingDbtp / 20)
  let limiterEngaged = false

  const output = audio.channels.map((channel) => {
    const out = new Float32Array(channel.length)
    for (let i = 0; i < channel.length; i += 1) out[i] = channel[i] * gain
    return out
  })

  if (settings.useLimiter) {
    limiterEngaged = softLimit(output, ceiling)
  } else if (settings.preventClipping) {
    // Hard safety net: the gain move already respects the ceiling, so this only
    // catches interpolation error.
    for (const channel of output) {
      for (let i = 0; i < channel.length; i += 1) {
        if (channel[i] > ceiling) channel[i] = ceiling
        else if (channel[i] < -ceiling) channel[i] = -ceiling
      }
    }
  }

  const resulting: AudioData = { channels: output, sampleRate: audio.sampleRate }

  return {
    audio: resulting,
    plan: {
      requestedDb,
      appliedDb,
      reducedByCeiling,
      limiterEngaged,
      predictedPeakDbtp: toDb(Math.min(truePeak(output), ceiling * 1.001)),
    },
  }
}

/**
 * Look-ahead peak limiter with a 5 ms attack and 50 ms release, shared across
 * channels so the stereo image does not wander.
 */
function softLimit(channels: Float32Array[], ceiling: number): boolean {
  const frames = channels[0]?.length ?? 0
  if (frames === 0) return false

  let engaged = false
  const envelope = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    let magnitude = 0
    for (const channel of channels) magnitude = Math.max(magnitude, Math.abs(channel[i]))
    envelope[i] = magnitude
  }

  const attack = 220 // ≈5 ms at 44.1 kHz
  const release = 2200
  const gainCurve = new Float32Array(frames).fill(1)

  for (let i = 0; i < frames; i += 1) {
    if (envelope[i] > ceiling) {
      engaged = true
      const required = ceiling / envelope[i]
      // Ramp into the reduction ahead of the peak so it is not audible as a click.
      const start = Math.max(0, i - attack)
      for (let j = start; j <= i; j += 1) {
        const ramp = required + (1 - required) * ((i - j) / attack)
        if (ramp < gainCurve[j]) gainCurve[j] = ramp
      }
      const end = Math.min(frames - 1, i + release)
      for (let j = i; j <= end; j += 1) {
        const ramp = required + (1 - required) * ((j - i) / release)
        if (ramp < gainCurve[j]) gainCurve[j] = ramp
      }
    }
  }

  if (!engaged) return false
  for (const channel of channels) {
    for (let i = 0; i < frames; i += 1) channel[i] *= gainCurve[i]
  }
  return true
}
