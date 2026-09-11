/**
 * Calibration check for the loudness engine.
 *
 * ITU-R BS.1770-4 pins the scale with a known reference: a 1 kHz sine of peak
 * amplitude X dBFS, identical in both channels, must read X LUFS. Everything
 * else — the gate, the true-peak oversampler, the gain move — is checked
 * against consequences that follow from that.
 *
 * Run with:  node --experimental-strip-types scripts/verify-loudness.mts
 */

import { applyNormalization, DEFAULT_NORMALIZATION, measureLoudness } from '../src/lib/loudness.ts'

const sampleRate = 48000
let failures = 0

function check(label: string, actual: number, expected: number, tolerance: number): void {
  const delta = Math.abs(actual - expected)
  const ok = delta <= tolerance
  if (!ok) failures += 1
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(42)} ${actual.toFixed(2).padStart(8)}  ` +
      `(expected ${expected.toFixed(2)} ±${tolerance})`,
  )
}

const sine = (hz: number, peak: number, seconds: number) => {
  const frames = sampleRate * seconds
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) out[i] = peak * Math.sin((2 * Math.PI * hz * i) / sampleRate)
  return out
}
const asStereo = (channel: Float32Array) => ({
  channels: [channel, new Float32Array(channel)],
  sampleRate,
})

console.log('\nBS.1770-4 calibration')
for (const dbfs of [0, -14, -23]) {
  const report = measureLoudness(asStereo(sine(1000, 10 ** (dbfs / 20), 8)))
  check(`1 kHz stereo at ${dbfs} dBFS peak`, report.integratedLufs, dbfs, 0.1)
}
check(
  '1 kHz mono at 0 dBFS peak',
  measureLoudness({ channels: [sine(1000, 1, 8)], sampleRate }).integratedLufs,
  -3.01,
  0.1,
)

console.log('\nGating')
const tone = sine(1000, 10 ** (-23 / 20), 8)
const padded = new Float32Array(sampleRate * 24)
padded.set(tone, 0)
check('8 s tone followed by 16 s of silence', measureLoudness(asStereo(padded)).integratedLufs, -23, 0.2)

console.log('\nTrue peak')
// A tone at a quarter of the sample rate, offset by an eighth of a cycle, puts
// every sample at 0.707 of the amplitude and the real peak exactly between two
// of them. A true-peak meter has to find the 3 dB the sample peak misses.
const interSample = new Float32Array(sampleRate)
for (let i = 0; i < interSample.length; i += 1) {
  const envelope = Math.min(1, Math.min(i, interSample.length - 1 - i) / 2000)
  interSample[i] = 0.5 * envelope * Math.sin((2 * Math.PI * 12000 * i) / sampleRate + Math.PI / 4)
}
const peaks = measureLoudness({ channels: [interSample], sampleRate })
check('sample peak of an inter-sample tone', peaks.samplePeakDbfs, -9.03, 0.1)
check('true peak of the same tone', peaks.truePeakDbtp, -6.02, 0.3)

const constant = new Float32Array(sampleRate).fill(0.5)
check(
  'true peak of a constant signal',
  measureLoudness({ channels: [constant], sampleRate }).truePeakDbtp,
  -6.02,
  1.1, // a file that starts at full level really is a step, and a step rings
)

console.log('\nNormalisation')
for (const target of [-23, -16, -9]) {
  const music = { channels: [sine(220, 0.4, 6), sine(224, 0.4, 6)], sampleRate }
  const before = measureLoudness(music)
  const { audio } = applyNormalization(music, before, { ...DEFAULT_NORMALIZATION, targetLufs: target })
  const after = measureLoudness(audio)
  check(`gain move to ${target} LUFS`, after.integratedLufs, target, 0.1)
  if (after.truePeakDbtp > DEFAULT_NORMALIZATION.truePeakCeilingDbtp + 0.05) {
    failures += 1
    console.log(`FAIL  ceiling breached at ${target} LUFS: ${after.truePeakDbtp.toFixed(2)} dBTP`)
  }
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
