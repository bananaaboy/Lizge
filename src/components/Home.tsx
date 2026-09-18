/**
 * The start screen: every capability as a tile, and a search box over all of
 * them.
 *
 * The app opened on the downloader, which made the first thing it said to a
 * new visitor "paste a link" — a reasonable answer to exactly one of the
 * thirty things it can do. Everything else was behind a tab bar that scrolls
 * sideways on a laptop, where a tool you have not used yet is a word you have
 * not read yet.
 *
 * Tiles fix that by simply showing the whole menu. There is nothing clever
 * here and that is the point: thirty labelled doors, grouped, searchable, with
 * the two ways of getting a file in raised to the top because nothing else
 * works until one of them has happened.
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/shallow'

import { useFilePicker } from '../hooks/useIngest'
import { ACTIONS, GROUP_LABEL, searchActions, type ToolAction, type ToolGroup } from '../lib/actions'
import { KIND_LABEL, useActiveAsset, useSession, type PanelId } from '../state/store'
import { OpenFileButton } from './AppShell'
import { PANELS, ToolIcon } from './panelMeta'

/* -------------------------------------------------------------------------- */

/** Every tile borrows the icon of the tool it opens. */
const ICONS: Record<PanelId, ReactNode> = Object.fromEntries(
  PANELS.map((panel) => [panel.id, panel.icon]),
) as Record<PanelId, ReactNode>

const GROUP_ORDER: ToolGroup[] = ['holen', 'bild', 'video', 'ton', 'musik']

function Tile({
  icon,
  label,
  hint,
  onClick,
  dimmed = false,
  accent = false,
}: {
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
  /** Applies to a file kind that is not in the session yet. */
  dimmed?: boolean
  /** The two ways in. */
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tile flex flex-col items-start gap-[9px] rounded-card p-[15px] text-left ring-1 ring-inset ${
        accent ? 'bg-panel-soft ring-ink/15' : 'bg-raised ring-line'
      } ${dimmed ? 'opacity-55' : ''}`}
    >
      <span
        className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-nav ${
          accent ? 'bg-ink text-on-ink' : 'bg-panel-soft text-ink'
        }`}
      >
        {icon}
      </span>
      <span className="text-[13.5px] font-semibold leading-[1.3] text-ink">{label}</span>
      <span className="text-[12px] leading-[1.45] text-muted">{hint}</span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[10px]">
      <h3 className="eyebrow">{title}</h3>
      <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

export function Home() {
  const setPanel = useSession((state) => state.setPanel)
  const assets = useSession((state) => state.assets.length)
  const active = useActiveAsset()
  const [query, setQuery] = useState('')
  const picker = useFilePicker('geöffnet')

  const matches = useMemo(() => (query.trim() ? searchActions(query) : ACTIONS), [query])

  const grouped = useMemo(() => {
    const map = new Map<ToolGroup, ToolAction[]>()
    for (const action of matches) {
      const list = map.get(action.group)
      if (list) list.push(action)
      else map.set(action.group, [action])
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
      group,
      actions: map.get(group) ?? [],
    }))
  }, [matches])

  const searching = query.trim().length > 0
  // A tool that needs a kind of file the session does not hold still works —
  // it just has nothing to chew on yet, and saying so quietly with opacity
  // beats hiding it and leaving someone to wonder where it went.
  //
  // Through `useShallow` and a `useMemo`, not `new Set(...)` inside the
  // selector: zustand compares what a selector returns by identity, and a
  // fresh Set on every read is a fresh identity on every read — which is a
  // render loop, and React stops that with "maximum update depth exceeded"
  // rather than letting the tab hang.
  const kinds = useSession(useShallow((state) => state.assets.map((asset) => asset.kind)))
  const have = useMemo(() => new Set(kinds), [kinds])

  return (
    <div className="flex flex-col gap-[26px]">
      {/* -- the opening question ------------------------------------------ */}
      <div className="flex flex-col gap-[16px] rounded-card bg-raised p-[22px] ring-1 ring-inset ring-line elevate sm:p-[28px]">
        <div className="flex flex-col gap-[14px] sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="display-md">Was möchten Sie machen?</p>
            <p className="mt-[6px] max-w-[54ch] text-body leading-[1.55] text-prose/85">
              {active
                ? `Offen: ${active.name} — ${KIND_LABEL[active.kind]}. Wählen Sie eine Kachel, oder tippen Sie, was Sie suchen.`
                : 'Öffnen Sie eine Datei, oder holen Sie sich eine über eine Adresse. Gerechnet wird auf Ihrem Gerät.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-[6px]">
            <OpenFileButton size="md" />
            <span className="text-[12px] text-muted">
              {assets > 0 ? `${assets} in der Sitzung` : 'oder ins Fenster ziehen'}
            </span>
          </div>
        </div>

        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="pointer-events-none absolute left-[14px] top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.4 10.4L14 14" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Suchen — „mp3 aus video“, „tonart“, „bild kleiner“ …"
            aria-label="Werkzeug suchen"
            className="w-full rounded-pill border-0 bg-panel-soft py-[13px] pl-[42px] pr-[14px] text-body text-prose outline-none ring-1 ring-inset ring-line placeholder:text-muted focus:ring-ink"
          />
        </div>
      </div>

      {/* -- getting something in ------------------------------------------- */}
      {picker.input}
      {!searching ? (
        <Section title="Zuerst eine Datei">
          <Tile
            accent
            icon={<ToolIcon>{ICONS.images}</ToolIcon>}
            label="Datei vom Gerät öffnen"
            hint="Ton, Video, Bild — wird nirgendwohin hochgeladen"
            onClick={picker.open}
          />
          <Tile
            accent
            icon={<ToolIcon>{ICONS.downloader}</ToolIcon>}
            label="Von einer Adresse laden"
            hint="YouTube und andere Portale — läuft über einen Dienst"
            onClick={() => setPanel('downloader')}
          />
        </Section>
      ) : null}

      {/* -- everything else, grouped --------------------------------------- */}
      {grouped
        .filter(({ group }) => searching || group !== 'holen')
        .map(({ group, actions }) => (
          <Section key={group} title={GROUP_LABEL[group]}>
            {actions.map((action) => (
              <Tile
                key={action.id}
                icon={<ToolIcon>{ICONS[action.panel]}</ToolIcon>}
                label={action.label}
                hint={action.hint}
                // Only worth dimming once dimming distinguishes something. On
                // an empty session every tool is equally unusable, and greying
                // out the entire page says nothing while making all of it
                // harder to read.
                dimmed={
                  have.size > 0 &&
                  action.kinds.length > 0 &&
                  !action.kinds.some((kind) => have.has(kind))
                }
                onClick={() => setPanel(action.panel)}
              />
            ))}
          </Section>
        ))}

      {grouped.length === 0 ? (
        <p className="rounded-card bg-raised p-[22px] text-center text-[13px] text-muted ring-1 ring-inset ring-line">
          Nichts gefunden für „{query}“. Versuchen Sie es mit einem Format — „mp3“, „webp“, „gif“ —
          oder mit dem, was herauskommen soll.
        </p>
      ) : null}
    </div>
  )
}
