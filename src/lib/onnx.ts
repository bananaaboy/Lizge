/**
 * Optional neural stem separation with onnxruntime-web.
 *
 * Sondra ships no model weights. A Demucs or Spleeter export is tens to hundreds
 * of megabytes, and bundling one would mean every visitor downloads it whether
 * or not they use separation. Instead the user points at a model — a local
 * `.onnx` file or a URL they choose — and it is executed here, on their machine,
 * through WebGPU where available and threaded WASM otherwise.
 *
 * The runner adapts to the model rather than the other way round: it reads the
 * input and output rank from the session metadata and picks a waveform or
 * spectrogram-mask strategy. That covers the shapes the common open-source
 * exports use (Demucs v3/v4 waveform models, Spleeter-style mask models).
 *
 * Everything in this module is dynamically imported, so a visitor who never
 * touches neural separation never downloads the runtime or its WASM payload.
 */

import { applyMask, istft, magnitudeOf, stft } from './fft'
import { STEM_IDS, type SeparationResult, type StemId } from './separation'
import type { AudioData } from './wav'

type OrtModule = typeof import('onnxruntime-web/webgpu')
type Session = import('onnxruntime-web/webgpu').InferenceSession

export type ExecutionProvider = 'webgpu' | 'wasm'

export interface ModelInfo {
  inputName: string
  outputName: string
  inputShape: readonly (number | string)[]
  outputShape: readonly (number | string)[]
  /** How the runner decided to feed this model. */
  strategy: 'waveform' | 'spectrogram-mask'
  /** Stems the output tensor carries, derived from its shape. */
  stemCount: number
  provider: ExecutionProvider
}

let ortPromise: Promise<OrtModule> | null = null

/** Loads onnxruntime-web once, pointing it at locally served WASM assets. */
async function loadOrt(threads: number): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = (async () => {
      const [ort, wasmUrl] = await Promise.all([
        import('onnxruntime-web/webgpu'),
        // The WebGPU build is the Asyncify one; its JS glue is already inlined
        // in the bundle, so only the .wasm has to be located. `?url` emits it
        // from our own origin rather than leaving ORT to reach for a CDN.
        import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url').then((m) => m.default),
      ])
      // Absolute, because ORT resolves this from inside its own worker.
      ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href }
      ort.env.wasm.numThreads = threads
      ort.env.logLevel = 'error'
      return ort
    })()
  }
  const ort = await ortPromise
  ort.env.wasm.numThreads = threads
  return ort
}

export interface LoadedModel {
  session: Session
  info: ModelInfo
  ort: OrtModule
}

function shapeOf(metadata: readonly import('onnxruntime-web/webgpu').InferenceSession.ValueMetadata[], name: string) {
  const entry = metadata.find((m) => m.name === name)
  return entry && entry.isTensor ? entry.shape : []
}

/**
 * Creates a session from raw model bytes.
 *
 * WebGPU is tried first and falls back to WASM: on hardware without a working
 * adapter the session simply fails to build, which is recoverable, whereas a
 * half-initialised GPU session is not.
 */
