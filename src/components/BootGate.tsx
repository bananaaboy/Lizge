/**
 * The door the app opens behind.
 *
 * Every tool here except the plain file reader goes through FFmpeg sooner or
 * later, and the core is thirty-odd megabytes. Loading it lazily meant the first
 * real action of a session stalled for half a minute with no explanation, which
 * reads as a broken page rather than a busy one. So it is fetched at startup,
 * out in the open, and the tools appear when it is there.
 *
 * Two things keep the wait honest. The bar shows bytes actually received, not a
 * spinner pretending. And a failure is not a locked door: most of this app —
 * stems, loudness, harmony, the chopper — never touches FFmpeg, so there is a
 * way past rather than a dead end.
 */

import { useEffect, useState, type ReactNode } from 'react'

import { formatBytes } from '../lib/format'
import { loadFfmpeg, onFfmpegBoot, type FfmpegBoot } from '../lib/ffmpegClient'
import { Button } from './ui/primitives'
import { Logo } from './AppShell'

/** The logo's bars, breathing. Motion says "working" better than a number. */
function Pulse() {
  const bars = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <g className="stroke-canvas" strokeWidth="2.4" strokeLinecap="round">
        {bars.map((index) => (
          <path key={index} d={`M${12 + index * 4} 16v0`}>
            <animate
              attributeName="d"
              values={`M${12 + index * 4} 13v6;M${12 + index * 4} 7v18;M${12 + index * 4} 13v6`}
              dur="1.4s"
              begin={`${index * 0.16}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
            />
          </path>
        ))}
      </g>
    </svg>
  )
}

export function BootGate({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<FfmpegBoot | null>(null)
  /** Set when the visitor decides not to wait, or to carry on after a failure. */
  const [dismissed, setDismissed] = useState(false)
  /**
   * This is a door, not a shutter: it opens once and stays open.
   *
   * The core is deliberately unloaded after some jobs — every media probe ends
   * with `unloadFfmpeg()`, and so does a failed run — which puts the boot state
   * back to "idle". Without this latch that reads as "not loaded yet" and the
   * loading screen swallows the whole app again, mid-session, over a file the
   * visitor had already opened. It reloads in the background when it is next
   * needed; there is nothing for anyone to wait for.
   */
  const [opened, setOpened] = useState(false)

  useEffect(() => onFfmpegBoot(setBoot), [])

  useEffect(() => {
    // Failures surface through the boot state; nothing to do with the rejection.
    void loadFfmpeg().catch(() => {})
  }, [])

  useEffect(() => {
    if (boot?.state === 'ready' || dismissed) setOpened(true)
  }, [boot?.state, dismissed])

  if (!boot || boot.state === 'ready' || dismissed || opened) return <>{children}</>

  const failed = boot.state === 'error'
  const fraction =
    boot.totalBytes && boot.totalBytes > 0
      ? Math.min(1, boot.receivedBytes / boot.totalBytes)
      : null

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[20px] bg-canvas px-[24px] py-[48px]">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-[20px] text-center">
        <Logo as="span" />

        {failed ? (
          <div className="w-full rounded-card bg-raised p-[20px] text-small leading-[1.55]">
            <p className="mb-[8px] font-semibold text-ink">{boot.message}</p>
            <p className="mb-[16px] text-prose/85">{boot.error}</p>
            <p className="mb-[16px] text-muted">
              Umwandeln und das Zusammenfügen geladener Teile brauchen FFmpeg. Spurentrennung,
              Lautheit, Chopper und Harmonie rechnen ohne — die gehen trotzdem.
            </p>
            <Button size="sm" onClick={() => setDismissed(true)}>
              Ohne FFmpeg fortfahren
            </Button>
          </div>
        ) : (
          <>
            <Pulse />

            <div className="w-full">
              <p className="text-body text-ink">{boot.message}</p>
              <p className="value mt-[4px] text-small text-muted">
                {boot.totalBytes
                  ? `${formatBytes(boot.receivedBytes)} von ${formatBytes(boot.totalBytes)}`
                  : formatBytes(boot.receivedBytes)}
              </p>
            </div>

            <div
              role="progressbar"
              aria-label="FFmpeg wird geladen"
              aria-valuemin={0}
              aria-valuemax={100}
              {...(fraction !== null ? { 'aria-valuenow': Math.round(fraction * 100) } : {})}
              className="h-[6px] w-full overflow-hidden bg-panel-mid"
            >
              <div
                className={`h-full bg-ink ${fraction === null ? 'sondra-drift w-1/3' : 'transition-[width] duration-200'}`}
                style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
              />
            </div>

            <p className="text-small leading-[1.5] text-muted">
              Einmal pro Gerät. Danach liegt FFmpeg im Zwischenspeicher des Browsers und die Seite
              startet sofort — auch ohne Netz.
            </p>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-nav text-small text-muted underline underline-offset-2 hover:text-ink"
            >
              Überspringen und ohne Umwandeln arbeiten
            </button>
          </>
        )}
      </div>
    </div>
  )
}
