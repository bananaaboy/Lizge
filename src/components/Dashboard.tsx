/**
 * The working surface: tool switcher, the tool, and the machine readout folded
 * away underneath it.
 */

import { useEffect, useRef, useState } from 'react'

import { detectCapabilities, hasWebGpuAdapter, suggestedThreads } from '../lib/capabilities'
import { onServiceConnection, serviceConnection, type ServiceConnection } from '../lib/serviceState'
import { loadFfmpeg, onFfmpegStatus, type FfmpegStatus } from '../lib/ffmpegClient'
import type { ResolvedTheme } from '../lib/theme'
import { useSession } from '../state/store'
import { ConverterPanel } from './panels/ConverterPanel'
import { HarmonyPanel } from './panels/HarmonyPanel'
import { DownloaderPanel } from './panels/DownloaderPanel'
import { NormalizePanel } from './panels/NormalizePanel'
import { SamplerPanel } from './panels/SamplerPanel'
import { StemsPanel } from './panels/StemsPanel'
import { VideoPanel } from './panels/VideoPanel'
import { ImagePanel } from './panels/ImagePanel'
import { AudioEditorPanel } from './panels/AudioEditorPanel'
import { FileDrop } from './FileDrop'
import { Home } from './Home'
import { PANELS } from './panelMeta'
import { Button, Card, ClauseHead } from './ui/primitives'