export async function loadModel(
  modelBytes: Uint8Array,
  options: { threads: number; preferWebGpu: boolean },
): Promise<LoadedModel> {
  const ort = await loadOrt(options.threads)
  const providers: ExecutionProvider[] = options.preferWebGpu ? ['webgpu', 'wasm'] : ['wasm']

  let session: Session | null = null
  let provider: ExecutionProvider = 'wasm'
  let lastError: unknown = null

  for (const candidate of providers) {
    try {
      session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: [candidate],
        graphOptimizationLevel: 'all',
      })
      provider = candidate
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!session) {
    throw new Error(
      `Modell konnte nicht geladen werden: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    )
  }

  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]
  const inputShape = shapeOf(session.inputMetadata, inputName)
  const outputShape = shapeOf(session.outputMetadata, outputName)

  // Rank 3 inputs are [batch, channels, samples] — a waveform model.
  // Rank 4 inputs are [batch, channels, frequency, time] — a mask model.
  const strategy: ModelInfo['strategy'] = inputShape.length >= 4 ? 'spectrogram-mask' : 'waveform'

  // Stems live in the dimension the output gained over the input.
  const stemDimension = outputShape.length > inputShape.length ? outputShape[1] : outputShape[1]
  const stemCount = typeof stemDimension === 'number' && stemDimension > 0 && stemDimension <= 8 ? stemDimension : 4

  return {
    session,
    ort,
    info: { inputName, outputName, inputShape, outputShape, strategy, stemCount, provider },
  }
}

/** Reads the fixed sample length out of a waveform model's input shape. */
function modelSegmentLength(info: ModelInfo, sampleRate: number): number {
  const last = info.inputShape[info.inputShape.length - 1]
  if (typeof last === 'number' && last > 1024) return last
  // Dynamic axis — Demucs is trained on roughly 7.8 s windows.
  return Math.round(sampleRate * 7.8)
}

/** Forces the channel count a model expects, up- or down-mixing as needed. */
function conformChannels(audio: AudioData, want: number): Float32Array[] {
  const have = audio.channels.length
  if (have === want) return audio.channels
  if (have === 1) return Array.from({ length: want }, () => audio.channels[0])
  if (want === 1) {
    const frames = audio.channels[0].length
    const mono = new Float32Array(frames)
    for (const channel of audio.channels) {
      for (let i = 0; i < frames; i += 1) mono[i] += channel[i] / have
    }
    return [mono]
  }
  return Array.from({ length: want }, (_, i) => audio.channels[Math.min(i, have - 1)])
}

function emptyStems(channels: number, frames: number, sampleRate: number): SeparationResult {
  return Object.fromEntries(
    STEM_IDS.map((id) => [
      id,
      { channels: Array.from({ length: channels }, () => new Float32Array(frames)), sampleRate },
    ]),
  ) as SeparationResult
}

/**
 * Runs a waveform model over the signal in overlapping windows.
 *
 * Windows are Hann-weighted and overlap-added with window-sum normalisation,
 * which removes the boundary artefacts a plain concatenation would leave at
 * every window edge.
 */
async function runWaveform(
  model: LoadedModel,
  audio: AudioData,
  onProgress?: (fraction: number, note?: string) => void,
): Promise<SeparationResult> {
  const { ort, session, info } = model
  const sampleRate = audio.sampleRate
  const frames = audio.channels[0]?.length ?? 0

  const wantChannels =
    typeof info.inputShape[1] === 'number' && (info.inputShape[1] as number) > 0 ? (info.inputShape[1] as number) : 2
  const input = conformChannels(audio, wantChannels)

  const segment = modelSegmentLength(info, sampleRate)
  const hop = Math.floor(segment / 2)
  const windows = Math.max(1, Math.ceil(Math.max(0, frames - segment) / hop) + 1)

  const stems = emptyStems(audio.channels.length, frames, sampleRate)
  const weightSum = new Float32Array(frames)

  const fade = new Float32Array(segment)
  for (let i = 0; i < segment; i += 1) fade[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / segment)

  const buffer = new Float32Array(wantChannels * segment)

  for (let w = 0; w < windows; w += 1) {
    const start = Math.min(w * hop, Math.max(0, frames - segment))
    buffer.fill(0)
    for (let c = 0; c < wantChannels; c += 1) {
      const channel = input[c]
      for (let i = 0; i < segment; i += 1) {
        const at = start + i
        buffer[c * segment + i] = at < frames ? channel[at] : 0
      }
    }

    const tensor = new ort.Tensor('float32', buffer, [1, wantChannels, segment])
    const output = await session.run({ [info.inputName]: tensor })
    const result = output[info.outputName]
    const data = result.data as Float32Array
    const stemCount = Math.min(info.stemCount, STEM_IDS.length)

    for (let s = 0; s < stemCount; s += 1) {
      const id = STEM_IDS[s]
      for (let c = 0; c < audio.channels.length; c += 1) {
        const sourceChannel = Math.min(c, wantChannels - 1)
        const offset = (s * wantChannels + sourceChannel) * segment
        const target = stems[id].channels[c]
        for (let i = 0; i < segment; i += 1) {
          const at = start + i
          if (at >= frames) break
          target[at] += data[offset + i] * fade[i]
        }
      }
    }

    for (let i = 0; i < segment; i += 1) {
      const at = start + i
      if (at < frames) weightSum[at] += fade[i]
    }

    // Yield to the event loop so progress messages get out of the worker.
    await Promise.resolve()
    onProgress?.((w + 1) / windows, `Fenster ${w + 1} von ${windows}`)
  }

  for (const id of STEM_IDS) {
    for (const channel of stems[id].channels) {
      for (let i = 0; i < frames; i += 1) {
        if (weightSum[i] > 1e-6) channel[i] /= weightSum[i]
      }
    }
  }

  return stems
}

/**
 * Runs a spectrogram mask model: magnitudes in, per-stem masks out, phase taken
 * from the original signal.
 */
async function runSpectrogramMask(
  model: LoadedModel,
  audio: AudioData,
  onProgress?: (fraction: number, note?: string) => void,
): Promise<SeparationResult> {
  const { ort, session, info } = model
  const fftSize = 4096
  const hopSize = 1024

  const specs = audio.channels.map((channel) => stft(channel, fftSize, hopSize))
  const bins = specs[0].bins
  const frames = specs[0].frames
  const channelCount = specs.length

  const magnitude = new Float32Array(channelCount * bins * frames)
  specs.forEach((spec, c) => {
    const mag = magnitudeOf(spec)
    // Models of this family expect [channel][frequency][time].
    for (let f = 0; f < frames; f += 1) {
      for (let b = 0; b < bins; b += 1) {
        magnitude[c * bins * frames + b * frames + f] = mag[f * bins + b]
      }
    }
  })

  onProgress?.(0.35, 'Modell wird ausgeführt')
  const tensor = new ort.Tensor('float32', magnitude, [1, channelCount, bins, frames])
  const output = await session.run({ [info.inputName]: tensor })
  const data = output[info.outputName].data as Float32Array
  onProgress?.(0.75, 'Masken werden angewendet')

  const stems = emptyStems(channelCount, audio.channels[0].length, audio.sampleRate)
  const stemCount = Math.min(info.stemCount, STEM_IDS.length)
  const stride = channelCount * bins * frames

  for (let s = 0; s < stemCount; s += 1) {
    const id: StemId = STEM_IDS[s]
    for (let c = 0; c < channelCount; c += 1) {
      const mask = new Float32Array(frames * bins)
      for (let f = 0; f < frames; f += 1) {
        for (let b = 0; b < bins; b += 1) {
          mask[f * bins + b] = data[s * stride + c * bins * frames + b * frames + f]
        }
      }
      stems[id].channels[c] = istft(applyMask(specs[c], mask))
    }
    onProgress?.(0.75 + (0.25 * (s + 1)) / stemCount)
  }

  return stems
}

/** Entry point: dispatches to the strategy the model's shape implies. */
export async function separateWithModel(
  model: LoadedModel,
  audio: AudioData,
  onProgress?: (fraction: number, note?: string) => void,
): Promise<SeparationResult> {
  return model.info.strategy === 'waveform'
    ? runWaveform(model, audio, onProgress)
    : runSpectrogramMask(model, audio, onProgress)
}
