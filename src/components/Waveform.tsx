/**
 * Canvas waveform.
 *
 * Draws a min/max peak envelope rather than every sample — a four-minute track
 * is ten million points and a canvas is a few hundred columns wide, so the
 * envelope is both faster and a more honest picture of the signal.
 *
 * The envelope is computed once per audio and width and kept on an offscreen
 * canvas. Moving the playhead then costs one blit and one line, instead of
 * re-scanning every sample — which, at sixty frames a second during playback,
 * is the difference between a smooth cursor and a locked-up page.
 */

import { useEffect, useRef } from 'react'

import { peakEnvelope } from '../lib/audio'
import { readPalette } from '../lib/theme'
import type { AudioData } from '../lib/wav'

export interface WaveformProps {
  audio: AudioData | null
  height?: number
  /** Defaults to the current theme's ink colour. */
  color?: string
  background?: string
  /** Playhead position in seconds. */
  position?: number | null
  /** Highlighted region in seconds. */
  selection?: { start: number; end: number } | null
  className?: string
}

export function Waveform({
  audio,
  height = 96,
  color,
  background = 'transparent',
  position = null,
  selection = null,
  className = '',
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** The rendered envelope, reused until the audio, size or colours change. */
  const layerRef = useRef<HTMLCanvasElement | null>(null)
  const layerKeyRef = useRef('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    /** Rebuilds the offscreen envelope. The expensive half. */
    const buildLayer = (width: number, ratio: number, stroke: string) => {
      const layer = layerRef.current ?? document.createElement('canvas')
      layerRef.current = layer
      layer.width = Math.max(1, Math.floor(width * ratio))
      layer.height = Math.max(1, Math.floor(height * ratio))

      const layerContext = layer.getContext('2d')
      if (!layerContext) return
      layerContext.setTransform(ratio, 0, 0, ratio, 0, 0)
      layerContext.clearRect(0, 0, width, height)

      const middle = height / 2

      if (!audio || (audio.channels[0]?.length ?? 0) === 0) {
        layerContext.strokeStyle = stroke
        layerContext.globalAlpha = 0.2
        layerContext.beginPath()
        layerContext.moveTo(0, middle)
        layerContext.lineTo(width, middle)
        layerContext.stroke()
        layerContext.globalAlpha = 1
        return
      }

      const buckets = Math.max(1, Math.floor(width))
      const { min, max } = peakEnvelope(audio, buckets)

      layerContext.fillStyle = stroke
      for (let x = 0; x < buckets; x += 1) {
        const top = middle - max[x] * middle * 0.94
        const bottom = middle - min[x] * middle * 0.94
        // Sub-pixel-tall columns vanish entirely; keep a hairline instead.
        layerContext.fillRect(x, top, 1, Math.max(1, bottom - top))
      }
    }

    /** Blits the envelope and draws what moves. The cheap half. */
    const draw = () => {
      const stroke = color ?? readPalette().ink
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      if (width <= 0) return

      const frames = audio?.channels[0]?.length ?? 0
      const key = `${width}x${height}@${ratio}:${stroke}:${frames}:${audio?.sampleRate ?? 0}:${audio?.channels.length ?? 0}`
      if (key !== layerKeyRef.current) {
        buildLayer(width, ratio, stroke)
        layerKeyRef.current = key
      }

      canvas.width = Math.max(1, Math.floor(width * ratio))
      canvas.height = Math.max(1, Math.floor(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      if (background !== 'transparent') {
        context.fillStyle = background
        context.fillRect(0, 0, width, height)
      }

      const duration = frames / (audio?.sampleRate ?? 1)

      if (selection && duration > 0) {
        const from = (selection.start / duration) * width
        const to = (selection.end / duration) * width
        context.fillStyle = stroke
        context.globalAlpha = 0.1
        context.fillRect(from, 0, Math.max(1, to - from), height)
        context.globalAlpha = 1
      }

      const layer = layerRef.current
      if (layer) context.drawImage(layer, 0, 0, width, height)

      if (position !== null && duration > 0) {
        context.fillStyle = stroke
        context.fillRect((position / duration) * width, 0, 1.5, height)
      }
    }

    draw()

    const observer = new ResizeObserver(() => {
      // A width change invalidates the cached envelope; the key check sees it.
      draw()
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [audio, height, color, background, position, selection])

  return <canvas ref={canvasRef} style={{ height, width: '100%', display: 'block' }} className={className} />
}
