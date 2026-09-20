/**
 * The frame around the tools: a header bar and a footer, nothing else.
 *
 * There is no landing page. Someone who opens this has a file to deal with, and
 * making them scroll past a pitch first would be rude. What the header owes them
 * instead is the two things they need in the first three seconds: a way to open
 * a file, and the claim that the file is not going anywhere.
 */

import { useState } from 'react'

import type { InstallState } from '../hooks/useInstallPrompt'
import { useFilePicker } from '../hooks/useIngest'
import type { ThemeChoice } from '../lib/theme'
import { detectCapabilities, suggestedThreads } from '../lib/capabilities'
import { useSession } from '../state/store'
import { PaletteHint } from './CommandPalette'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/primitives'

/**
 * The mark: one sound, sliced into layers that no longer line up.
 *
 * The bars follow the chords of a circle, so the silhouette is round, and the
 * middle ones are pushed sideways — the shape of something taken apart, which
 * is what every tool here does. Deliberately not a signal-strength fan or a
 * play triangle: this app never reaches for a network, and it is not a player.
 */
export function Mark({ className = 'h-[26px] w-[26px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 fill-current ${className}`} aria-hidden>
      <rect x="9" y="5.35" width="13.99" height="3.3" rx="1.65" />
      <rect x="7.73" y="9.85" width="20.95" height="3.3" rx="1.65" />
      <rect x="4.6" y="14.35" width="22.8" height="3.3" rx="1.65" />
      <rect x="3.33" y="18.85" width="20.95" height="3.3" rx="1.65" />
      <rect x="9" y="23.35" width="13.99" height="3.3" rx="1.65" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-[8px] text-ink">
      <Mark />
      <span className="font-wordmark text-[25px] font-light tracking-[-0.01em]">Sondra</span>
    </span>
  )
}

