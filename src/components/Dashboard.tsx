/**
 * The working surface: panel switcher, capability readout and activity log.
 */

import { useEffect, useState } from 'react'

import { detectCapabilities, hasWebGpuAdapter, suggestedThreads } from '../lib/capabilities'
import { loadFfmpeg, onFfmpegStatus, type FfmpegStatus } from '../lib/ffmpegClient'
import { useSession, type PanelId } from '../state/store'
import { ConverterPanel } from './panels/ConverterPanel'
import { DownloaderPanel } from './panels/DownloaderPanel'
import { NormalizePanel } from './panels/NormalizePanel'
import { SamplerPanel } from './panels/SamplerPanel'
import { StemsPanel } from './panels/StemsPanel'
import { Badge, Button, Card, Eyebrow } from './ui/primitives'

const PANELS: { id: PanelId; label: string; summary: string }[] = [
  { id: 'downloader', label: 'Downloader', summary: 'Direkte Links und HLS-Streams' },
  { id: 'converter', label: 'Konverter', summary: 'Formate über FFmpeg WASM' },
  { id: 'stems', label: 'Spuren', summary: 'Gesang, Schlagzeug, Bass, Rest' },
  { id: 'normalize', label: 'Lautheit', summary: 'EBU R128 messen und angleichen' },
  { id: 'sampler', label: 'Sampler', summary: 'Schneiden, loopen, transponieren' },
]

function PanelTabs() {
  const panel = useSession((state) => state.panel)
  const setPanel = useSession((state) => state.setPanel)

  return (
    <div
      role="tablist"
      aria-label="Werkzeuge"
      className="flex gap-[7px] overflow-x-auto rounded-card bg-cream-paper p-[7px] ring-1 ring-inset ring-border-mist"
    >
      {PANELS.map((entry) => {
        const active = entry.id === panel
        return (
          <button
            key={entry.id}
            role="tab"
            aria-selected={active}
            onClick={() => setPanel(entry.id)}
            className={`shrink-0 rounded-nav px-[18px] py-[11px] text-body transition-colors ${
              active ? 'bg-forest-ink text-cream-paper' : 'text-charcoal hover:bg-keylime-wash'
            }`}
          >
            {entry.label}
          </button>
        )
      })}
    </div>
  )
}

/** What this particular browser can and cannot do, stated plainly. */
function CapabilityStrip() {
  const [webgpu, setWebgpu] = useState<boolean | null>(null)
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus>({ loaded: false, multiThreaded: false, threads: 1 })
  const caps = detectCapabilities()

  useEffect(() => {
    void hasWebGpuAdapter().then(setWebgpu)
  }, [])

  // The core can be loaded from any panel, so the strip listens rather than polls.
  useEffect(() => onFfmpegStatus(setFfmpeg), [])

  const entries = [
    {
      label: 'Isolation',
      value: caps.crossOriginIsolated ? 'aktiv' : 'fehlt',
      note: caps.crossOriginIsolated
        ? 'SharedArrayBuffer verfügbar, FFmpeg läuft mehrfädig'
        : 'FFmpeg läuft einfädig und damit langsamer',
    },
    { label: 'Kerne', value: String(caps.cores), note: `${suggestedThreads(caps)} für Rechenarbeit` },
    {
      label: 'WebGPU',
      value: webgpu === null ? 'wird geprüft' : webgpu ? 'vorhanden' : 'nicht vorhanden',
      note: 'Für neuronale Spurentrennung',
    },
    {
      label: 'Dateisystem',
      value: caps.fileSystemAccess ? 'vorhanden' : 'nicht vorhanden',
      note: caps.fileSystemAccess ? 'Downloads gehen direkt auf die Platte' : 'Downloads laufen über den Speicher',
    },
    {
      label: 'FFmpeg',
      value: ffmpeg.loaded ? 'geladen' : 'nicht geladen',
      note: ffmpeg.loaded
        ? `${ffmpeg.multiThreaded ? `mehrfädig, ${ffmpeg.threads} Threads` : 'einfädig'}`
        : 'wird bei Bedarf geholt',
    },
  ]

  return (
    <Card tone="sage">
      <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
        <Eyebrow>Dieser Browser</Eyebrow>
        {!ffmpeg.loaded ? (
          <Button size="sm" variant="quiet" onClick={() => void loadFfmpeg()}>
            FFmpeg jetzt laden
          </Button>
        ) : null}
      </div>
      <dl className="mt-[21px] grid gap-[21px] sm:grid-cols-3 lg:grid-cols-5">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-[4px]">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-ink/70">
              {entry.label}
            </dt>
            <dd className="text-subheading text-forest-ink">{entry.value}</dd>
            <p className="text-[12px] leading-[1.4] text-charcoal/65">{entry.note}</p>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function ActivityLog() {
  const logs = useSession((state) => state.logs)
  const clearLogs = useSession((state) => state.clearLogs)
  const [open, setOpen] = useState(false)

  return (
    <Card tone="cream" className="ring-1 ring-inset ring-border-mist">
      <div className="flex flex-wrap items-center justify-between gap-[14px]">
        <div className="flex items-center gap-[11px]">
          <Eyebrow>Protokoll</Eyebrow>
          <Badge>{logs.length}</Badge>
        </div>
        <div className="flex gap-[7px]">
          <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
            {open ? 'Einklappen' : 'Anzeigen'}
          </Button>
          {logs.length ? (
            <Button size="sm" variant="ghost" onClick={clearLogs}>
              Leeren
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-[18px] max-h-[260px] overflow-y-auto rounded-card bg-keylime-wash p-[18px]">
          {logs.length === 0 ? (
            <p className="text-[13px] text-charcoal/60">Noch keine Einträge.</p>
          ) : (
            <ol className="flex flex-col gap-[7px] font-mono text-[12px] leading-[1.5]">
              {logs
                .slice()
                .reverse()
                .map((line) => (
                  <li key={line.id} className="flex gap-[11px]">
                    <span className="numeric shrink-0 text-charcoal/45">
                      {new Date(line.at).toLocaleTimeString('de-DE')}
                    </span>
                    <span className="shrink-0 text-forest-ink">{line.scope}</span>
                    <span
                      className={
                        line.level === 'error'
                          ? 'text-forest-ink'
                          : line.level === 'warn'
                            ? 'text-charcoal'
                            : 'text-charcoal/75'
                      }
                    >
                      {line.message}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </div>
      ) : null}
    </Card>
  )
}

export function Dashboard() {
  const panel = useSession((state) => state.panel)
  const current = PANELS.find((entry) => entry.id === panel)

  return (
    <section id="studio" className="shell flex flex-col gap-[21px] py-[56px] sm:py-[76px]">
      <div className="flex flex-col gap-[14px]">
        <Eyebrow>Studio</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-[21px]">
          <h2 className="display-lg max-w-[16ch]">Fünf Werkzeuge, ein Tab</h2>
          <p className="max-w-[38ch] text-body leading-[1.6] text-charcoal/70">{current?.summary}</p>
        </div>
      </div>

      <PanelTabs />

      <div role="tabpanel" aria-label={current?.label}>
        {panel === 'downloader' ? <DownloaderPanel /> : null}
        {panel === 'converter' ? <ConverterPanel /> : null}
        {panel === 'stems' ? <StemsPanel /> : null}
        {panel === 'normalize' ? <NormalizePanel /> : null}
        {panel === 'sampler' ? <SamplerPanel /> : null}
      </div>

      <CapabilityStrip />
      <ActivityLog />
    </section>
  )
}
