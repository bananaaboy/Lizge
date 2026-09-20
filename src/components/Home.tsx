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
 * One procedure, as a numbered line of the index.
 *
 * The number is the point, and it is the reason this is allowed to carry one
 * at all: it is an address. Every procedure can be linked to, quoted and
 * jumped to, the way you cite a clause rather than describing where on the
 * page you saw it. A number that only decorated the row would be a habit; one
 * you can put in a URL is information.
 *
 * What it replaced: an even grid of identically sized cards, each with an icon
 * in a rounded square above its heading — the arrangement every generated
 * interface reaches for, and the arrangement that claims each of thirty items
 * is a headline.
 */
function Tool({
  clause,
  icon,
  label,
  hint,
  onClick,
  dimmed = false,
}: {
  clause: string
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
  dimmed?: boolean
}) {
  return (
    <button
      id={`v-${clause}`}
      type="button"
      onClick={onClick}
      className="press group flex scroll-mt-[96px] items-baseline gap-[12px] border-t border-line px-[4px] py-[10px] text-left hover:bg-panel-soft"
    >
      <span className="clause w-[4ch] shrink-0 text-muted transition-colors group-hover:text-ink">
        {clause}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[8px] text-small font-semibold leading-[1.3] text-ink">
          {/* When a procedure needs a kind of file the session does not hold,
              only the mark says so. Fading the whole row was the first attempt
              and it measured at APCA Lc 48 against a Lc 60 target — a
              legibility cost paid for a hint the empty state already gives. */}
          <span
            className={`transition-colors duration-[var(--dur-fast)] group-hover:text-ink ${
              dimmed ? 'text-faint' : 'text-muted'
            }`}
          >
            {icon}
          </span>
          {label}
        </span>
        <span className="mt-[2px] block text-small leading-[1.4] text-muted">{hint}</span>
      </span>
    </button>
  )
}

/**
 * How the object under test gets onto the sheet.
 *
 * Section 1 of a certificate is always the same question — what is being
 * examined — so these two stay large while the thirty procedures stay a list.
 */
function Entry({
  clause,
  icon,
  label,
  hint,
  onClick,
}: {
  clause: string
  icon: ReactNode
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex items-start gap-[12px] border-t-2 border-rule px-[4px] py-[16px] text-left hover:bg-panel-soft"
    >
      <span className="clause w-[4ch] shrink-0 text-ink">{clause}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-[8px] text-subheading font-semibold text-ink">
          {icon}
          {label}
        </span>
        <span className="mt-[4px] block text-small leading-[1.45] text-muted">{hint}</span>
      </span>
    </button>
  )
}

