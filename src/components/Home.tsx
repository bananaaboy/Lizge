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

/**
 * One way in, as a row rather than a card.
 *
 * The first version of this was the template every generated interface reaches
 * for: an icon in a rounded square, a bold label under it, a grey line under
 * that, boxed, repeated in an even four-column grid of identical heights. It
 * is a feature-card wall, and this is not a feature-card wall — it is a menu
 * of thirty things, which is a list. So the icon sits on the label line where
 * it belongs, the boxes are gone, and the hairlines between rows come from the
 * grid gap showing the surface underneath. Denser, faster to scan, and it
 * stops claiming that each of the thirty is a headline.
 */
function Tool({
  icon,
  label,
  hint,
  onClick,
  dimmed = false,
}: {
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
  dimmed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The separator is a 1px outline rather than a border or a grid gap.
      // A gap showing the surface below draws the lines for free but paints
      // the *empty* cells at the end of a group too, which came out as a grey
      // placeholder slab. Outlines are drawn outside the box, so neighbours
      // overlap into a single hairline, the outer ring clips the rest, and a
      // cell that does not exist draws nothing.
      className="press group flex flex-col items-start gap-[4px] outline outline-1 outline-line bg-raised px-[16px] py-[12px] text-left hover:bg-panel-soft"
    >
      <span className="flex items-center gap-[8px] text-small font-semibold leading-[1.3] text-ink">
        {/* When the tool needs a kind of file the session does not hold, only
            the icon says so. Fading the whole row was the first attempt and it
            measured at APCA Lc 48 against a Lc 60 target — a legibility cost
            paid for a hint, on a row that works perfectly well anyway: every
            panel opens on its own drop zone. */}
        <span
          className={`transition-colors duration-[var(--dur-fast)] group-hover:text-ink ${
            dimmed ? 'text-muted/45' : 'text-muted'
          }`}
        >
          {icon}
        </span>
        {label}
      </span>
      <span className="text-small leading-[1.4] text-muted">{hint}</span>
    </button>
  )
}

/** The two ways a file gets here. These *are* headlines, so they stay big. */
function Entry({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tile flex flex-col items-start gap-[8px] rounded-card bg-panel-soft p-[20px] text-left ring-1 ring-inset ring-ink/15"
    >
      <span className="flex items-center gap-[8px] text-subheading text-ink">
        {icon}
        {label}
      </span>
      <span className="text-small leading-[1.45] text-muted">{hint}</span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[8px]">
      <h3 className="eyebrow">{title}</h3>
      <div className="grid overflow-hidden rounded-card bg-raised ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
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
    <div className="flex flex-col gap-[24px]">
      {/* -- the opening question ------------------------------------------ */}
      <div className="flex flex-col gap-[16px] rounded-card bg-raised p-[24px] ring-1 ring-inset ring-line elevate sm:p-[28px]">
        <div className="flex flex-col gap-[16px] sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="display-md">Was möchten Sie machen?</p>
            <p className="mt-[8px] max-w-[54ch] text-body leading-[1.55] text-prose/85">
              {active
                ? `Offen: ${active.name} — ${KIND_LABEL[active.kind]}. Wählen Sie eine Kachel, oder tippen Sie, was Sie suchen.`
                : 'Öffnen Sie eine Datei, oder holen Sie sich eine über eine Adresse. Gerechnet wird auf Ihrem Gerät.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-[8px]">
            <OpenFileButton size="md" />
            <span className="text-small text-muted">
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
            className="w-full rounded-pill border-0 bg-panel-soft py-[12px] pl-[40px] pr-[16px] text-body text-prose outline-none ring-1 ring-inset ring-line placeholder:text-muted focus:ring-ink"
          />
        </div>
      </div>

      {/* -- getting something in ------------------------------------------- */}
      {picker.input}
      {!searching ? (
        <section className="grid gap-[12px] sm:grid-cols-2">
          <Entry
            icon={<ToolIcon>{ICONS.images}</ToolIcon>}
            label="Datei vom Gerät öffnen"
            hint="Ton, Video, Bild. Wird nirgendwohin hochgeladen."
            onClick={picker.open}
          />
          <Entry
            icon={<ToolIcon>{ICONS.downloader}</ToolIcon>}
            label="Von einer Adresse laden"
            hint="YouTube und direkte Datei-Adressen. Dieser eine Schritt läuft über einen Dienst."
            onClick={() => setPanel('downloader')}
          />
        </section>
      ) : null}

      {/* -- everything else, grouped --------------------------------------- */}
      {grouped
        .filter(({ group }) => searching || group !== 'holen')
        .map(({ group, actions }) => (
          <Section key={group} title={GROUP_LABEL[group]}>
            {actions.map((action) => (
              <Tool
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
        <p className="rounded-card bg-raised p-[24px] text-center text-small text-muted ring-1 ring-inset ring-line">
          Nichts gefunden für „{query}“. Versuchen Sie es mit einem Format („mp3“, „webp“, „gif“)
          oder mit dem, was herauskommen soll.
        </p>
      ) : null}
    </div>
  )
}
