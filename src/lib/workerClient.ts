/**
 * Promise-shaped front end for the DSP workers.
 *
 * Workers are created lazily and kept alive between jobs — spinning one up costs
 * a module graph parse, which is wasteful when a user normalises six files in a
 * row. Each job carries an id so responses can be matched even though a single
 * worker handles them one after another.
 */

import type {
  LoudnessRequest,
  LoudnessResponse,
  PlainAudio,
  SamplerRequest,
  SamplerResponse,
  StemsRequest,
  StemsResponse,
} from '../workers/protocol'
import type { GainPlan, LoudnessReport, NormalizationSettings } from './loudness'
import type { SeparationOptions, StemId } from './separation'
import type { AudioData } from './wav'

export type ProgressCallback = (fraction: number, note?: string) => void

let nextJobId = 1

/** Shared plumbing: send one request, resolve on the first matching terminal reply. */
function runJob<Request extends { id: number }, Response extends { type: string; id: number }, Result>(
  worker: Worker,
  request: Request,
  transfer: Transferable[],
  isResult: (message: Response) => boolean,
  toResult: (message: Response) => Result,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    const finish = () => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      signal?.removeEventListener('abort', handleAbort)
    }

    const handleMessage = (event: MessageEvent<Response>) => {
      const message = event.data
      if (message.id !== request.id) return

      if (message.type === 'progress') {
        const progress = message as unknown as { fraction: number; note?: string }
        onProgress?.(progress.fraction, progress.note)
        return
      }
      if (message.type === 'error') {
        finish()
        reject(new Error((message as unknown as { message: string }).message))
        return
      }
      if (isResult(message)) {
        finish()
        resolve(toResult(message))
      }
    }

    const handleError = (event: ErrorEvent) => {
      finish()
      reject(new Error(event.message || 'Worker-Fehler'))
    }

    const handleAbort = () => {
      finish()
      // A worker cannot be interrupted mid-loop, so the only honest way to
      // cancel is to destroy it. The next job creates a fresh one.
      worker.terminate()
      resetWorkers()
      reject(new DOMException('Abgebrochen', 'AbortError'))
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    signal?.addEventListener('abort', handleAbort, { once: true })
    worker.postMessage(request, transfer)
  })
}

let loudnessWorker: Worker | null = null
let stemsWorker: Worker | null = null
let samplerWorker: Worker | null = null

function getLoudnessWorker(): Worker {
  loudnessWorker ??= new Worker(new URL('../workers/loudness.worker.ts', import.meta.url), {
    type: 'module',
    name: 'lizge-loudness',
  })
  return loudnessWorker
}

function getStemsWorker(): Worker {
  stemsWorker ??= new Worker(new URL('../workers/stems.worker.ts', import.meta.url), {
    type: 'module',
    name: 'lizge-stems',
  })
  return stemsWorker
}

function getSamplerWorker(): Worker {
  samplerWorker ??= new Worker(new URL('../workers/sampler.worker.ts', import.meta.url), {
    type: 'module',
    name: 'lizge-sampler',
  })
  return samplerWorker
}

/** Drops every cached worker; the next call builds new ones. */
export function resetWorkers(): void {
  loudnessWorker = null
  stemsWorker = null
  samplerWorker = null
}

/** Detaching the caller's buffers would leave the UI holding empty arrays. */
function copyAudio(audio: AudioData): PlainAudio {
  return {
    channels: audio.channels.map((channel) => new Float32Array(channel)),
    sampleRate: audio.sampleRate,
  }
}

const buffersOf = (audio: PlainAudio): Transferable[] => audio.channels.map((c) => c.buffer as ArrayBuffer)

export function measureLoudnessInWorker(
  audio: AudioData,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<LoudnessReport> {
  const payload = copyAudio(audio)
  const request: LoudnessRequest = { type: 'measure', id: nextJobId++, audio: payload }
  return runJob<LoudnessRequest & { id: number }, LoudnessResponse & { id: number }, LoudnessReport>(
    getLoudnessWorker(),
    request,
    buffersOf(payload),
    (message) => message.type === 'measured',
    (message) => (message as Extract<LoudnessResponse, { type: 'measured' }>).report,
    onProgress,
    signal,
  )
}

export interface NormalizationOutcome {
  audio: AudioData
  before: LoudnessReport
  after: LoudnessReport
  plan: GainPlan
}

export function normalizeInWorker(
  audio: AudioData,
  settings: NormalizationSettings,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<NormalizationOutcome> {
  const payload = copyAudio(audio)
  const request: LoudnessRequest = { type: 'normalize', id: nextJobId++, audio: payload, settings }
  return runJob<LoudnessRequest & { id: number }, LoudnessResponse & { id: number }, NormalizationOutcome>(
    getLoudnessWorker(),
    request,
    buffersOf(payload),
    (message) => message.type === 'normalized',
    (message) => {
      const done = message as Extract<LoudnessResponse, { type: 'normalized' }>
      return { audio: done.audio, before: done.before, after: done.after, plan: done.plan }
    },
    onProgress,
    signal,
  )
}

export interface SeparationOutcome {
  stems: Record<StemId, AudioData>
  engine: 'dsp' | 'onnx'
  provider?: string
}

export function separateInWorker(
  audio: AudioData,
  options: SeparationOptions,
  extras: { model: Uint8Array | null; threads: number; preferWebGpu: boolean },
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<SeparationOutcome> {
  const payload = copyAudio(audio)
  const request: StemsRequest = {
    type: 'separate',
    id: nextJobId++,
    audio: payload,
    options,
    model: extras.model,
    threads: extras.threads,
    preferWebGpu: extras.preferWebGpu,
  }
  const transfer = buffersOf(payload)
  // The model buffer is reused across runs, so it is cloned rather than moved.
  return runJob<StemsRequest, StemsResponse & { id: number }, SeparationOutcome>(
    getStemsWorker(),
    request,
    transfer,
    (message) => message.type === 'separated',
    (message) => {
      const done = message as Extract<StemsResponse, { type: 'separated' }>
      return { stems: done.stems, engine: done.engine, provider: done.provider }
    },
    onProgress,
    signal,
  )
}

export function renderSliceInWorker(
  audio: AudioData,
  options: { semitones: number; stretchFactor: number; preserveDuration: boolean },
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<AudioData> {
  const payload = copyAudio(audio)
  const request: SamplerRequest = {
    type: 'render',
    id: nextJobId++,
    audio: payload,
    semitones: options.semitones,
    stretchFactor: options.stretchFactor,
    preserveDuration: options.preserveDuration,
  }
  return runJob<SamplerRequest, SamplerResponse & { id: number }, AudioData>(
    getSamplerWorker(),
    request,
    buffersOf(payload),
    (message) => message.type === 'rendered',
    (message) => (message as Extract<SamplerResponse, { type: 'rendered' }>).audio,
    onProgress,
    signal,
  )
}
