/**
 * The frame around the tools: a header bar and a footer, nothing else.
 *
 * There is no landing page. Someone who opens this has a file to deal with, and
 * making them scroll past a pitch first would be rude. The one claim worth
 * stating up front — that nothing leaves the machine — is a chip in the header,
 * where it stays visible while they work rather than being read once and lost.
 */

import { useState } from 'react'

import type { InstallState } from '../hooks/useInstallPrompt'
import type { ThemeChoice } from '../lib/theme'
import { useSession } from '../state/store'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/primitives'

export function Logo() {
  return (
    <span className="flex items-center gap-[11px]">
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-ink" />
        <g className="stroke-canvas" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 12v8" />
          <path d="M16 8v16" />
          <path d="M20 11v10" />
          <path d="M24 14v4" />
        </g>
      </svg>
      <span className="font-display text-[23px] font-light tracking-[-0.01em] text-ink">Lizge</span>
    </span>
  )
}

/** Explains the privacy claim on demand, without occupying the page for it. */
function PrivacyChip() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-[7px] rounded-pill bg-panel-soft px-[14px] py-[7px] text-[12px] text-ink transition-colors hover:bg-panel-mid"
      >
        <span className="h-[6px] w-[6px] rounded-pill bg-ink" aria-hidden />
        Läuft lokal
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+7px)] z-20 w-[320px] rounded-card bg-raised p-[21px] text-[13px] leading-[1.55] text-prose/85 ring-1 ring-inset ring-line">
          <p className="mb-[11px] font-semibold text-ink">Wo Ihre Dateien bleiben</p>
          <p className="mb-[11px]">
            Der Server liefert einmal HTML, JavaScript und WebAssembly aus. Danach rechnet nur noch
            Ihr Gerät. Es gibt keinen Upload-Endpunkt, keine Datenbank und keine Speicherung über das
            Schließen des Tabs hinaus.
          </p>
          <p className="text-muted">
            Ausnahmen sind zwei Funktionen, die Sie ausdrücklich einschalten: der Downloader holt die
            Adresse, die Sie eingeben, und der Extraktions-Dienst leitet sie über einen fremden
            Server. Beides wird im Downloader benannt.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function Header({
  themeChoice,
  onThemeChange,
  install,
}: {
  themeChoice: ThemeChoice
  onThemeChange: (choice: ThemeChoice) => void
  install: InstallState
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
      <div className="shell flex flex-wrap items-center justify-between gap-[14px] py-[14px]">
        <Logo />
        <div className="flex items-center gap-[9px]">
          {install.available ? (
            <Button size="sm" variant="quiet" onClick={() => void install.install()}>
              Installieren
            </Button>
          ) : null}
          <PrivacyChip />
          <ThemeToggle choice={themeChoice} onChange={onThemeChange} />
        </div>
      </div>
    </header>
  )
}

/** Shown while a file is being dragged over the window. */
export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-canvas/80 backdrop-blur-sm"
    >
      <div className="rounded-card bg-panel-soft px-[42px] py-[35px] text-center ring-2 ring-inset ring-ink">
        <p className="display-sm">Loslassen zum Laden</p>
        <p className="mt-[7px] text-[13px] text-muted">Die Datei bleibt in diesem Tab.</p>
      </div>
    </div>
  )
}

/** Live reminder of what is currently held in memory, with a way to drop it. */
export function SessionBar() {
  const assets = useSession((state) => state.assets)
  const clearAssets = useSession((state) => state.clearAssets)
  if (assets.length === 0) return null

  const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0)
  return (
    <div className="shell pt-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-[11px] rounded-card bg-panel-mid px-[18px] py-[11px]">
        <p className="text-[13px] text-prose/85">
          {assets.length} {assets.length === 1 ? 'Datei' : 'Dateien'} im Arbeitsspeicher dieses Tabs ·{' '}
          {(totalBytes / 1024 / 1024).toFixed(1)} MB. Nichts davon wurde gesendet.
        </p>
        <Button size="sm" variant="quiet" onClick={clearAssets}>
          Speicher freigeben
        </Button>
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="shell mt-[42px] flex flex-wrap items-center justify-between gap-[14px] border-t border-line py-[28px] text-[12px] text-muted">
      <p className="max-w-[60ch] leading-[1.6]">
        Statisch ausgeliefert, lokal gerechnet. Quelloffene Bausteine: FFmpeg (WebAssembly), ONNX
        Runtime Web, Wavesurfer, Tone.js.
      </p>
      <p>Keine Uploads · keine Cookies · kein Tracking</p>
    </footer>
  )
}
