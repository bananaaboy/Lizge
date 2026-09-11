/// <reference lib="webworker" />
/**
 * Loudness worker.
 *
 * R128 analysis touches every sample several times over — two biquad passes,
 * two block grids and a 4× oversampled peak scan. On the main thread that
 * freezes the page for seconds on a long file, so it lives here instead.
 */

import { applyNormalization, measureLoudness } from '../lib/loudness'
import type { LoudnessRequest, LoudnessResponse, PlainAudio } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope

const post = (message: LoudnessResponse, transfer: Transferable[] = []) => {
  scope.postMessage(message, transfer)
}

const buffersOf = (audio: PlainAudio): Transferable[] => audio.channels.map((c) => c.buffer as ArrayBuffer)

scope.addEventListener('message', (event: MessageEvent<LoudnessRequest>) => {
  const request = event.data
  const report = (fraction: number, note?: string) =>
    post({ type: 'progress', id: request.id, fraction, note })

  try {
    if (request.type === 'measure') {
      const result = measureLoudness(request.audio, (fraction) => report(fraction, 'Analyse nach EBU R128'))
      post({ type: 'measured', id: request.id, report: result })
      return
    }

    if (request.type === 'normalize') {
      const before = measureLoudness(request.audio, (fraction) => report(fraction * 0.45, 'Messung'))
      const { audio, plan } = applyNormalization(request.audio, before, request.settings)
      report(0.7, 'Pegel wird angepasst')
      // Re-measure the result so the panel can show what actually came out
      // rather than what was intended.
      const after = measureLoudness(audio, (fraction) => report(0.7 + fraction * 0.3, 'Kontrollmessung'))
      post({ type: 'normalized', id: request.id, audio, before, after, plan }, buffersOf(audio))
      return
    }
  } catch (error) {
    post({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
