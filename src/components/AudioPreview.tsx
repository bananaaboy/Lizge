/**
 * Playback for anything the app produced.
 *
 * Every stage here changes how something sounds, and a number on a screen is a
 * poor substitute for hearing it. So each result gets a player: the waveform
 * doubles as the scrub bar, and an A/B pair can be switched mid-playback
 * without losing the position, which is the only way to actually judge whether
 * a gain move or a separation did what it claims.
 *
 * Playback goes through one shared AudioContext and a single source node per
 * player, started at an offset and tracked with `requestAnimationFrame` — an
 * `<audio>` element would mean encoding a WAV and holding a blob URL per
 * result, for worse control.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { getAudioContext, resumeAudioContext, toAudioBuffer } from '../lib/audio'
import { formatTimecode } from '../lib/format'
import type { AudioData } from '../lib/wav'
import { Waveform } from './Waveform'

export interface PreviewSource {
  id: string
  label: string
  audio: AudioData
}

interface AudioPreviewProps {
  /** One entry plays straight; several become an A/B switch. */
  sources: PreviewSource[]
  /** Waveform height. 0 hides it and leaves only the transport. */
  waveHeight?: number
  className?: string
}

export function AudioPreview({ sources, waveHeight = 56, className = '' }: AudioPreviewProps) {
  const [activeId, setActiveId] = useState(sources[0]?.id ?? '')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const buffersRef = useRef(new Map<string, AudioBuffer>())
  const startedAtRef = useRef(0)
  const offsetRef = useRef(0)
  const frameRef = useRef(0)
  const lastPaintRef = useRef(0)

  const active = sources.find((entry) => entry.id === activeId) ?? sources[0]
  const duration = active ? (active.audio.channels[0]?.length ?? 0) / active.audio.sampleRate : 0

  // Decoded buffers are cached per source; a re-render must not rebuild them.
  useEffect(() => {
    buffersRef.current.clear()
    setPosition(0)
    offsetRef.current = 0
  }, [sources])

  useEffect(() => {
    if (!sources.some((entry) => entry.id === activeId)) setActiveId(sources[0]?.id ?? '')
  }, [activeId, sources])

  const bufferFor = useCallback((entry: PreviewSource) => {
    const cached = buffersRef.current.get(entry.id)
    if (cached) return cached
    const buffer = toAudioBuffer(entry.audio, getAudioContext())
    buffersRef.current.set(entry.id, buffer)
    return buffer
  }, [])

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.onended = null
      try {
        sourceRef.current.stop()
      } catch {
        /* already ended */
      }
      sourceRef.current = null
    }
    cancelAnimationFrame(frameRef.current)
  }, [])

  /**
   * Advances the playhead.
   *
   * Deliberately not once per frame: every update re-renders this component and
   * the waveform under it, and sixty of those a second is enough to make the
   * whole page stutter. Twenty is smooth to look at and costs a third as much.
   */
  const tick = useCallback(() => {
    frameRef.current = requestAnimationFrame(tick)

    const now = performance.now()
    if (now - lastPaintRef.current < 50) return
    lastPaintRef.current = now

    const context = getAudioContext()
    const elapsed = context.currentTime - startedAtRef.current + offsetRef.current
    setPosition(Math.min(duration, Math.max(0, elapsed)))
  }, [duration])

  const play = useCallback(
    (from = offsetRef.current) => {
      if (!active) return
      void resumeAudioContext()
      stopSource()

      const context = getAudioContext()
      const node = context.createBufferSource()
      node.buffer = bufferFor(active)
      node.connect(context.destination)
      const start = from >= duration - 0.01 ? 0 : from
      node.start(0, start)

      sourceRef.current = node
      offsetRef.current = start
      startedAtRef.current = context.currentTime
      setPlaying(true)

      node.onended = () => {
        if (sourceRef.current !== node) return
        sourceRef.current = null
        cancelAnimationFrame(frameRef.current)
        setPlaying(false)
        setPosition(0)
        offsetRef.current = 0
      }

      cancelAnimationFrame(frameRef.current)
      lastPaintRef.current = 0
      frameRef.current = requestAnimationFrame(tick)
    },
    [active, bufferFor, duration, stopSource, tick],
  )

  const pause = useCallback(() => {
    if (!sourceRef.current) return
    const context = getAudioContext()
    offsetRef.current = Math.min(duration, context.currentTime - startedAtRef.current + offsetRef.current)
    stopSource()
    setPlaying(false)
    setPosition(offsetRef.current)
  }, [duration, stopSource])

  // Switching A/B keeps the playhead, which is the whole point of an A/B.
  const switchTo = (id: string) => {
    if (id === activeId) return
    const wasPlaying = playing
    if (wasPlaying) pause()
    setActiveId(id)
    if (wasPlaying) {
      // Wait for the new source to be the active one before starting it.
      requestAnimationFrame(() => play(offsetRef.current))
    }
  }

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return
    const box = event.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
    const target = fraction * duration
    offsetRef.current = target
    setPosition(target)
    if (playing) play(target)
  }

  useEffect(() => stopSource, [stopSource])

  if (!active) return null

  return (
    <div className={`flex flex-col gap-[9px] ${className}`}>
      {waveHeight > 0 ? (
        <div
          onClick={seek}
          role="presentation"
          className="cursor-pointer rounded-nav bg-panel-soft px-[9px] py-[7px]"
          title="Klicken zum Springen"
        >
          <Waveform audio={active.audio} height={waveHeight} position={position || null} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-[9px]">
        <button
          type="button"
          onClick={() => (playing ? pause() : play())}
          aria-label={playing ? 'Pause' : 'Abspielen'}
          className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-pill bg-ink text-on-ink transition-colors hover:bg-ink-hover"
        >
          {playing ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" />
            </svg>
          )}
        </button>

        <span className="numeric shrink-0 text-[12px] text-muted">
          {formatTimecode(position)} / {formatTimecode(duration)}
        </span>

        {sources.length > 1 ? (
          <div role="radiogroup" aria-label="Vergleich" className="ml-auto flex gap-[3px] rounded-pill bg-raised p-[3px]">
            {sources.map((entry) => {
              const isActive = entry.id === active.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => switchTo(entry.id)}
                  className={`rounded-pill px-[11px] py-[5px] text-[12px] transition-colors ${
                    isActive ? 'bg-ink text-on-ink' : 'text-ink hover:bg-panel-mid'
                  }`}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
