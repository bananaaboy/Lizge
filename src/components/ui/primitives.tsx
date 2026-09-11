/**
 * The component vocabulary for the whole app.
 *
 * The design system it implements is flat by rule: depth comes from stacking
 * tinted panels (cream → keylime → mint → sage → slate), never from shadows, and
 * Forest Ink is reserved for text and filled actions so it stays the only
 * saturated colour on the page.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type Tone = 'cream' | 'keylime' | 'mint' | 'sage' | 'slate'

const TONE_CLASS: Record<Tone, string> = {
  cream: 'bg-cream-paper',
  keylime: 'bg-keylime-wash',
  mint: 'bg-mint-veil',
  sage: 'bg-sage-mist',
  slate: 'bg-slate-hush',
}

export function Card({
  tone = 'keylime',
  padded = true,
  className = '',
  children,
}: {
  tone?: Tone
  padded?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`rounded-card ${TONE_CLASS[tone]} ${padded ? 'p-7 sm:p-[28px]' : ''} ${className}`}>
      {children}
    </div>
  )
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
    tone === 'forest' ? 'bg-forest-ink text-cream-paper' : 'bg-cream-paper text-forest-ink'
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
    primary: 'bg-forest-ink text-cream-paper hover:bg-forest-shadow',
    quiet: 'bg-cream-paper text-forest-ink hover:bg-mint-veil',
    ghost: 'bg-transparent text-forest-ink hover:bg-cream-paper',
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-ink">{label}</span>
      {children}
      {hint ? <span className="text-[12px] leading-[1.5] text-charcoal/60">{hint}</span> : null}
    </label>
  )
}

const CONTROL =
  'w-full rounded-nav border-0 bg-cream-paper px-[14px] py-[11px] text-body text-charcoal outline-none ring-1 ring-inset ring-border-mist focus:ring-forest-ink'

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
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-ink">{label}</span>
        <span className="numeric text-[13px] text-charcoal">{display}</span>
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
          checked ? 'bg-forest-ink' : 'bg-forest-ink/20'
        }`}
      >
        <span
          className={`h-[14px] w-[14px] rounded-pill bg-cream-paper transition-transform ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body text-charcoal">{label}</span>
        {hint ? <span className="text-[12px] leading-[1.45] text-charcoal/60">{hint}</span> : null}
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
          <span className="text-[12px] text-charcoal/70">{label}</span>
          {percent !== null ? <span className="numeric text-[12px] text-forest-ink">{percent}%</span> : null}
        </div>
      ) : null}
      <div
        className="h-[3px] w-full overflow-hidden rounded-pill bg-forest-ink/15"
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-pill bg-forest-ink transition-[width] duration-200 ${
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-ink/70">{label}</span>
      <span
        className={`numeric ${emphasis ? 'font-display text-[28px] font-light leading-none' : 'text-subheading'} text-forest-ink`}
      >
        {value}
      </span>
      {note ? <span className="text-[12px] leading-[1.4] text-charcoal/60">{note}</span> : null}
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
    info: 'ring-border-mist',
    warn: 'ring-forest-ink/25',
    error: 'ring-forest-ink/45',
  }[tone]
  return (
    <div className={`rounded-card bg-cream-paper p-[21px] text-[13px] leading-[1.55] ring-1 ring-inset ${ring}`}>
      {title ? <p className="mb-1.5 font-semibold text-forest-ink">{title}</p> : null}
      <div className="text-charcoal/80">{children}</div>
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
