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
 *
 * What this replaced, and why: a numbered index in the voice of a calibration
 * certificate — "Prüfgegenstand", "Verfügbare Verfahren", a clause number on
 * every heading, and an empty three-row form as the first thing a visitor
 * met. The measuring metaphor belongs in how numbers are reported, not in the
 * words on the door. A start screen's whole job is to make the next move
 * obvious, and thirty identically weighted rows under an official heading did
 * the opposite.
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/shallow'

import { useFilePicker } from '../hooks/useIngest'
import { ACTIONS, GROUP_LABEL, searchActions, type ToolAction, type ToolGroup } from '../lib/actions'
import { IN_DESKTOP_APP, WINDOWS_SETUP } from '../lib/desktop'
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
 * One tool, as a tile.
 *
 * A tint rather than a box: the tile needs an edge to read as a tile, and a
 * filled shape gives it one without a rule on four sides or a shadow under
 * it. Hover deepens the tint, so the whole tile is visibly one target rather
 * than a heading with a clickable area around it.
 *
 * The hint is `prose`, not `muted`, and that is a measurement rather than a
 * preference: on the tile's own tint `muted` came out at APCA Lc 59.3 in the
 * dark theme against a Lc 60 floor for secondary text. The paler tint that
 * would have rescued it is the one that made the tiles invisible on warm
 * paper, so the text moved instead of the surface.
 */
function Tool({
  anchor,
  icon,
  label,
  hint,
  onClick,
  dimmed = false,
}: {
  anchor: string
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
  dimmed?: boolean
}) {
  return (
    <button
      id={`v-${anchor}`}
      type="button"
      onClick={onClick}
      className="press group flex scroll-mt-[96px] flex-col items-start gap-[4px] bg-panel-mid p-[12px] text-left transition-colors duration-[var(--dur-fast)] hover:bg-panel-strong sm:gap-[6px] sm:p-[16px]"
    >
      {/* When a tool needs a kind of file the session does not hold, the icon
          says so quietly. Fading the whole tile was the first attempt and it
          measured at APCA Lc 48 against a Lc 60 target — a legibility cost
          paid for a hint the empty state already gives. */}
      <span
        className={`transition-colors duration-[var(--dur-fast)] ${
          dimmed ? 'text-faint' : 'text-ink'
        }`}
      >
        {icon}
      </span>
      <span className="text-small font-semibold leading-[1.3] text-ink">{label}</span>
      <span className="text-small leading-[1.4] text-prose">{hint}</span>
    </button>
  )
}

/** A group of tools: a quiet title over its own grid of tiles. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[12px]">
      <h3 className="border-t border-line pt-[12px] text-body font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      {/* More desk means more doors visible at once, not wider doors: a tile
          carries a label and a hint, and stretching it to 500px only adds
          empty tile. */}
      <div className="grid grid-cols-2 gap-[8px] lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
  // it just has nothing to chew on yet, and saying so quietly beats hiding it
  // and leaving someone to wonder where it went.
  //
  // Through `useShallow` and a `useMemo`, not `new Set(...)` inside the
  // selector: zustand compares what a selector returns by identity, and a
  // fresh Set on every read is a fresh identity on every read — which is a
  // render loop, and React stops that with "maximum update depth exceeded"
  // rather than letting the tab hang.
  const kinds = useSession(useShallow((state) => state.assets.map((asset) => asset.kind)))
  const have = useMemo(() => new Set(kinds), [kinds])

  return (
    <div className="flex flex-col gap-[24px] sm:gap-[32px]">
      {picker.input}

      {/* -- the way in ----------------------------------------------------- */}
      <section className="flex flex-col gap-[16px]">
        {active ? (
          /* Once a file is open it is the subject of the screen, so it is
             stated in one line rather than in a form with blank fields. */
          <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[4px]">
            <span className="value max-w-full truncate text-body text-ink">{active.name}</span>
            <span className="text-small text-muted">
              {KIND_LABEL[active.kind]}
              {assets > 1 ? ` · ${assets} Dateien in der Sitzung` : ''}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            <h2 className="display-md">Ton, Video und Bilder bearbeiten</h2>
            <p className="text-body leading-[1.55] text-muted">
              Alles rechnet in diesem Tab. Ihre Dateien werden nirgendwohin hochgeladen, und mit dem
              Schließen des Tabs ist alles weg.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
          <OpenFileButton size="md" />
          <span className="hidden text-small text-muted sm:inline">oder ins Fenster ziehen</span>
          <button
            type="button"
            onClick={() => setPanel('downloader')}
            className="press text-small text-ink underline underline-offset-[3px] hover:no-underline"
          >
            Von einer Adresse laden
          </button>
        </div>

        {/* The desktop app, one step down from the way in: its own line under
            a rule, a ruled button rather than a filled one — the filled one
            stays the single thing to do here. On a phone too: hidden there, it
            was missed by the very people looking for it, who often find the
            site on the phone and install on the computer later. Only inside
            the app itself is it left out. */}
        {IN_DESKTOP_APP ? null : (
          <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] border-t border-line pt-[16px]">
            <a
              href={WINDOWS_SETUP}
              rel="noopener"
              className="press inline-flex items-center gap-[8px] bg-raised px-[12px] py-[8px] text-small font-medium text-ink ring-1 ring-inset ring-rule hover:bg-panel-soft"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                <path
                  d="M8 2.5v7.5M4.8 6.8 8 10l3.2-3.2M3 13h10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Sondra für Windows herunterladen
            </a>
            <span className="text-small text-muted">
              Eigenes Fenster, läuft ohne Browser · ohne Administratorrechte
            </span>
          </div>
        )}
      </section>

      {/* -- everything else, grouped --------------------------------------- */}
      <div className="flex flex-col gap-[16px]">
        {!searching ? <h2 className="display-md">Werkzeuge</h2> : null}
        {/* A one-line field has no business being 1840px wide. */}
        <div className="relative max-w-[720px]">
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
            placeholder="Werkzeug suchen — „mp3 aus video“, „tonart“, „bild kleiner“ …"
            aria-label="Werkzeugliste filtern"
            className="value w-full border-0 bg-raised py-[10px] pl-[40px] pr-[16px] text-small text-prose outline-none ring-1 ring-inset ring-line placeholder:font-sans placeholder:text-muted focus:ring-ink"
          />
        </div>

        <div className="flex flex-col gap-[24px]">
          {grouped
            .filter(({ group }) => searching || group !== 'holen')
            .map(({ group, actions }) => (
              <Section key={group} title={GROUP_LABEL[group]}>
                {actions.map((action) => (
                  <Tool
                    key={action.id}
                    anchor={action.id}
                    icon={<ToolIcon>{ICONS[action.panel]}</ToolIcon>}
                    label={action.label}
                    hint={action.hint}
                    // Only worth dimming once dimming distinguishes something.
                    // On an empty session every tool is equally unusable, and
                    // greying out the entire page says nothing while making
                    // all of it harder to read.
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
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-small text-muted">
          Nichts gefunden für <span className="value text-ink">{query}</span>. Versuchen Sie es mit
          einem Format („mp3“, „webp“, „gif“) oder mit dem, was herauskommen soll.
        </p>
      ) : null}
    </div>
  )
}
