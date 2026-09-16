/**
 * Monophonic pitch tracking and note segmentation.
 *
 * The YIN algorithm (de Cheveigné and Kawahara, 2002). Plain autocorrelation
 * has a well-known failure: it peaks just as hard an octave down as at the true
 * period, so trackers built on it drop into the wrong octave constantly. YIN
 * replaces the correlation with a difference function and then divides by its
 * running mean, which suppresses the zero-lag trivial answer and makes the
 * first dip below a threshold the right one.
 *
 * On top of that sits note segmentation: frame-wise pitches become notes by
 * rounding to semitones, merging runs and discarding anything too short or too
 * unvoiced to be played on purpose.
 */

import { mixToMono, type AudioData } from './wav'

export interface PitchFrame {
  timeSeconds: number
  /** Fundamental in Hz, or 0 when the frame is unvoiced. */
  hz: number
  /** 0–1; how periodic the frame is. */
  clarity: number
}

export interface Note {
  /** MIDI note number. */
  midi: number
  startSeconds: number
  endSeconds: number
  /** 1–127, from the loudness of the note's frames. */
  velocity: number
}

const DEFAULT_THRESHOLD = 0.15
const MIN_HZ = 55 // A1
const MAX_HZ = 1500 // ~F#6

/**
 * YIN for one buffer. Returns the fundamental and how confident it is.
 */
function yin(buffer: Float32Array, sampleRate: number, threshold: number): { hz: number; clarity: number } {
  const size = buffer.length
  const maxTau = Math.min(Math.floor(size / 2), Math.floor(sampleRate / MIN_HZ))
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_HZ))
  if (maxTau <= minTau) return { hz: 0, clarity: 0 }

  // Step 1: squared difference between the signal and itself, lag by lag.
  const difference = new Float32Array(maxTau + 1)
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    let sum = 0
    for (let i = 0; i < size - tau; i += 1) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    difference[tau] = sum
  }

  // Step 2: divide by the running mean. This is what kills the zero-lag answer
  // and with it most octave errors.
  const normalized = new Float32Array(maxTau + 1)
  normalized[0] = 1
  let runningSum = 0
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    runningSum += difference[tau]
    normalized[tau] = runningSum > 0 ? (difference[tau] * (tau - minTau + 1)) / runningSum : 1
  }

  // Step 3: the first dip below the threshold, not the deepest one — taking the
  // global minimum would again prefer octave-low answers.
  let tau = minTau
  let found = -1
  while (tau < maxTau) {
    if (normalized[tau] < threshold) {
      while (tau + 1 < maxTau && normalized[tau + 1] < normalized[tau]) tau += 1
      found = tau
      break
    }
    tau += 1
  }

  if (found < 0) {
    // Nothing crossed the threshold. Fall back to the *first* local minimum
    // that is at all convincing rather than the deepest one: the deepest dip is
    // usually at twice the true period, and taking it is exactly the octave
    // error YIN exists to avoid.
    const ceiling = 0.6
    for (let t = minTau + 1; t < maxTau; t += 1) {
      if (normalized[t] < ceiling && normalized[t] <= normalized[t - 1] && normalized[t] <= normalized[t + 1]) {
        found = t
        break
      }
    }
    if (found < 0) return { hz: 0, clarity: 0 }
  }

  // Parabolic interpolation around the dip, for sub-sample precision.
  let period = found
  if (found > minTau && found < maxTau) {
    const a = normalized[found - 1]
    const b = normalized[found]
    const c = normalized[found + 1]
    const divisor = 2 * (2 * b - a - c)
    if (Math.abs(divisor) > 1e-9) period = found + (c - a) / divisor
  }

  // Guard against the remaining halving case: if half the period is nearly as
  // good a fit, the octave above is the better answer.
  const half = Math.round(period / 2)
  if (half >= minTau && normalized[half] < normalized[found] * 1.25 && normalized[half] < 0.5) {
    period = half
  }

  const hz = sampleRate / period
  if (hz < MIN_HZ || hz > MAX_HZ) return { hz: 0, clarity: 0 }
  return { hz, clarity: Math.max(0, Math.min(1, 1 - normalized[Math.min(maxTau, Math.round(period))])) }
}

export interface TrackOptions {
  /** Analysis window, in seconds. Longer is steadier but blurs fast runs. */
  windowSeconds: number
  hopSeconds: number
  threshold: number
}