function PanelTabs() {
  const panel = useSession((state) => state.panel)
  const setPanel = useSession((state) => state.setPanel)
  const listRef = useRef<HTMLDivElement>(null)
  // Which edges still have tabs behind them, so the fades only appear where
  // there is something to scroll to.
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    const measure = () => {
      const slack = node.scrollWidth - node.clientWidth
      setEdges({ start: node.scrollLeft > 4, end: slack > 4 && node.scrollLeft < slack - 4 })
    }
    measure()
    node.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      node.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [])

  // Keep the selected tab in view when it changes from the keyboard.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-panel="${panel}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [panel])

  // Switching tools with the keyboard should not require tabbing through six
  // buttons; the arrow keys are what a tablist is expected to answer to.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const index = PANELS.findIndex((entry) => entry.id === panel)
    const next = PANELS[(index + delta + PANELS.length) % PANELS.length]
    setPanel(next.id)
    listRef.current?.querySelector<HTMLElement>(`[data-panel="${next.id}"]`)?.focus()
  }

  return (
    <div className="relative">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-[6px] left-[6px] z-10 w-[28px] rounded-l-card bg-gradient-to-r from-raised to-transparent transition-opacity duration-[var(--dur-fast)] ${
          edges.start ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-[6px] right-[6px] z-10 w-[28px] rounded-r-card bg-gradient-to-l from-raised to-transparent transition-opacity duration-[var(--dur-fast)] ${
          edges.end ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={listRef}
        role="tablist"
        aria-label="Werkzeuge"
        onKeyDown={onKeyDown}
        className="flex gap-[4px] overflow-x-auto bg-raised p-[4px] ring-1 ring-inset ring-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PANELS.map((entry, index) => {
          const active = entry.id === panel
          return (
            <button
              key={entry.id}
              data-panel={entry.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setPanel(entry.id)}
              className={`press flex shrink-0 items-center gap-[8px] rounded-nav px-[12px] py-[8px] text-small ${
                active ? 'bg-ink text-on-ink' : 'text-prose hover:bg-panel-soft'
              }`}
              title={entry.summary}
            >
              {/* The number is the clause's address for the eye. A screen
                  reader already gets the position from the tablist, so it
                  stays out of the accessible name. */}
              <span aria-hidden className={`clause ${active ? 'text-on-ink/70' : 'text-muted'}`}>
                {index + 1}
              </span>
              {entry.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Machine readout                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What this browser can do, and what the app has been doing.
 *
 * Both of these used to be full-width cards sitting under every tool on every
 * screen — a permanent reference table and an empty log, between the work and
 * the bottom of the page. Neither is needed while working and both are needed
 * when something goes wrong, which is the definition of a disclosure.
 */
function MachineRow() {
  const [open, setOpen] = useState<'system' | 'log' | null>(null)
  const [webgpu, setWebgpu] = useState<boolean | null>(null)
  const [service, setService] = useState<ServiceConnection>(serviceConnection)
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus>({ loaded: false, multiThreaded: false, threads: 1 })
  const logs = useSession((state) => state.logs)
  const clearLogs = useSession((state) => state.clearLogs)
  const caps = detectCapabilities()

  useEffect(() => {
    void hasWebGpuAdapter().then(setWebgpu)
  }, [])
  // The core can be loaded from any panel, so the row listens rather than polls.
  useEffect(() => onFfmpegStatus(setFfmpeg), [])
  // Same for the extraction service: answered here, on every tab, rather than
  // only inside the panel that happens to own the connection.
  useEffect(() => onServiceConnection(setService), [])

  const entries = [
    {
      label: 'Mehrkern-Rechnen',
      value: caps.crossOriginIsolated ? 'aktiv' : 'aus',
      note: caps.crossOriginIsolated
        ? `FFmpeg darf ${suggestedThreads(caps)} von ${caps.cores} Kernen nutzen`
        : 'FFmpeg läuft auf einem Kern und ist damit langsamer',
    },
    {
      label: 'Grafikkarte',
      value: webgpu === null ? 'wird geprüft' : webgpu ? 'nutzbar' : 'nicht nutzbar',
      note: 'Beschleunigt das Trennen von Spuren',
    },
    {
      label: 'Direkt speichern',
      value: caps.fileSystemAccess ? 'möglich' : 'nicht möglich',
      note: caps.fileSystemAccess
        ? 'Große Downloads gehen direkt auf die Festplatte'
        : 'Downloads laufen erst durch den Arbeitsspeicher',
    },
    {
      label: 'Dienst für Portale',
      value: service.info ? 'verbunden' : service.searching ? 'wird gesucht' : 'aus',
      note: service.info
        ? `${(service.endpoint ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')} · ${
            service.info.services.includes('youtube') ? 'YouTube geht' : 'ohne YouTube'
          }`
        : service.searching
          ? 'wartet auf eine Instanz auf diesem Rechner'
          : 'nur für YouTube und ähnliche Portale nötig',
    },
    {
      label: 'FFmpeg',
      value: ffmpeg.loaded ? 'geladen' : 'noch nicht geladen',
      note: ffmpeg.loaded
        ? ffmpeg.multiThreaded
          ? `mehrfädig, ${ffmpeg.threads} Threads`
          : 'einfädig'
        : 'wird beim ersten Umwandeln geholt',
    },
  ]

  const tab = (id: 'system' | 'log', label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setOpen((value) => (value === id ? null : id))}
      aria-expanded={open === id}
      className={`press flex items-center gap-[8px] px-[12px] py-[8px] text-small ${
        open === id ? 'bg-ink text-on-ink' : 'text-muted hover:bg-panel-soft hover:text-ink'
      }`}
    >
      {label}
      {count ? (
        <span
          className={`value px-[8px] text-micro ${
            open === id ? 'bg-on-ink/20' : 'bg-panel-mid text-ink'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  )

  return (
    <div className="mt-[4px]">
      <div className="flex flex-wrap items-center gap-[8px] border-t border-line pt-[12px]">
        <span className="mr-[4px] text-small text-muted">Prüfmittel und Protokoll</span>
        {tab('system', 'Dieses Gerät')}
        {tab('log', 'Protokoll', logs.length)}
        {!ffmpeg.loaded ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void loadFfmpeg()}>
            FFmpeg jetzt laden
          </Button>
        ) : null}
      </div>

      {open === 'system' ? (
        <dl className="rise mt-[12px] grid gap-[16px] rounded-card bg-raised p-[16px] ring-1 ring-inset ring-line sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-[2px]">
              <dt className="text-small font-semibold text-muted">
                {entry.label}
              </dt>
              <dd className="text-body text-ink">{entry.value}</dd>
              <p className="text-small leading-[1.45] text-muted">{entry.note}</p>
            </div>
          ))}
        </dl>
      ) : null}

      {open === 'log' ? (
        <div className="rise mt-[12px] rounded-card bg-raised p-[16px] ring-1 ring-inset ring-line">
          {logs.length === 0 ? (
            <p className="text-small text-muted">Noch keine Einträge.</p>
          ) : (
            <>
              <div className="mb-[12px] flex justify-end">
                <button
                  type="button"
                  onClick={clearLogs}
                  className="press rounded-nav text-small text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Leeren
                </button>
              </div>
              <ol className="flex max-h-[260px] flex-col gap-[8px] overflow-y-auto font-mono text-small leading-[1.5]">
                {logs
                  .slice()
                  .reverse()
                  .map((line) => (
                    <li key={line.id} className="flex gap-[12px]">
                      <span className="value shrink-0 text-muted">
                        {new Date(line.at).toLocaleTimeString('de-DE')}
                      </span>
                      <span className="shrink-0 text-ink">{line.scope}</span>
                      <span className={line.level === 'error' ? 'text-ink' : 'text-prose/85'}>
                        {line.message}
                      </span>
                    </li>
                  ))}
              </ol>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty states                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What a tool shows before it has anything to work on.
 *
 * Five panels used to answer this question five times over, and each of them
 * twice on the same screen: a drop zone in the middle, a second one in the
 * sidebar, and the library saying "nothing loaded" underneath. Three ways to do
 * one thing, surrounded by settings for material that did not exist.
 */
function NothingLoaded({ label, summary }: { label: string; summary: string }) {
  const setPanel = useSession((state) => state.setPanel)

  return (
    <Card tone="cream" className="rise">
      <div className="mx-auto flex max-w-[460px] flex-col items-center gap-[16px] text-center">
        <div>
          <ClauseHead>{label}</ClauseHead>
          <p className="mt-[8px] text-subheading text-ink">{summary}</p>
          <p className="mt-[8px] text-body leading-[1.55] text-prose/85">
            Dafür braucht es erst eine Datei. Alles, was Sie hinzufügen, bleibt in diesem Tab.
          </p>
        </div>

        <div className="w-full">
          <FileDrop />
        </div>

        <p className="text-small text-muted">
          Keine Datei zur Hand?{' '}
          <button
            type="button"
            onClick={() => setPanel('downloader')}
            className="press rounded-nav text-ink underline underline-offset-2"
          >
            Über eine Adresse herunterladen
          </button>
        </p>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

export function Dashboard({ theme }: { theme: ResolvedTheme }) {
  const panel = useSession((state) => state.panel)
  const hasAssets = useSession((state) => state.assets.length > 0)
  const current = PANELS.find((entry) => entry.id === panel)
  // The start screen and the downloader never wait for a file: one is the menu
  // and the other is how files arrive. The three editors open on their own
  // drop zone, which is a better empty state than a generic one.
  const ready =
    hasAssets ||
    panel === 'start' ||
    panel === 'downloader' ||
    panel === 'video' ||
    panel === 'images' ||
    panel === 'audio'

  return (
    <section id="studio" className="shell flex flex-col gap-[16px] py-[16px]">
      <PanelTabs />

      {/* Keyed on the panel so every switch replays the entrance rather than
          swapping content in place, which reads as a jump. */}
      <div key={panel} role="tabpanel" aria-label={current?.label} className="rise flex flex-col gap-[16px]">
        {!ready ? (
          <NothingLoaded label={current?.label ?? ''} summary={current?.summary ?? ''} />
        ) : (
          <>
            {panel === 'start' ? <Home /> : null}
            {panel === 'downloader' ? <DownloaderPanel /> : null}
            {panel === 'converter' ? <ConverterPanel /> : null}
            {panel === 'audio' ? <AudioEditorPanel /> : null}
            {panel === 'video' ? <VideoPanel /> : null}
            {panel === 'images' ? <ImagePanel /> : null}
            {panel === 'stems' ? <StemsPanel /> : null}
            {panel === 'normalize' ? <NormalizePanel /> : null}
            {panel === 'sampler' ? <SamplerPanel theme={theme} /> : null}
            {panel === 'harmony' ? <HarmonyPanel /> : null}
          </>
        )}
      </div>

      <MachineRow />
    </section>
  )
}
