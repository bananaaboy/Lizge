/**
 * The component vocabulary for the whole app.
 *
 * The design system it implements is flat by rule: depth comes from stacking
 * tinted panels (cream → keylime → mint → sage → slate), never from shadows, and
 * Forest Ink is reserved for text and filled actions so it stays the only
 * saturated colour on the page.
 */

import { useEffect, useRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type Tone = 'cream' | 'keylime' | 'mint' | 'sage' | 'slate'

const TONE_CLASS: Record<Tone, string> = {
  cream: 'bg-raised',
  keylime: 'bg-panel-soft',
  mint: 'bg-panel-mid',
  sage: 'bg-panel-strong',
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
  const padding = !padded ? '' : size === 'compact' ? 'p-[18px] sm:p-[21px]' : 'p-7 sm:p-[28px]'
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
      className={`inline-flex items-center gap-1.5 rounded-pill px-[14px] py-[7px] text-[12px] leading-none ${styles} ${className}`}
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
    'inline-flex items-center justify-center gap-2 rounded-card font-sans transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40'
  const sizes = size === 'sm' ? 'px-[14px] py-[9px] text-[13px]' : 'px-[21px] py-[14px] text-body'
  const variants = {
    primary: 'bg-ink text-on-ink hover:bg-ink-hover',
    quiet: 'bg-raised text-ink hover:bg-panel-mid',
    ghost: 'bg-transparent text-ink hover:bg-raised',
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
    <label className={`flex flex-col gap-[7px] ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">{label}</span>
      {children}
      {hint ? <span className="text-[12px] leading-[1.5] text-muted">{hint}</span> : null}
    </label>
  )
}

const CONTROL =
  'w-full rounded-nav border-0 bg-raised px-[14px] py-[11px] text-body text-prose outline-none ring-1 ring-inset ring-line focus:ring-ink'

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
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">{label}</span>
        <span className="numeric text-[13px] text-prose">{display}</span>
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
      className="flex w-full items-start gap-[14px] rounded-nav text-left disabled:opacity-40"
    >
      <span
        className={`mt-0.5 flex h-[20px] w-[34px] shrink-0 items-center rounded-pill p-[3px] transition-colors ${
          checked ? 'bg-ink' : 'bg-ink/20'
        }`}
      >
        <span
          className={`h-[14px] w-[14px] rounded-pill bg-raised transition-transform ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body text-prose">{label}</span>
        {hint ? <span className="text-[12px] leading-[1.45] text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}

export function Progress({ value, label }: { value: number | null; label?: string }) {
  const percent = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="flex flex-col gap-[7px]">
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-muted">{label}</span>
          {percent !== null ? <span className="numeric text-[12px] text-ink">{percent}%</span> : null}
        </div>
      ) : null}
      <div
        className="h-[3px] w-full overflow-hidden rounded-pill bg-ink/15"
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-pill bg-ink transition-[width] duration-200 ${
            percent === null ? 'w-1/3 pulse-dot' : ''
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/70">{label}</span>
      <span
        className={`numeric ${emphasis ? 'font-display text-[28px] font-light leading-none' : 'text-subheading'} text-ink`}
      >
        {value}
      </span>
      {note ? <span className="text-[12px] leading-[1.4] text-muted">{note}</span> : null}
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
    warn: 'ring-ink/25',
    error: 'ring-ink/45',
  }[tone]
  return (
    <div className={`rounded-card bg-raised p-[21px] text-[13px] leading-[1.55] ring-1 ring-inset ${ring}`}>
      {title ? <p className="mb-1.5 font-semibold text-ink">{title}</p> : null}
      <div className="text-prose/85">{children}</div>
    </div>
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
        <div className="flex items-center justify-between gap-[14px] border-b border-line px-[28px] py-[21px]">
          <p className="text-subheading text-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-nav p-[6px] text-muted transition-colors hover:text-ink"
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
