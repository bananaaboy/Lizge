/// <reference lib="webworker" />
/**
 * Harmony worker.
 *
 * Chroma runs an 8192-point STFT over the whole file and the pitch tracker runs
 * YIN on every 10 ms hop — several seconds of arithmetic on a normal track.
 * Both belong off the main thread.
 */

import { chromagram } from '../lib/chroma'
import { estimateChords, estimateKey } from '../lib/key'
import { segmentNotes, trackPitch } from '../lib/pitch'
import type { HarmonyRequest, HarmonyResponse } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.addEventListener('message', (event: MessageEvent<HarmonyRequest>) => {
  const request = event.data
  const post = (message: HarmonyResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer)
  const report = (fraction: number, note?: string) =>
    post({ type: 'progress', id: request.id, fraction, note })

  try {
    report(0.05, 'Tonhöhenprofil')
    const chroma = chromagram(request.audio)

    report(0.35, 'Tonart')
    const key = estimateKey(chroma)

    report(0.45, 'Akkorde')
    const chords = estimateChords(chroma, request.chordWindow)

    let notes: ReturnType<typeof segmentNotes> = []
    if (request.transcribe) {
      const frames = trackPitch(request.audio, undefined, (fraction) =>
        report(0.5 + fraction * 0.45, 'Melodie wird verfolgt'),
      )
      notes = segmentNotes(request.audio, frames, {
        minimumClarity: request.minimumClarity,
        minimumSeconds: request.minimumNoteSeconds,
        quantizeSeconds: request.quantizeSeconds,
      })
    }

    report(0.98, 'Fertig')
    post({ type: 'analysed', id: request.id, key, chords, chroma: chroma.average, notes }, [
      chroma.average.buffer as ArrayBuffer,
    ])
  } catch (error) {
    post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) })
  }
})
