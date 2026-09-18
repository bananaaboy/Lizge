/**
 * The working surface: tool switcher, the tool, and the machine readout folded
 * away underneath it.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { detectCapabilities, hasWebGpuAdapter, suggestedThreads } from '../lib/capabilities'
import { onServiceConnection, serviceConnection, type ServiceConnection } from '../lib/serviceState'
import { loadFfmpeg, onFfmpegStatus, type FfmpegStatus } from '../lib/ffmpegClient'
import type { ResolvedTheme } from '../lib/theme'
import { useSession, type PanelId } from '../state/store'
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
import { OpenFileButton } from './AppShell'
import { Button, Card, Eyebrow } from './ui/primitives'

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every tool is named for the result, not for the technique.
 *
 * "Spuren", "Lautheit" and "Harmonie" are what these things are called by
 * people who already know what they are. Someone arriving with a recording and
 * a question does not know that yet, and a tab bar is the worst possible place
 * to learn vocabulary: it is the one control you have to use before you have
 * seen anything. So the label answers "what will this do for me" and the line
 * underneath it says it again in a full sentence.
 */
const PANELS: { id: PanelId; label: string; summary: string; icon: ReactNode }[] = [
  {
    id: 'downloader',
    label: 'Herunterladen',
    summary: 'Ein Video oder Lied von einer Adresse holen',
    icon: (
      <path d="M8 2.6v7.2m0 0L5.2 7M8 9.8L10.8 7M2.8 12.2h10.4" />
    ),
  },
  {
    id: 'converter',
    label: 'Umwandeln',
    summary: 'In ein anderes Dateiformat bringen — etwa Video zu MP3',
    icon: <path d="M2.6 5.4h9.2m0 0L9.4 3.1m2.4 2.3L9.4 7.7M13.4 10.6H4.2m0 0l2.4-2.3m-2.4 2.3l2.4 2.3" />,
  },
  {
    id: 'audio',
    label: 'Ton',
    summary: 'Schneiden, blenden, Pegel, Stille entfernen, Tonhöhe, Tempo',
    icon: <path d="M1.8 8h1.8l1.6-4.6 2.4 9.2 2-6.2 1.2 3.4h3" />,
  },
  {
    id: 'video',
    label: 'Video',
    summary: 'Schneiden, drehen, Ausschnitt, Tempo, Ton herauslösen',
    icon: <path d="M1.8 4.2h8.6v7.6H1.8zM10.4 7l3.8-2.2v6.4L10.4 9z" />,
  },
  {
    id: 'images',
    label: 'Bilder',
    summary: 'Skalieren, zuschneiden, umwandeln, viele auf einmal',
    icon: <path d="M2 3.2h12v9.6H2zM2 10l3.4-3.2 3 2.8 2.2-2 3.4 3.2M5.6 6.2a.9.9 0 100-1.8.9.9 0 000 1.8z" />,
  },
  {
    id: 'stems',
    label: 'Spuren trennen',
    summary: 'Gesang, Schlagzeug und Bass als einzelne Dateien',
    icon: <path d="M8 1.8L14 5 8 8.2 2 5zM2 8l6 3.2L14 8M2 11l6 3.2L14 11" />,
  },
  {
    id: 'normalize',
    label: 'Lautstärke',
    summary: 'So laut machen wie im Radio, ohne zu übersteuern',
    icon: <path d="M3.4 9.6V6.4M6.5 12V4M9.5 10.8V5.2M12.6 8.6V7.4" />,
  },
  {
    id: 'sampler',
    label: 'Zerschneiden',
    summary: 'In einzelne Schläge zerlegen und auf Tasten legen',
    icon: <path d="M3.4 2.8l7.4 9.2M12.6 2.8L5.2 12M4.3 13.2a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11.7 13.2a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
  },
  {
    id: 'harmony',
    label: 'Tonart',
    summary: 'Tonart, Tempo, Akkorde und die Melodie als MIDI',
    icon: <path d="M6 11.6V3.4l7-1.2v8.2M6 11.6a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM13 10.4a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0z" />,
  },
]

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

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
        className="elevate flex gap-[4px] overflow-x-auto rounded-card bg-raised p-[6px] ring-1 ring-inset ring-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PANELS.map((entry) => {
          const active = entry.id === panel
          return (
            <button
              key={entry.id}
              data-panel={entry.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setPanel(entry.id)}
              className={`press flex shrink-0 items-center gap-[8px] rounded-nav px-[14px] py-[10px] text-body ${
                active ? 'bg-ink text-on-ink' : 'text-prose hover:bg-panel-soft'
              }`}
              title={entry.summary}
            >
              <ToolIcon>{entry.icon}</ToolIcon>
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
      className={`press flex items-center gap-[7px] rounded-pill px-[12px] py-[6px] text-[12px] ${
        open === id ? 'bg-ink text-on-ink' : 'text-muted hover:bg-panel-soft hover:text-ink'
      }`}
    >
      {label}
      {count ? (
        <span
          className={`numeric rounded-pill px-[6px] text-[11px] ${
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
      <div className="flex flex-wrap items-center gap-[6px] border-t border-line pt-[12px]">
        <span className="mr-[4px] text-[12px] text-muted">Unter der Haube</span>
        {tab('system', 'Dieses Gerät')}
        {tab('log', 'Protokoll', logs.length)}
        {!ffmpeg.loaded ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void loadFfmpeg()}>
            FFmpeg jetzt laden
          </Button>
        ) : null}
      </div>

      {open === 'system' ? (
        <dl className="rise mt-[12px] grid gap-[16px] rounded-card bg-raised p-[18px] ring-1 ring-inset ring-line sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-[2px]">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {entry.label}
              </dt>
              <dd className="text-[14px] text-ink">{entry.value}</dd>
              <p className="text-[12px] leading-[1.45] text-muted">{entry.note}</p>
            </div>
          ))}
        </dl>
      ) : null}

      {open === 'log' ? (
        <div className="rise mt-[12px] rounded-card bg-raised p-[18px] ring-1 ring-inset ring-line">
          {logs.length === 0 ? (
            <p className="text-[13px] text-muted">Noch keine Einträge.</p>
          ) : (
            <>
              <div className="mb-[12px] flex justify-end">
                <button
                  type="button"
                  onClick={clearLogs}
                  className="press rounded-nav text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Leeren
                </button>
              </div>
              <ol className="flex max-h-[260px] flex-col gap-[6px] overflow-y-auto font-mono text-[12px] leading-[1.5]">
                {logs
                  .slice()
                  .reverse()
                  .map((line) => (
                    <li key={line.id} className="flex gap-[11px]">
                      <span className="numeric shrink-0 text-muted">
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
 * The first thing a first-time visitor sees.
 *
 * The downloader used to own this screen alone, which meant the opening move
 * the app offered was "paste a link" — and someone who already has the file on
 * their desk had no visible way in at all. The file picker was real, but it
 * lived inside a card that only rendered on the other five tabs.
 */
function FirstRun() {
  return (
    <Card tone="cream" className="rise">
      <div className="flex flex-col items-start gap-[18px] sm:flex-row sm:items-center sm:gap-[28px]">
        <div className="min-w-0 flex-1">
          <p className="display-sm">Womit fangen wir an?</p>
          <p className="mt-[6px] max-w-[52ch] text-body leading-[1.55] text-prose/85">
            Öffnen Sie eine Datei von Ihrem Gerät — oder holen Sie sie unten über eine Adresse.
            Gerechnet wird auf Ihrem Gerät; hochgeladen wird nichts.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-[6px]">
          <OpenFileButton size="md" />
          <span className="text-[12px] text-muted">oder Datei ins Fenster ziehen</span>
        </div>
      </div>
    </Card>
  )
}

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
      <div className="mx-auto flex max-w-[460px] flex-col items-center gap-[18px] text-center">
        <div>
          <Eyebrow>{label}</Eyebrow>
          <p className="mt-[7px] text-subheading text-ink">{summary}</p>
          <p className="mt-[8px] text-body leading-[1.55] text-prose/85">
            Dafür braucht es erst eine Datei. Alles, was Sie hinzufügen, bleibt in diesem Tab.
          </p>
        </div>

        <div className="w-full">
          <FileDrop />
        </div>

        <p className="text-[13px] text-muted">
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
  // The downloader is how files arrive, so it never waits for one.
  const ready =
    hasAssets || panel === 'downloader' || panel === 'video' || panel === 'images' || panel === 'audio'

  return (
    <section id="studio" className="shell flex flex-col gap-[16px] py-[18px]">
      <PanelTabs />

      {/* Keyed on the panel so every switch replays the entrance rather than
          swapping content in place, which reads as a jump. */}
      <div key={panel} role="tabpanel" aria-label={current?.label} className="rise flex flex-col gap-[16px]">
        {!hasAssets && panel === 'downloader' ? <FirstRun /> : null}
        {!ready ? (
          <NothingLoaded label={current?.label ?? ''} summary={current?.summary ?? ''} />
        ) : (
          <>
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
