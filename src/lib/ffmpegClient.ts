/**
 * FFmpeg compiled to WebAssembly, running in the visitor's browser.
 *
 * How the pieces fit together
 * ---------------------------
 * `@ffmpeg/ffmpeg` is a thin RPC client. Calling `new FFmpeg()` gives you a
 * handle; `load()` spawns a dedicated Web Worker and hands it three URLs:
 *
 *   · coreURL   — the Emscripten JS glue for the ffmpeg core
 *   · wasmURL   — the compiled ffmpeg binary itself
 *   · workerURL — the pthread worker, multi-threaded core only
 *
 * Every `exec()` call is then forwarded to that worker, so transcoding never
 * blocks the UI thread. The worker owns an in-memory MEMFS filesystem: files are
 * written with `writeFile`, processed, and read back with `readFile`. Nothing is
 * ever sent anywhere — MEMFS lives in the tab's heap and dies with the tab.
 *
 * Why the URLs are imported rather than hard-coded
 * ------------------------------------------------
 * Most examples fetch the core from a CDN via `toBlobURL`. That would make every
 * visitor's browser announce itself to a third party on first use, which defeats
 * the point of this app. Instead both cores are dependencies, and Vite's `?url`
 * suffix emits them as ordinary hashed assets served from our own origin.
 *
 * Single-threaded vs multi-threaded core
 * --------------------------------------
 * `@ffmpeg/core-mt` is several times faster, but pthreads need SharedArrayBuffer,
 * which the browser only exposes to cross-origin-isolated documents (COOP +
 * COEP — see vite.config.ts and public/_headers). Where isolation is missing the
 * single-threaded core loads instead, and everything still works, just slower.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
// `?url` emits each file as a plain asset and hands back its hashed URL — the
// Emscripten glue and the .wasm must reach the browser untouched, not bundled.
import coreUrl from '@ffmpeg/core?url'
import coreWasmUrl from '@ffmpeg/core/wasm?url'
import coreMtUrl from '@ffmpeg/core-mt?url'
import coreMtWasmUrl from '@ffmpeg/core-mt/wasm?url'
import coreMtWorkerUrl from '@ffmpeg/core-mt/worker?url'

import { detectCapabilities, suggestedThreads } from './capabilities'

export interface FfmpegStatus {
  loaded: boolean
  multiThreaded: boolean
  threads: number
}

type LogHandler = (line: string) => void
type ProgressHandler = (fraction: number) => void
type StatusHandler = (status: FfmpegStatus) => void

const logHandlers = new Set<LogHandler>()
const progressHandlers = new Set<ProgressHandler>()
const statusHandlers = new Set<StatusHandler>()

export function onFfmpegLog(handler: LogHandler): () => void {
  logHandlers.add(handler)
  return () => {
    logHandlers.delete(handler)
  }
}

export function onFfmpegProgress(handler: ProgressHandler): () => void {
  progressHandlers.add(handler)
  return () => {
    progressHandlers.delete(handler)
  }
}

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let status: FfmpegStatus = { loaded: false, multiThreaded: false, threads: 1 }

export function ffmpegStatus(): FfmpegStatus {
  return status
}

/** Subscribe to load/unload transitions. Fires immediately with the state. */
export function onFfmpegStatus(handler: StatusHandler): () => void {
  statusHandlers.add(handler)
  handler(status)
  return () => {
    statusHandlers.delete(handler)
  }
}

function setStatus(next: FfmpegStatus): void {
  status = next
  statusHandlers.forEach((handler) => handler(next))
}

/** Absolute URL — the worker resolves these against its own script location. */
const absolute = (url: string) => new URL(url, window.location.href).href

/**
 * Loads the core, once. Concurrent callers share the same promise so two panels
 * starting at the same time do not each pull down a copy of the binary.
 */
