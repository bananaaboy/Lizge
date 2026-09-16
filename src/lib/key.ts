/**
 * Musical key and chord estimation.
 *
 * FL Studio can name the chord you are holding in the piano roll, but it cannot
 * tell you the key of a sample you dropped in — producers buy a separate plugin
 * for that. It is not a hard problem: a key is a distribution over pitch
 * classes, and Krumhansl and Kessler measured what those distributions look
 * like by asking listeners how well each note fitted a given key. Correlating a
 * piece's chroma against those twenty-four profiles gets you the key.
 *
 * Chords use the same idea at a shorter timescale, against triad templates.
 */

import { PITCH_CLASSES, type ChromaResult } from './chroma'

export type Mode = 'dur' | 'moll'

export interface KeyEstimate {
  tonic: number
  mode: Mode
  label: string
  /** Camelot code, the notation harmonic mixing uses. */
  camelot: string
  /** 0–1, from the margin between the best fit and the runner-up. */
  confidence: number
  /** The next-best candidate, which is often the relative major or minor. */
  alternative: { label: string; camelot: string }
  /** Correlation per candidate, tonic-major then tonic-minor, for display. */
  scores: { label: string; camelot: string; score: number }[]
}

/**
 * Krumhansl–Kessler probe-tone profiles, starting at the tonic.
 *
 * These are experimental data, not a formula: listeners rated how well each of
 * the twelve notes fitted an established key context.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

/**
 * Camelot numbers for the twelve major keys, indexed by tonic pitch class.
 * The minor of the same number is its relative minor, which is what makes the
 * wheel useful: neighbours and the A/B partner all mix.
 */
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]

/** Flat spellings read better for the keys that conventionally use them. */
const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

export function camelotOf(tonic: number, mode: Mode): string {
  if (mode === 'dur') return `${CAMELOT_MAJOR[tonic]}B`
  // A minor key shares its Camelot number with its relative major, three
  // semitones up.
  return `${CAMELOT_MAJOR[(tonic + 3) % 12]}A`
}

export function keyLabel(tonic: number, mode: Mode): string {
  // German capitalises the mode as a noun: "C-Dur", not "C-dur".
  return `${KEY_NAMES[tonic]}-${mode === 'dur' ? 'Dur' : 'Moll'}`
}

/** Pearson correlation between a rotated profile and the chroma vector. */
function correlate(chroma: Float32Array, profile: number[], rotation: number): number {
  let chromaMean = 0
  let profileMean = 0
  for (let i = 0; i < 12; i += 1) {
    chromaMean += chroma[i]
    profileMean += profile[i]
  }
  chromaMean /= 12
  profileMean /= 12

  let covariance = 0
  let chromaVariance = 0
  let profileVariance = 0
  for (let i = 0; i < 12; i += 1) {
    const a = chroma[(i + rotation) % 12] - chromaMean
    const b = profile[i] - profileMean
    covariance += a * b
    chromaVariance += a * a
    profileVariance += b * b
  }

  const denominator = Math.sqrt(chromaVariance * profileVariance)
  return denominator > 0 ? covariance / denominator : 0
}

/**
 * How much extra credit the tonic gets for being in the bass and at the edges.
 *
 * A key and its relative minor have identical pitch-class content, so profile
 * correlation alone scores them almost the same — and which of the two it picks
 * comes down to rounding. What separates them is which note acts as the tonic,
 * and that shows in the bass line and in how the piece starts and ends.
 */
const BASS_WEIGHT = 0.22
/** The opening states the tonic; endings are often left hanging. */
const HEAD_WEIGHT = 0.24
const TAIL_WEIGHT = 0.10
/** The fifth is the second-strongest root in the bass; worth a little. */
const DOMINANT_WEIGHT = 0.05

