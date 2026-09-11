/**
 * Web Audio bridge and sample-level editing helpers.
 *
 * Decoding goes through the browser's own decoder first — it is hardware
 * accelerated and costs nothing to call. Only when the browser refuses a
 * container (Opus in Matroska, AC-3, odd AVI variants) does the caller fall
 * back to FFmpeg, which is why `decodeAudio` reports *why* it failed rather
 * than swallowing the error.
 */

import { fromAudioBuffer, type AudioData } from './wav'

export { mixToMono } from './wav'

let sharedContext: AudioContext | null = null

/** A single lazily created AudioContext, resumed on first user gesture. */
export function getAudioContext(): AudioContext {
  if (!sharedContext) sharedContext = new AudioContext()
  return sharedContext
}

export async function resumeAudioContext(): Promise<void> {
  const context = getAudioContext()
  if (context.state === 'suspended') await context.resume()
}

/** Decodes any container the browser understands into planar floats. */
export async function decodeWithBrowser(bytes: ArrayBuffer): Promise<AudioData> {
  const context = getAudioContext()
  // decodeAudioData detaches the buffer it is given, so hand it a copy.
  const buffer = await context.decodeAudioData(bytes.slice(0))
  return fromAudioBuffer(buffer)
}

export function toAudioBuffer(audio: AudioData, context: BaseAudioContext): AudioBuffer {
  const frames = audio.channels[0]?.length ?? 0
  const buffer = context.createBuffer(Math.max(1, audio.channels.length), Math.max(1, frames), audio.sampleRate)
  audio.channels.forEach((channel, index) => buffer.copyToChannel(channel, index))
  return buffer
}

/* -------------------------------------------------------------------------- */
/* Sample-level edits                                                          */
/* -------------------------------------------------------------------------- */

/** Extracts `[startSeconds, endSeconds)` as a new buffer. */
export function sliceAudio(audio: AudioData, startSeconds: number, endSeconds: number): AudioData {
  const frames = audio.channels[0]?.length ?? 0
  const start = Math.max(0, Math.min(frames, Math.floor(startSeconds * audio.sampleRate)))
  const end = Math.max(start, Math.min(frames, Math.ceil(endSeconds * audio.sampleRate)))
  return {
    channels: audio.channels.map((channel) => new Float32Array(channel.subarray(start, end))),
    sampleRate: audio.sampleRate,
  }
}

/** Equal-power fades at the slice boundaries, to kill edge clicks. */
export function applyFades(audio: AudioData, fadeInSeconds: number, fadeOutSeconds: number): AudioData {
  const frames = audio.channels[0]?.length ?? 0
  const fadeIn = Math.min(frames, Math.round(fadeInSeconds * audio.sampleRate))
  const fadeOut = Math.min(frames - fadeIn, Math.round(fadeOutSeconds * audio.sampleRate))

  const channels = audio.channels.map((channel) => {
    const out = new Float32Array(channel)
    for (let i = 0; i < fadeIn; i += 1) out[i] *= Math.sin((Math.PI / 2) * (i / fadeIn))
    for (let i = 0; i < fadeOut; i += 1) {
      const at = frames - 1 - i
      out[at] *= Math.sin((Math.PI / 2) * (i / fadeOut))
    }
    return out
  })
  return { channels, sampleRate: audio.sampleRate }
}

export function reverseAudio(audio: AudioData): AudioData {
  return {
    channels: audio.channels.map((channel) => {
      const out = new Float32Array(channel.length)
      for (let i = 0; i < channel.length; i += 1) out[i] = channel[channel.length - 1 - i]
      return out
    }),
    sampleRate: audio.sampleRate,
  }
}

export function applyGain(audio: AudioData, gain: number): AudioData {
  return {
    channels: audio.channels.map((channel) => {
      const out = new Float32Array(channel.length)
      for (let i = 0; i < channel.length; i += 1) out[i] = channel[i] * gain
      return out
    }),
    sampleRate: audio.sampleRate,
  }
}

/** Scales so the loudest sample lands exactly on `targetDbfs`. */
export function normalizePeak(audio: AudioData, targetDbfs = -0.3): AudioData {
  let peak = 0
  for (const channel of audio.channels) {
    for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]))
  }
  if (peak <= 0) return audio
  return applyGain(audio, 10 ** (targetDbfs / 20) / peak)
}

/**
 * Peak envelope for waveform drawing: min and max per pixel column.
 * Drawing from the raw samples would push millions of points at the canvas.
 */
export function peakEnvelope(audio: AudioData, buckets: number): { min: Float32Array; max: Float32Array } {
  const frames = audio.channels[0]?.length ?? 0
  const min = new Float32Array(buckets)
  const max = new Float32Array(buckets)
  if (frames === 0) return { min, max }

  const perBucket = frames / buckets
  for (let b = 0; b < buckets; b += 1) {
    const start = Math.floor(b * perBucket)
    const end = Math.min(frames, Math.ceil((b + 1) * perBucket))
    let lo = 0
    let hi = 0
    for (let i = start; i < end; i += 1) {
      for (const channel of audio.channels) {
        const value = channel[i]
        if (value < lo) lo = value
        if (value > hi) hi = value
      }
    }
    min[b] = lo
    max[b] = hi
  }
  return { min, max }
}