function Section({ clause, title, children }: { clause: string; title: string; children: ReactNode }) {
  return (
    <section id={`v-${clause}`} className="flex scroll-mt-[96px] flex-col">
      <h3 className="flex items-baseline gap-[12px] border-t-2 border-rule px-[4px] pb-[4px] pt-[12px]">
        <span className="clause w-[4ch] shrink-0 text-ink">{clause}</span>
        <span className="text-small font-semibold tracking-[-0.005em] text-ink">{title}</span>
      </h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3">{children}</div>
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
      {/* -- clause 1: what is being examined ------------------------------- */}
      <section id="v-1" className="flex scroll-mt-[96px] flex-col gap-[16px]">
        <div className="flex flex-col gap-[16px]">
          <div className="min-w-0">
            <h2 className="flex items-baseline gap-[12px]">
              <span className="clause w-[4ch] shrink-0 text-ink">1</span>
              <span className="display-md">Prüfgegenstand</span>
            </h2>
            {/* The object under test, stated as the form states it: the field
                is either filled or visibly blank. */}
            <dl className="mt-[12px] flex flex-col pl-[calc(4ch+12px)] text-small">
              <div className="flex items-baseline gap-[12px] border-t border-line py-[6px]">
                <dt className="w-[14ch] shrink-0 text-muted">Datei</dt>
                <dd className="value min-w-0 flex-1 truncate text-ink">
                  {active ? active.name : <span className="text-muted">— keine geöffnet</span>}
                </dd>
              </div>
              <div className="flex items-baseline gap-[12px] border-t border-line py-[6px]">
                <dt className="w-[14ch] shrink-0 text-muted">Art</dt>
                <dd className="value min-w-0 flex-1 text-ink">
                  {active ? KIND_LABEL[active.kind] : <span className="text-muted">—</span>}
                </dd>
              </div>
              <div className="flex items-baseline gap-[12px] border-t border-line py-[6px]">
                <dt className="w-[14ch] shrink-0 text-muted">In der Sitzung</dt>
                <dd className="value min-w-0 flex-1 text-ink">
                  {assets > 0 ? `${assets}` : <span className="text-muted">0</span>}
                </dd>
              </div>
            </dl>
          </div>
            {/* The one thing this clause is asking for, at its foot and lined
                up with the values above it — where a form puts the line you
                sign after the fields you filled. */}
            <div className="mt-[12px] flex flex-wrap items-center gap-x-[12px] gap-y-[8px] pl-[calc(4ch+12px)]">
              <OpenFileButton size="md" />
              <span className="text-small text-muted">oder ins Fenster ziehen</span>
            </div>
        </div>
      </section>

      {/* -- getting something in ------------------------------------------- */}
      {picker.input}
      {!searching ? (
        <section id="v-2" className="scroll-mt-[96px]">
          <h2 className="flex items-baseline gap-[12px] px-[4px] pb-[4px]">
            <span className="clause w-[4ch] shrink-0 text-ink">2</span>
            <span className="display-sm">Wie der Prüfgegenstand hereinkommt</span>
          </h2>
          <div className="grid sm:grid-cols-2">
            <Entry
              clause="2.1"
              icon={<ToolIcon>{ICONS.images}</ToolIcon>}
              label="Datei vom Gerät öffnen"
              hint="Ton, Video, Bild. Wird nirgendwohin hochgeladen."
              onClick={picker.open}
            />
            <Entry
              clause="2.2"
              icon={<ToolIcon>{ICONS.downloader}</ToolIcon>}
              label="Von einer Adresse laden"
              hint="YouTube und direkte Datei-Adressen. Dieser eine Schritt läuft über einen Dienst."
              onClick={() => setPanel('downloader')}
            />
          </div>
        </section>
      ) : null}

      {/* -- everything else, grouped --------------------------------------- */}
      <div className="flex flex-col gap-[12px]">
        {!searching ? (
          <h2 id="v-3" className="flex scroll-mt-[96px] items-baseline gap-[12px] px-[4px]">
            <span className="clause w-[4ch] shrink-0 text-ink">3</span>
            <span className="display-sm">Verfügbare Verfahren</span>
          </h2>
        ) : null}
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
            placeholder="Verfahren suchen — „mp3 aus video“, „tonart“, „bild kleiner“ …"
            aria-label="Verfahren suchen"
            className="value w-full border-0 bg-raised py-[10px] pl-[40px] pr-[16px] text-small text-prose outline-none ring-1 ring-inset ring-line placeholder:font-sans placeholder:text-muted focus:ring-ink"
          />
        </div>
      </div>

      {grouped
        .filter(({ group }) => searching || group !== 'holen')
        .map(({ group, actions }, groupIndex) => (
          <Section key={group} clause={`3.${groupIndex + 1}`} title={GROUP_LABEL[group]}>
            {actions.map((action, index) => (
              <Tool
                key={action.id}
                clause={`3.${groupIndex + 1}.${index + 1}`}
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
        <p className="border-t border-line px-[4px] py-[16px] text-small text-muted">
          Nichts gefunden für <span className="value text-ink">{query}</span>. Versuchen Sie es mit
          einem Format („mp3“, „webp“, „gif“) oder mit dem, was herauskommen soll.
        </p>
      ) : null}
    </div>
  )
}
