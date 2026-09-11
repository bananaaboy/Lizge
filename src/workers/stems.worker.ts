/// <reference lib="webworker" />
/**
 * Stem separation worker.
 *
 * Two engines live behind one message: the built-in DSP separator, which needs
 * nothing but the audio, and an ONNX model the user supplied, executed through
 * WebGPU or threaded WASM. The ONNX runtime is imported dynamically so a visitor
 * who never uses it never downloads it.
 */

import { separate, STEM_IDS, type StemId } from '../lib/separation'
import type { PlainAudio, StemsRequest, StemsResponse } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.addEventListener('message', async (event: MessageEvent<StemsRequest>) => {
  const request = event.data
  const post = (message: StemsResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer)
  const report = (fraction: number, note?: string) =>
    post({ type: 'progress', id: request.id, fraction, note })

  try {
    let stems: Record<StemId, PlainAudio>
    let engine: 'dsp' | 'onnx' = 'dsp'
    let provider: string | undefined

    if (request.model && request.model.byteLength > 0) {
      report(0.02, 'Modell wird geladen')
      const { loadModel, separateWithModel } = await import('../lib/onnx')
      const model = await loadModel(request.model, {
        threads: request.threads,
        preferWebGpu: request.preferWebGpu,
      })
      provider = model.info.provider
      report(0.1, `${model.info.strategy === 'waveform' ? 'Wellenform' : 'Spektrogramm'}-Modell · ${provider}`)
      stems = await separateWithModel(model, request.audio, (fraction, note) =>
        report(0.1 + fraction * 0.9, note),
      )
      engine = 'onnx'
      model.session.release?.()
    } else {
      stems = separate(request.audio, request.options, (fraction, note) => report(fraction, note))
    }

    const transfer: Transferable[] = []
    for (const id of STEM_IDS) {
      for (const channel of stems[id].channels) transfer.push(channel.buffer as ArrayBuffer)
    }

    post({ type: 'separated', id: request.id, stems, engine, provider }, transfer)
  } catch (error) {
    post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) })
  }
})
