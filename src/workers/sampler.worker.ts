/// <reference lib="webworker" />
/**
 * Sampler render worker — phase-vocoder pitch and time work for slice export.
 */

import { pitchShift, stretchAudio } from '../lib/timestretch'
import type { SamplerRequest, SamplerResponse } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.addEventListener('message', (event: MessageEvent<SamplerRequest>) => {
  const request = event.data
  const post = (message: SamplerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer)

  try {
    post({ type: 'progress', id: request.id, fraction: 0.1, note: 'Vorbereiten' })

    let audio = request.audio
    if (Math.abs(request.stretchFactor - 1) > 1e-6) {
      audio = stretchAudio(audio, request.stretchFactor)
      post({ type: 'progress', id: request.id, fraction: 0.55, note: 'Zeitdehnung' })
    }
    if (Math.abs(request.semitones) > 1e-6) {
      audio = pitchShift(audio, { semitones: request.semitones, preserveDuration: request.preserveDuration })
      post({ type: 'progress', id: request.id, fraction: 0.9, note: 'Tonhöhe' })
    }

    post({ type: 'rendered', id: request.id, audio }, audio.channels.map((c) => c.buffer as ArrayBuffer))
  } catch (error) {
    post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) })
  }
})
