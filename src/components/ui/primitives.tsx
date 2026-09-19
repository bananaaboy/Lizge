/**
 * The component vocabulary for the whole app.
 *
 * Two rules hold the system together. Depth is one step deep: a cream card
 * lifts off the canvas with a single soft shadow, and everything tinted
 * (keylime → mint → sage → slate) nests inside it flat. And Forest Ink is
 * reserved for text, filled actions and the focus ring, so the one saturated
 * colour on the page is always pointing at something you can do.
 */

import { useEffect, useRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type Tone = 'cream' | 'keylime' | 'mint' | 'sage' | 'slate'

/**
 * Two kinds of surface, and the tone says which.
 *
 * `cream` and `keylime` are cards: white, hairlined, lifted, sitting directly
 * on the canvas. The other three are blocks nested inside a card — tinted, flat,
 * no border — and are never the outermost thing on a screen. The previous
 * arrangement made the tool card a pale green almost exactly the value of the
 * canvas behind it, so the main working surface had no edge at all.
 */
const TONE_CLASS: Record<Tone, string> = {
  cream: 'bg-raised ring-1 ring-inset ring-line elevate',
  keylime: 'bg-raised ring-1 ring-inset ring-line elevate',
  mint: 'bg-panel-soft',
  sage: 'bg-panel-mid',
  slate: 'bg-panel-cool',
}

export function Card({
  tone = 'keylime',
  padded = true,
  size = 'default',
  className = '',
  children,
}: {
  tone?: Tone
  padded?: boolean
  /** `compact` trades some of the system's breathing room for density. */
  size?: 'default' | 'compact'
  className?: string
  children: ReactNode
}) {
  const padding = !padded ? '' : size === 'compact' ? 'p-[16px] sm:p-[20px]' : 'p-[24px] sm:p-[24px]'
  return <div className={`rounded-card ${TONE_CLASS[tone]} ${padding} ${className}`}>{children}</div>
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

export function Badge({
  children,
  tone = 'cream',
  className = '',
}: {
  children: ReactNode
  tone?: 'cream' | 'forest'
  className?: string
}) {
  const styles =
    tone === 'forest' ? 'bg-ink text-on-ink' : 'bg-raised text-ink'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-[16px] py-[8px] text-small leading-none ${styles} ${className}`}
    >
      {children}
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'ghost'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const base =
    'press inline-flex items-center justify-center gap-2 rounded-card font-sans disabled:cursor-not-allowed disabled:opacity-40'
  const sizes = size === 'sm' ? 'px-[16px] py-[8px] text-small' : 'px-[20px] py-[12px] text-body'
  const variants = {
    primary: 'bg-ink text-on-ink hover:bg-ink-hover elevate',
    quiet: 'bg-raised text-ink ring-1 ring-inset ring-line hover:bg-panel-soft',
    ghost: 'bg-transparent text-ink hover:bg-panel-soft',
  }[variant]

  return <button className={`${base} ${sizes} ${variants} ${className}`} {...props} />
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-[8px] ${className}`}>
      <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink">{label}</span>
      {children}
      {hint ? <span className="text-small leading-[1.5] text-muted">{hint}</span> : null}
    </label>
  )
}

const CONTROL =
  'w-full rounded-nav border-0 bg-raised px-[16px] py-[12px] text-body text-prose outline-none ring-1 ring-inset ring-line focus:ring-ink'

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} appearance-none pr-9 ${className}`} {...props} />
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />
}

export function Slider({
  label,
  value,
  display,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; display: string }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink">{label}</span>
        <span className="numeric text-small text-prose">{display}</span>
      </div>
      <input type="range" {...props} />
    </div>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="press group flex w-full items-start gap-[16px] rounded-nav text-left disabled:opacity-40"
    >
      <span
        className={`mt-0.5 flex h-[20px] w-[34px] shrink-0 items-center rounded-pill p-[4px] transition-colors duration-[var(--dur-fast)] ${
          checked ? 'bg-ink' : 'bg-muted/35 group-hover:bg-muted/50'
        }`}
      >
        <span
          className={`h-[14px] w-[14px] rounded-pill bg-raised shadow-sm transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body text-prose">{label}</span>
        {hint ? <span className="text-small leading-[1.45] text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}

export function Progress({ value, label }: { value: number | null; label?: string }) {
  const percent = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="flex flex-col gap-[8px]">
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-small text-muted">{label}</span>
          {percent !== null ? <span className="numeric text-small text-ink">{percent}%</span> : null}
        </div>
      ) : null}
      <div
        className="h-[4px] w-full overflow-hidden rounded-pill bg-ink/12"
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-pill bg-ink transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)] ${
            percent === null ? 'sondra-drift w-1/3' : ''
          }`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** A labelled figure. Numbers live here rather than in running prose. */
export function Stat({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string
  value: string
  note?: string
  emphasis?: boolean
}) {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink/70">{label}</span>
      <span
        className={`numeric pop ${emphasis ? 'font-display text-[31px] font-light leading-none' : 'text-subheading'} text-ink`}
      >
        {value}
      </span>
      {note ? <span className="text-small leading-[1.4] text-muted">{note}</span> : null}
    </div>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'error'
  title?: string
  children: ReactNode
}) {
  const ring = {
    info: 'ring-line',
    warn: 'ring-ink/30',
    error: 'ring-ink/55',
  }[tone]
  return (
    <div
      className={`rise rounded-card bg-raised p-[16px] text-small leading-[1.55] ring-1 ring-inset ${ring}`}
    >
      {title ? <p className="mb-1.5 font-semibold text-ink">{title}</p> : null}
      <div className="text-prose/85">{children}</div>
    </div>
  )
}

/**
 * Expert detail, folded away.
 *
 * Every tool here has a layer underneath it that the person who knows what
 * they are doing will want — the exact FFmpeg command, the analysis window,
 * the runner-up key. Showing it by default taxes everyone else for the whole
 * life of the app; hiding it behind a word costs one click, once.
 */
export function Reveal({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="press inline-flex cursor-pointer list-none items-center gap-[8px] rounded-nav text-small text-muted hover:text-ink">
        <svg
          viewBox="0 0 12 12"
          className="h-3 w-3 transition-transform duration-[var(--dur-fast)] group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4.5 2.5L8 6l-3.5 3.5" />
        </svg>
        {label}
      </summary>
      <div className="rise mt-[8px]">{children}</div>
    </details>
  )
}

export function ArrowRight({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`h-3.5 w-3.5 ${className}`} fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * A modal built on the platform's own `<dialog>`.
 *
 * Setup belongs behind a door rather than inline: it is read once, and leaving
 * it on the page pushed everything that gets used daily below the fold. The
 * native element brings the focus trap, the Escape key and the backdrop with
 * it, so none of that has to be reimplemented badly here.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself, never on its content.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      // Wide and tall enough that the content inside is not squeezed into a
      // column. A setup dialog that feels cramped reads as a warning label; this
      // one holds commands, switches and running text and needs room for all of
      // it, right up to the edges of a small window.
      className="m-auto w-[min(920px,calc(100vw-24px))] rounded-card bg-canvas p-0 text-prose backdrop:bg-ink/50 backdrop:backdrop-blur-[3px]"
    >
      <div className="flex max-h-[min(88vh,900px)] flex-col">
        <div className="flex items-center justify-between gap-[16px] border-b border-line px-[28px] py-[20px]">
          <p className="text-subheading text-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-nav p-[8px] text-muted transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[28px] py-[24px]">{children}</div>
      </div>
    </dialog>
  )
}