export async function loadFfmpeg(): Promise<FFmpeg> {
  if (instance && status.loaded) return instance
  if (loading) return loading

  loading = (async () => {
    const caps = detectCapabilities()
    const multiThreaded = caps.ffmpegMultiThread
    const ffmpeg = new FFmpeg()

    ffmpeg.on('log', ({ message }) => {
      logHandlers.forEach((handler) => handler(message))
    })
    ffmpeg.on('progress', ({ progress }) => {
      // ffmpeg reports > 1 while flushing; clamp so progress bars behave.
      const fraction = Math.max(0, Math.min(1, progress))
      progressHandlers.forEach((handler) => handler(fraction))
    })

    await ffmpeg.load({
      // `classWorkerURL` is deliberately omitted. The library falls back to
      // `new URL('./worker.js', import.meta.url)`, which the bundler rewrites
      // into a properly bundled worker chunk. Passing a `?url` asset instead
      // would ship that file with its relative imports unresolved, and the
      // worker would die on its first import.
      coreURL: absolute(multiThreaded ? coreMtUrl : coreUrl),
      wasmURL: absolute(multiThreaded ? coreMtWasmUrl : coreWasmUrl),
      // Only the MT core spawns pthread workers of its own.
      ...(multiThreaded ? { workerURL: absolute(coreMtWorkerUrl) } : {}),
    })

    instance = ffmpeg
    setStatus({
      loaded: true,
      multiThreaded,
      threads: multiThreaded ? suggestedThreads(caps) : 1,
    })
    return ffmpeg
  })()

  try {
    return await loading
  } catch (error) {
    loading = null
    instance = null
    setStatus({ ...status, loaded: false })
    throw error
  }
}

/** Frees the worker and its heap. Worth doing after a large job. */
export async function unloadFfmpeg(): Promise<void> {
  if (!instance) return
  try {
    await instance.terminate()
  } finally {
    instance = null
    loading = null
    setStatus({ loaded: false, multiThreaded: false, threads: 1 })
  }
}

export interface RunOptions {
  /** Files to place in MEMFS before the run, keyed by in-filesystem name. */
  input: Record<string, Uint8Array>
  /** Files to read back out afterwards. */
  output: string[]
  /** The argument list, exactly as it would follow `ffmpeg` on a command line. */
  args: string[]
  signal?: AbortSignal
}

export interface RunResult {
  files: Record<string, Uint8Array>
  logs: string[]
}

/**
 * Writes inputs to MEMFS, runs one ffmpeg invocation, reads the outputs back,
 * and cleans up — so a long session does not slowly fill the heap with old jobs.
 */
export async function runFfmpeg({ input, output, args, signal }: RunOptions): Promise<RunResult> {
  const ffmpeg = await loadFfmpeg()
  const logs: string[] = []
  const stopLogging = onFfmpegLog((line) => {
    logs.push(line)
    if (logs.length > 500) logs.shift()
  })

  const abort = () => {
    // Terminating is the only way to interrupt a running core; the next call
    // transparently reloads it.
    void unloadFfmpeg()
  }
  signal?.addEventListener('abort', abort, { once: true })

  const written = Object.keys(input)
  try {
    for (const [name, bytes] of Object.entries(input)) {
      await ffmpeg.writeFile(name, bytes)
    }

    const code = await ffmpeg.exec(args)
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError')
    if (code !== 0) {
      const tail = logs.slice(-8).join('\n')
      throw new Error(`FFmpeg endete mit Code ${code}.\n${tail}`)
    }

    const files: Record<string, Uint8Array> = {}
    for (const name of output) {
      const data = await ffmpeg.readFile(name)
      files[name] = typeof data === 'string' ? new TextEncoder().encode(data) : data
    }
    return { files, logs }
  } finally {
    stopLogging()
    signal?.removeEventListener('abort', abort)
    // Best-effort cleanup; a failed run may not have created every file.
    if (instance) {
      for (const name of [...written, ...output]) {
        try {
          await instance.deleteFile(name)
        } catch {
          /* file was never created */
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Convenience wrappers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Decodes anything FFmpeg understands into a WAV the Web Audio API accepts.
 * Used as the fallback when `decodeAudioData` rejects a container.
 */
export async function decodeToWav(bytes: Uint8Array, filename: string, signal?: AbortSignal): Promise<Uint8Array> {
  const inputName = `in_${sanitize(filename)}`
  const { files } = await runFfmpeg({
    input: { [inputName]: bytes },
    output: ['out.wav'],
    args: ['-i', inputName, '-vn', '-c:a', 'pcm_f32le', '-f', 'wav', 'out.wav'],
    signal,
  })
  return files['out.wav']
}

/** MEMFS has no directories in play here, so keep names flat and safe. */
export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-64)
}
