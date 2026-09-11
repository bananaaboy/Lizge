/**
 * Canvas waveform.
 *
 * Draws a min/max peak envelope rather than every sample — a four-minute track
 * is ten million points and a canvas is a few hundred columns wide, so the
 * envelope is both faster and a more honest picture of the signal.
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const draw = () => {
      // Re-read on every draw so a theme switch repaints with the new palette.
      const stroke = color ?? readPalette().ink
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      canvas.width = Math.max(1, Math.floor(width * ratio))
      canvas.height = Math.max(1, Math.floor(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

      context.clearRect(0, 0, width, height)
      if (background !== 'transparent') {
        context.fillStyle = background
        context.fillRect(0, 0, width, height)
      }

      const middle = height / 2

      if (!audio || (audio.channels[0]?.length ?? 0) === 0) {
        context.strokeStyle = stroke
        context.globalAlpha = 0.2
        context.beginPath()
        context.moveTo(0, middle)
        context.lineTo(width, middle)
        context.stroke()
        context.globalAlpha = 1
        return
      }

      const duration = (audio.channels[0].length ?? 0) / audio.sampleRate
      const buckets = Math.max(1, Math.floor(width))
      const { min, max } = peakEnvelope(audio, buckets)

      if (selection && duration > 0) {
        const from = (selection.start / duration) * width
        const to = (selection.end / duration) * width
        context.fillStyle = stroke
        context.globalAlpha = 0.1
        context.fillRect(from, 0, Math.max(1, to - from), height)
        context.globalAlpha = 1
      }

      context.fillStyle = stroke
      for (let x = 0; x < buckets; x += 1) {
        const top = middle - max[x] * middle * 0.94
        const bottom = middle - min[x] * middle * 0.94
        // Sub-pixel-tall columns vanish entirely; keep a hairline instead.
        context.fillRect(x, top, 1, Math.max(1, bottom - top))
      }

      if (position !== null && duration > 0) {
        const x = (position / duration) * width
        context.fillStyle = stroke
        context.fillRect(x, 0, 1.5, height)
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [audio, height, color, background, position, selection])

  return <canvas ref={canvasRef} style={{ height, width: '100%', display: 'block' }} className={className} />
}
