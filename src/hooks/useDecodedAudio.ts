/**
 * Decodes an asset to planar floats, on demand.
 *
 * The browser's own decoder is tried first because it is hardware accelerated
 * and already present. FFmpeg is the fallback for the containers browsers
 * refuse — and the first fallback pays for loading the core, so it is worth
 * telling the user which path ran.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { decodeWithBrowser } from '../lib/audio'
import { decodeToWav } from '../lib/ffmpegClient'
import { decodeWav, type AudioData } from '../lib/wav'
import { useSession, type Asset } from '../state/store'

export type DecodeStatus = 'idle' | 'decoding' | 'ready' | 'error'

export interface DecodeState {
  audio: AudioData | null
  status: DecodeStatus
  error: string | null
  /** Which decoder produced the result. */
  via: 'browser' | 'ffmpeg' | null
  decode: () => Promise<AudioData | null>
}

export function useDecodedAudio(asset: Asset | null): DecodeState {
  const updateAsset = useSession((state) => state.updateAsset)
  const log = useSession((state) => state.log)

  const [status, setStatus] = useState<DecodeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [via, setVia] = useState<'browser' | 'ffmpeg' | null>(null)
  // Guards against two panels decoding the same asset at once.
  const inFlight = useRef<Promise<AudioData | null> | null>(null)

  useEffect(() => {
    inFlight.current = null
    setError(null)
    setVia(null)
    setStatus(asset?.audio ? 'ready' : 'idle')
  }, [asset?.id, asset?.audio])

  const decode = useCallback(async (): Promise<AudioData | null> => {
    if (!asset) return null
    if (asset.audio) return asset.audio
    if (inFlight.current) return inFlight.current

    const task = (async () => {
      setStatus('decoding')
      setError(null)
      try {
        let audio: AudioData
        try {
          const source = asset.bytes.slice()
          audio = await decodeWithBrowser(source.buffer as ArrayBuffer)
          setVia('browser')
          log('decode', `${asset.name} über den Browser dekodiert`)
        } catch {
          log('decode', `${asset.name}: Browser lehnt das Format ab, FFmpeg übernimmt`, 'warn')
          const wav = await decodeToWav(asset.bytes, asset.name)
          audio = decodeWav(wav)
          setVia('ffmpeg')
        }

        updateAsset(asset.id, {
          audio,
          durationSeconds: (audio.channels[0]?.length ?? 0) / audio.sampleRate,
        })
        setStatus('ready')
        return audio
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(message)
        setStatus('error')
        log('decode', `${asset.name}: ${message}`, 'error')
        return null
      } finally {
        inFlight.current = null
      }
    })()

    inFlight.current = task
    return task
  }, [asset, log, updateAsset])

  return { audio: asset?.audio ?? null, status, error, via, decode }
}
