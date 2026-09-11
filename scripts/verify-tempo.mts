/**
 * Checks for the chopper's timing maths.
 *
 * Everything here is measured against material built at a known tempo, so a
 * regression shows up as a number rather than as "the chops feel off".
 *
 * Run with:  npm run verify:tempo
 */

import { beatGrid, estimateTempo, snapToZeroCrossing } from '../src/lib/tempo.ts'

const sampleRate = 44100
let failures = 0

function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(44)} ${detail}`)
}

/** A drum-like loop: kick on every beat, hats on eighths, a quiet tone under it. */
function loop(bpm: number, seconds: number, offsetSeconds = 0) {
  const frames = Math.round(sampleRate * seconds)
  const channel = new Float32Array(frames)
  const beat = 60 / bpm
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate - offsetSeconds
    if (t < 0) continue
    const inBeat = t % beat
    const inEighth = t % (beat / 2)
    let value = 0
    if (inBeat < 0.05) value += 0.9 * Math.sin(2 * Math.PI * 60 * inBeat) * Math.exp(-inBeat * 60)
    if (inEighth < 0.02) value += 0.35 * (Math.random() * 2 - 1) * Math.exp(-inEighth * 220)
    value += 0.05 * Math.sin(2 * Math.PI * 220 * t)
    channel[i] = value
  }
  return { channels: [channel, new Float32Array(channel)], sampleRate }
}

console.log('\nTempo estimation')
for (const bpm of [90, 120, 128, 140, 174]) {
  const estimate = estimateTempo(loop(bpm, 8))
  // Half and double time describe the same grid, so both count as correct.
  const ratio = estimate.bpm / bpm
  const ok = [0.5, 1, 2].some((factor) => Math.abs(ratio - factor) < 0.03)
  check(`${bpm} BPM loop`, ok, `got ${estimate.bpm} BPM, confidence ${estimate.confidence.toFixed(2)}`)
}

console.log('\nConfidence must separate rhythm from the lack of it')
const rhythmic = estimateTempo(loop(120, 8))
check('drum loop is confident', rhythmic.confidence > 0.8, rhythmic.confidence.toFixed(2))

const tone = new Float32Array(sampleRate * 4)
for (let i = 0; i < tone.length; i += 1) tone[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / sampleRate)
const held = estimateTempo({ channels: [tone], sampleRate })
check('held tone is not confident', held.confidence < 0.5, held.confidence.toFixed(2))

console.log('\nGrid phase')
const shifted = estimateTempo(loop(120, 8, 0.25))
// The beat is 0.5 s, so any phase congruent to 0.25 is right.
const phase = shifted.offsetSeconds % 0.5
check('offset found on a loop starting 0.25 s in', Math.abs(phase - 0.25) < 0.05, `${shifted.offsetSeconds.toFixed(3)} s`)

console.log('\nBeat grid')
for (const [beats, expected] of [
  [0.5, 16],
  [1, 8],
  [4, 2],
] as const) {
  const grid = beatGrid({ bpm: 120, offsetSeconds: 0, beatsPerSlice: beats, durationSeconds: 4 })
  check(`${beats} beats per slice over 4 s`, grid.length === expected, `${grid.length} slices (expected ${expected})`)
}

console.log('\nZero-crossing snap')
const sine = new Float32Array(sampleRate)
for (let i = 0; i < sine.length; i += 1) sine[i] = Math.sin((2 * Math.PI * 100 * i) / sampleRate)
const audio = { channels: [sine], sampleRate }
for (const at of [0.1234, 0.777]) {
  const snapped = snapToZeroCrossing(audio, at)
  const value = Math.abs(sine[Math.round(snapped * sampleRate)])
  const moved = Math.abs(snapped - at) * 1000
  check(`cut at ${at} s lands near zero`, value < 0.05 && moved < 12, `moved ${moved.toFixed(2)} ms, |sample| ${value.toFixed(4)}`)
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