export const DEFAULT_TRACKING: TrackOptions = {
  windowSeconds: 0.046, // ~2048 frames at 44.1 kHz: two cycles of the lowest note
  hopSeconds: 0.01,
  threshold: DEFAULT_THRESHOLD,
}

/** Frame-wise pitch over the whole file. */
export function trackPitch(
  audio: AudioData,
  options: TrackOptions = DEFAULT_TRACKING,
  onProgress?: (fraction: number) => void,
): PitchFrame[] {
  const mono = mixToMono(audio).channels[0]
  const window = Math.round(options.windowSeconds * audio.sampleRate)
  const hop = Math.round(options.hopSeconds * audio.sampleRate)
  const count = Math.max(0, Math.floor((mono.length - window) / hop) + 1)

  const frames: PitchFrame[] = []
  const buffer = new Float32Array(window)

  for (let f = 0; f < count; f += 1) {
    const start = f * hop
    buffer.set(mono.subarray(start, start + window))
    const { hz, clarity } = yin(buffer, audio.sampleRate, options.threshold)
    frames.push({ timeSeconds: start / audio.sampleRate, hz, clarity })
    if (onProgress && f % 64 === 0) onProgress(f / count)
  }

  onProgress?.(1)
  return frames
}

export interface SegmentOptions {
  /** Frames below this are treated as silence. */
  minimumClarity: number
  /** Notes shorter than this are dropped as tracking noise. */
  minimumSeconds: number
  /** Snap note starts to this grid, in seconds. 0 disables it. */
  quantizeSeconds: number
}

export const DEFAULT_SEGMENTATION: SegmentOptions = {
  // A clean sine gives YIN a clarity near 1.0, which makes a high gate look
  // safe. Real material — anything with harmonics, vibrato or a noise floor —
  // sits around 0.45–0.61, so a gate at 0.55 landed on the median and dropped
  // most of the melody. At 0.4 the files that already passed are unchanged.
  minimumClarity: 0.4,
  minimumSeconds: 0.06,
  quantizeSeconds: 0,
}

const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440)

/** Turns frame-wise pitch into notes. */
export function segmentNotes(
  audio: AudioData,
  frames: PitchFrame[],
  options: SegmentOptions = DEFAULT_SEGMENTATION,
): Note[] {
  const mono = mixToMono(audio).channels[0]
  const notes: Note[] = []

  let current: { midi: number; start: number; end: number } | null = null

  const close = (endSeconds: number) => {
    if (!current) return
    const length = endSeconds - current.start
    if (length >= options.minimumSeconds) {
      // Velocity from the peak level inside the note, so a quiet phrase does
      // not arrive as full-scale MIDI.
      const from = Math.max(0, Math.floor(current.start * audio.sampleRate))
      const to = Math.min(mono.length, Math.ceil(endSeconds * audio.sampleRate))
      let peak = 0
      for (let i = from; i < to; i += 1) peak = Math.max(peak, Math.abs(mono[i]))
      const db = peak > 0 ? 20 * Math.log10(peak) : -60
      const velocity = Math.max(1, Math.min(127, Math.round(((db + 48) / 48) * 110 + 17)))
      notes.push({ midi: current.midi, startSeconds: current.start, endSeconds, velocity })
    }
    current = null
  }

  for (const frame of frames) {
    const voiced = frame.hz > 0 && frame.clarity >= options.minimumClarity
    if (!voiced) {
      close(frame.timeSeconds)
      continue
    }
    const midi = Math.round(hzToMidi(frame.hz))
    if (!current) {
      current = { midi, start: frame.timeSeconds, end: frame.timeSeconds }
    } else if (current.midi !== midi) {
      close(frame.timeSeconds)
      current = { midi, start: frame.timeSeconds, end: frame.timeSeconds }
    } else {
      current.end = frame.timeSeconds
    }
  }
  if (current) close(frames.at(-1)?.timeSeconds ?? 0)

  if (options.quantizeSeconds > 0) {
    const grid = options.quantizeSeconds
    for (const note of notes) {
      const start = Math.round(note.startSeconds / grid) * grid
      const length = Math.max(grid, Math.round((note.endSeconds - note.startSeconds) / grid) * grid)
      note.startSeconds = start
      note.endSeconds = start + length
    }
  }

  return notes
}

export const MIDI_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export function midiName(midi: number): string {
  return `${MIDI_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}
