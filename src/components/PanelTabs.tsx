/**
 * The tool switcher, as the second line of the header.
 *
 * It used to be a white box with a hairline ring, below a tinted session strip,
 * below the header — three bands before a tool said anything, and the box was
 * the loudest of them. Now it is text on the header's own ground: the chosen
 * tool in ink with a rule under it, the rest in prose. The header's bottom
 * rule is the only line; the tabs sit on it.
 */

import { useEffect, useRef } from 'react'

import { useSession } from '../state/store'
import { PANELS } from './panelMeta'

export function PanelTabs() {
  const panel = useSession((state) => state.panel)
  const setPanel = useSession((state) => state.setPanel)
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the selected tab in view when it changes from the keyboard or a tile.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-panel="${panel}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [panel])

  // A tablist answers to the arrow keys; tabbing through ten buttons to reach
  // the tool is not the way to switch.
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
    <div
      ref={listRef}
      role="tablist"
      aria-label="Werkzeuge"
      onKeyDown={onKeyDown}
      /* Runs to the screen edges on a phone, so a row cut off on the right
         reads as one you can swipe rather than as a broken box. */
      className="-mx-[16px] flex overflow-x-auto px-[16px] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
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
            title={entry.summary}
            className={`press relative shrink-0 px-[12px] pb-[10px] pt-[8px] text-small transition-colors duration-[var(--dur-fast)] first:pl-0 ${
              active ? 'font-semibold text-ink' : 'text-prose hover:text-ink'
            }`}
          >
            {entry.label}
            {/* The rule under the chosen tab lands on the header's own rule. */}
            <span
              aria-hidden
              className={`absolute bottom-[-2px] left-[12px] right-[12px] h-[2px] bg-ink transition-opacity duration-[var(--dur-fast)] [button:first-child>&]:left-0 ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