/** Opens the system file picker. Rendered wherever a file can be started from. */
export function OpenFileButton({
  variant = 'primary',
  size = 'sm',
  label = 'Datei öffnen',
  /** Drops the label below `sm`, where the header has no room for it. */
  collapse = false,
  className = '',
}: {
  variant?: 'primary' | 'quiet' | 'ghost'
  size?: 'sm' | 'md'
  label?: string
  collapse?: boolean
  className?: string
}) {
  const { input, open, busy } = useFilePicker('geöffnet')
  return (
    <>
      {input}
      <Button
        variant={variant}
        size={size}
        onClick={open}
        disabled={busy}
        aria-label={label}
        className={className}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path
            d="M2 5.2c0-.9.7-1.6 1.6-1.6h2.2L7.2 5h5.2c.9 0 1.6.7 1.6 1.6v4.6c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
        <span className={collapse ? 'hidden sm:inline' : undefined}>
          {busy ? 'Wird gelesen…' : label}
        </span>
      </Button>
    </>
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
        className="press flex items-center gap-[8px] bg-panel-soft px-[12px] py-[8px] text-small text-ink hover:bg-panel-mid"
      >
        <span className="h-[8px] w-[8px] bg-ink" aria-hidden />
        {/* A lone green dot says nothing. On a phone the claim shortens, it
            does not disappear — this is the one place the promise is made, and
            since there is now exactly one thing it does not cover, the badge
            counts it rather than letting the popover carry it alone. */}
        <span className="hidden sm:inline">Lokal · 1 Ausnahme</span>
        <span className="sm:hidden">Lokal · 1</span>
      </button>

      {open ? (
        <div className="rise elevate-lift absolute right-0 top-[calc(100%+9px)] z-20 w-[min(340px,calc(100vw-32px))] rounded-card bg-raised p-[20px] text-small leading-[1.55] text-prose/85 ring-1 ring-inset ring-line">
          <p className="mb-[12px] font-semibold text-ink">Wo Ihre Dateien bleiben</p>
          <p className="mb-[12px]">
            Der Server liefert einmal HTML, JavaScript und WebAssembly aus. Danach rechnet nur noch
            Ihr Gerät. Es gibt keinen Upload-Endpunkt, keine Datenbank und keine Speicherung über das
            Schließen des Tabs hinaus.
          </p>
          <p className="mb-[12px] text-muted">
            Die eine Ausnahme ist „Herunterladen“. Ein Browser darf eine Datei nicht von einer
            fremden Seite holen, also übernimmt das ein kleiner Dienst dieser Seite: er bekommt die
            Adresse, die Sie eingeben, und reicht die Datei durch. Ihre eigenen Dateien sieht er nie,
            und gespeichert wird dort nichts.
          </p>
          <p className="text-muted">
            Wer auch das nicht möchte, startet yt-dlp auf dem eigenen Rechner. Der Downloader zeigt
            unter „Mehr Wege“, wie. Dann geht wirklich alles hier.
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
  const hasAssets = useSession((state) => state.assets.length > 0)
  const threads = suggestedThreads(detectCapabilities())
  return (
    <header className="sticky top-0 z-30 border-b-2 border-rule bg-canvas/95 backdrop-blur-md">
      <div className="shell flex flex-wrap items-start justify-between gap-x-[24px] gap-y-[8px] py-[12px]">
        <div className="flex min-w-0 flex-col gap-[8px]">
          <Logo />
          {/* The head of a certificate names the instrument and the method
              before it states a single value. Here that is not decoration:
              which browser and how many cores it will use decides what the
              measurements below are worth. */}
          <dl className="flex flex-wrap gap-x-[20px] gap-y-[2px] text-micro leading-[1.5]">
            <div className="flex gap-[6px]">
              <dt className="text-muted">Gerät</dt>
              <dd className="value text-prose">dieser Browser</dd>
            </div>
            <div className="flex gap-[6px]">
              <dt className="text-muted">Verfahren</dt>
              <dd className="value text-prose">
                lokal · WebAssembly · {threads} {threads === 1 ? 'Kern' : 'Kerne'}
              </dd>
            </div>
            <div className="flex gap-[6px]">
              <dt className="text-muted">Stand</dt>
              <dd className="value text-prose">{new Date().toLocaleDateString('de-CH')}</dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center gap-[8px]">
          {install.available ? (
            <Button size="sm" variant="ghost" onClick={() => void install.install()} className="hidden md:inline-flex">
              Installieren
            </Button>
          ) : null}
          <PaletteHint />
          <PrivacyChip />
          <ThemeToggle choice={themeChoice} onChange={onThemeChange} />
          {hasAssets ? <OpenFileButton label="Weitere Datei" collapse /> : null}
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
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-canvas/85 backdrop-blur-sm"
    >
      <div className="pop elevate-lift rounded-card bg-raised px-[48px] py-[40px] text-center ring-2 ring-inset ring-ink">
        <Mark className="mx-auto mb-[16px] h-[36px] w-[36px] text-ink" />
        <p className="display-sm">Loslassen zum Öffnen</p>
        <p className="mt-[8px] text-small text-muted">Die Datei bleibt in diesem Tab.</p>
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
    <div className="shell pt-[16px]">
      <div className="rise flex flex-wrap items-center justify-between gap-[12px] rounded-card bg-panel-soft px-[16px] py-[8px] text-small">
        <p className="text-muted">
          <span className="value text-ink">{assets.length}</span>{' '}
          {assets.length === 1 ? 'Datei' : 'Dateien'} im Arbeitsspeicher dieses Tabs ·{' '}
          <span className="value">{(totalBytes / 1024 / 1024).toFixed(1)} MB</span> · nichts davon
          wurde gesendet
        </p>
        <button
          type="button"
          onClick={clearAssets}
          className="press rounded-nav text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Speicher freigeben
        </button>
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="shell mt-[36px] flex flex-wrap items-center justify-between gap-[16px] border-t border-line py-[24px] text-small text-muted">
      <p className="max-w-[60ch] leading-[1.6]">
        Statisch ausgeliefert, lokal gerechnet. Quelloffene Bausteine: FFmpeg (WebAssembly), ONNX
        Runtime Web, Wavesurfer, Tone.js.
      </p>
      <p>Keine Uploads · keine Cookies · kein Tracking</p>
    </footer>
  )
}
