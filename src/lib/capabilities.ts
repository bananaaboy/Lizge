/**
 * Everything Lizge does runs on the visitor's machine, so what the visitor's
 * browser supports decides which code path each feature takes. This module is
 * the single place those checks live.
 */

export interface Capabilities {
  /** COOP+COEP are in place, so SharedArrayBuffer and WASM threads are usable. */
  crossOriginIsolated: boolean
  sharedArrayBuffer: boolean
  /** Multi-threaded FFmpeg core is safe to load. */
  ffmpegMultiThread: boolean
  webgpu: boolean
  webCodecs: boolean
  /** `showSaveFilePicker` — lets large downloads stream straight to disk. */
  fileSystemAccess: boolean
  /** Origin private file system — scratch space that never touches the network. */
  opfs: boolean
  offlineAudioContext: boolean
  /** Logical cores, used to size worker pools and thread counts. */
  cores: number
  /** `deviceMemory` in GB where the browser reports it. */
  memoryGb: number | null
}

let cached: Capabilities | null = null

export function detectCapabilities(): Capabilities {
  if (cached) return cached

  const isolated = typeof globalThis.crossOriginIsolated === 'boolean' ? globalThis.crossOriginIsolated : false
  const sab = typeof SharedArrayBuffer !== 'undefined'
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4

  cached = {
    crossOriginIsolated: isolated,
    sharedArrayBuffer: sab,
    // The MT core spawns pthreads; without isolation they cannot be created at all.
    ffmpegMultiThread: isolated && sab,
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    webCodecs: typeof globalThis.VideoDecoder !== 'undefined' && typeof globalThis.AudioDecoder !== 'undefined',
    fileSystemAccess: typeof globalThis.showSaveFilePicker === 'function',
    opfs: typeof navigator !== 'undefined' && !!navigator.storage && 'getDirectory' in navigator.storage,
    offlineAudioContext: typeof OfflineAudioContext !== 'undefined',
    cores,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  }
  return cached
}

/** Threads to hand to a WASM runtime: leave one core for the UI, cap at 8. */
export function suggestedThreads(caps = detectCapabilities()): number {
  if (!caps.ffmpegMultiThread) return 1
  return Math.max(1, Math.min(8, caps.cores - 1))
}

/** Does this browser actually have a usable WebGPU adapter, not just the API? */
export async function hasWebGpuAdapter(): Promise<boolean> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } }
  if (!nav.gpu) return false
  try {
    return (await nav.gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

declare global {
  // eslint-disable-next-line no-var
  var showSaveFilePicker: ((options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>) | undefined
}

export interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}