export function estimateKey(chroma: ChromaResult): KeyEstimate {
  const tonicEvidence = (tonic: number) =>
    BASS_WEIGHT * chroma.bass[tonic] +
    HEAD_WEIGHT * chroma.head[tonic] +
    TAIL_WEIGHT * chroma.tail[tonic] +
    DOMINANT_WEIGHT * chroma.bass[(tonic + 7) % 12]

  const candidates: { tonic: number; mode: Mode; score: number }[] = []
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const evidence = tonicEvidence(tonic)
    candidates.push({ tonic, mode: 'dur', score: correlate(chroma.average, MAJOR_PROFILE, tonic) + evidence })
    candidates.push({ tonic, mode: 'moll', score: correlate(chroma.average, MINOR_PROFILE, tonic) + evidence })
  }
  candidates.sort((a, b) => b.score - a.score)

  const best = candidates[0]
  const runnerUp = candidates[1]
  // How clearly the winner won. A piece that genuinely sits between two keys —
  // a relative major and minor share all twelve notes — should not be reported
  // as certain, and this is what says so.
  const margin = Math.max(0, Math.min(1, (best.score - runnerUp.score) / 0.2))
  const strength = Math.max(0, Math.min(1, best.score))
  const confidence = Math.max(0, Math.min(1, margin * strength))

  return {
    tonic: best.tonic,
    mode: best.mode,
    label: keyLabel(best.tonic, best.mode),
    camelot: camelotOf(best.tonic, best.mode),
    confidence,
    alternative: {
      label: keyLabel(runnerUp.tonic, runnerUp.mode),
      camelot: camelotOf(runnerUp.tonic, runnerUp.mode),
    },
    scores: candidates.slice(0, 6).map((entry) => ({
      label: keyLabel(entry.tonic, entry.mode),
      camelot: camelotOf(entry.tonic, entry.mode),
      score: entry.score,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Chords                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChordSpan {
  startSeconds: number
  endSeconds: number
  label: string
  /** null for a stretch with no clear chord. */
  root: number | null
  quality: 'dur' | 'moll' | 'dim' | null
}

/** Intervals above the root, as pitch-class offsets. */
const CHORD_SHAPES: { quality: 'dur' | 'moll' | 'dim'; suffix: string; notes: number[] }[] = [
  { quality: 'dur', suffix: '', notes: [0, 4, 7] },
  { quality: 'moll', suffix: 'm', notes: [0, 3, 7] },
  { quality: 'dim', suffix: '°', notes: [0, 3, 6] },
]

function chordTemplates(): { label: string; root: number; quality: 'dur' | 'moll' | 'dim'; vector: Float32Array }[] {
  const templates = []
  for (let root = 0; root < 12; root += 1) {
    for (const shape of CHORD_SHAPES) {
      const vector = new Float32Array(12)
      for (const interval of shape.notes) vector[(root + interval) % 12] = 1
      templates.push({
        label: `${PITCH_CLASSES[root].replace('♯', '♯')}${shape.suffix}`,
        root,
        quality: shape.quality,
        vector,
      })
    }
  }
  return templates
}

/**
 * Labels the harmony over time.
 *
 * Chroma frames are averaged into windows of `windowSeconds`, matched against
 * triad templates, then runs of the same label are merged. Without that merge
 * the result flickers between a chord and its relative on every frame, which is
 * technically defensible and useless to read.
 */
/**
 * A single note explains its own chroma almost perfectly; a triad explains a
 * chord better than any one note can. When one class beats the best triad by
 * more than this, the window is a melody note rather than harmony.
 *
 * Measured separation on synthetic material: chords under a melody land between
 * 0.86 and 1.11, a solo line between 1.23 and 1.48.
 */
const SINGLE_NOTE_RATIO = 1.15

export function estimateChords(chroma: ChromaResult, windowSeconds = 0.5, minimumScore = 0.55): ChordSpan[] {
  const templates = chordTemplates()
  const framesPerWindow = Math.max(1, Math.round(windowSeconds / chroma.frameSeconds))
  const windows = Math.ceil(chroma.frameCount / framesPerWindow)
  const labels: { label: string; root: number | null; quality: ChordSpan['quality'] }[] = []

  const window = new Float32Array(12)
  for (let w = 0; w < windows; w += 1) {
    window.fill(0)
    const from = w * framesPerWindow
    const to = Math.min(chroma.frameCount, from + framesPerWindow)
    for (let f = from; f < to; f += 1) {
      for (let c = 0; c < 12; c += 1) window[c] += chroma.frames[f * 12 + c]
    }
    let peak = 0
    for (let c = 0; c < 12; c += 1) peak = Math.max(peak, window[c])
    if (peak <= 0) {
      labels.push({ label: '—', root: null, quality: null })
      continue
    }
    for (let c = 0; c < 12; c += 1) window[c] /= peak

    let norm = 0
    for (let c = 0; c < 12; c += 1) norm += window[c] * window[c]
    norm = Math.sqrt(norm)

    let best = templates[0]
    let bestScore = -Infinity
    for (const template of templates) {
      // Cosine similarity: the three chord tones should carry the energy.
      let dot = 0
      for (let c = 0; c < 12; c += 1) dot += window[c] * template.vector[c]
      const score = norm > 0 ? dot / (norm * Math.sqrt(3)) : 0
      if (score > bestScore) {
        bestScore = score
        best = template
      }
    }

    // How well the single strongest class explains the window on its own. A
    // melody note and its overtones spell out a triad, so template matching
    // alone would name a chord for every passing note.
    let bestSingle = 0
    for (let c = 0; c < 12; c += 1) {
      const score = norm > 0 ? window[c] / norm : 0
      if (score > bestSingle) bestSingle = score
    }

    const harmonic = bestScore > 0 && bestSingle / bestScore <= SINGLE_NOTE_RATIO
    labels.push(
      harmonic && bestScore >= minimumScore
        ? { label: best.label, root: best.root, quality: best.quality }
        : { label: '—', root: null, quality: null },
    )
  }

  // Merge runs.
  const spans: ChordSpan[] = []
  let index = 0
  while (index < labels.length) {
    let end = index + 1
    while (end < labels.length && labels[end].label === labels[index].label) end += 1
    const startSeconds = index * framesPerWindow * chroma.frameSeconds
    const endSeconds = Math.min(end * framesPerWindow, chroma.frameCount) * chroma.frameSeconds
    spans.push({ startSeconds, endSeconds, ...labels[index] })
    index = end
  }

  // Drop single-window blips between two identical neighbours; they are almost
  // always a passing note rather than a chord change.
  return spans.filter(
    (span, i) =>
      span.endSeconds - span.startSeconds > windowSeconds * 1.5 ||
      i === 0 ||
      i === spans.length - 1 ||
      spans[i - 1].label !== spans[i + 1]?.label,
  )
}
