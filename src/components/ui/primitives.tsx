import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconChevronDown, IconX } from './Icon'
import { haptic, primeAudio } from '../../lib/feedback'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const VARIANT: Record<Variant, string> = {
  // The brand fill: volt on dark, near-black carrying volt type on light.
  primary: 'bg-brand text-brand-ink hover:opacity-90 active:opacity-80 font-bold shadow-card',
  secondary: 'bg-elevated text-ink border border-line hover:border-line-strong',
  ghost: 'text-muted hover:text-ink hover:bg-elevated',
  outline: 'border border-line-strong text-ink hover:bg-elevated',
  danger: 'bg-down/10 text-down border border-down/30 hover:bg-down/20',
}

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-secondary rounded-lg gap-1.5',
  md: 'h-11 px-4 text-body rounded-xl gap-2',
  lg: 'h-13 px-5 text-body rounded-xl gap-2',
  xl: 'h-[3.75rem] px-6 text-card rounded-2xl gap-2.5 tracking-wide',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
  icon?: ReactNode
  hapticOnPress?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', full, icon, className, children, onClick, hapticOnPress = true, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'press inline-flex select-none items-center justify-center font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      onClick={(e) => {
        if (hapticOnPress) haptic('tick')
        primeAudio()
        onClick?.(e)
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

/* -------------------------------------------------------------- IconButton */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tone?: 'default' | 'danger' | 'accent'
  size?: 'sm' | 'md'
}

export function IconButton({ label, tone = 'default', size = 'md', className, children, onClick, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        haptic('tick')
        onClick?.(e)
      }}
      className={cx(
        'press inline-flex shrink-0 items-center justify-center rounded-xl transition-colors duration-150 disabled:opacity-40',
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        tone === 'danger'
          ? 'text-down hover:bg-down/10'
          : tone === 'accent'
            ? 'text-accent hover:bg-accent/10'
            : 'text-muted hover:bg-elevated hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-sm mt-lg flex items-end justify-between gap-3 first:mt-0">
      <h2 className="label-xs min-w-0 break-words">{children}</h2>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------- Input */

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useRef(`f-${Math.random().toString(36).slice(2, 8)}`)
  const inputId = id ?? autoId.current
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label-micro mb-1.5 block">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cx(
          'h-12 w-full rounded-xl border border-line bg-elevated px-3.5 text-body text-ink placeholder:text-faint/70 transition-colors focus:border-accent/60',
          error && 'border-down/60',
          className,
        )}
        {...rest}
      />
      {hint && !error && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-down">{error}</p>}
    </div>
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }>(
  function TextArea({ label, hint, className, id, ...rest }, ref) {
    const autoId = useRef(`t-${Math.random().toString(36).slice(2, 8)}`)
    const tid = id ?? autoId.current
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={tid} className="label-micro mb-1.5 block">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={tid}
          rows={3}
          className={cx(
            'w-full resize-y rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-body leading-relaxed text-ink placeholder:text-faint/70 transition-colors focus:border-accent/60',
            className,
          )}
          {...rest}
        />
        {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
      </div>
    )
  },
)

/* ------------------------------------------------------------------ Select */

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div className={cx('w-full', className)}>
      {label && <span className="label-micro mb-1.5 block">{label}</span>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-12 w-full appearance-none rounded-xl border border-line bg-elevated px-3.5 pr-10 text-body text-ink focus:border-accent"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Switch */

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic('tick')
        onChange(!checked)
      }}
      className="flex w-full items-center justify-between gap-4 py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-body text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-caption leading-snug text-faint">{hint}</span>}
      </span>
      <span
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-out',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}

/* ------------------------------------------------------- SegmentedControl */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cx('inline-flex w-full rounded-xl border border-line bg-surface p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => {
              haptic('tick')
              onChange(o.value)
            }}
            className={cx(
              'flex-1 rounded-lg font-semibold transition-colors duration-150',
              size === 'sm' ? 'h-9 text-xs' : 'h-10 text-sm',
              active ? 'bg-brand text-brand-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------- Chip */

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic('tick')
        onClick?.()
      }}
      className={cx('chip press', active && 'chip-active', className)}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------- Sheet */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'auto',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'auto' | 'full'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative flex w-full animate-sheet-up flex-col overflow-hidden border-line bg-surface shadow-lift sm:max-w-lg sm:animate-scale-in sm:rounded-3xl sm:border',
          size === 'full' ? 'h-[92dvh] rounded-t-3xl border-t' : 'max-h-[88dvh] rounded-t-3xl border-t',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="mx-auto absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-line sm:hidden" />
          <h3 className="truncate pt-1 text-base font-bold tracking-tight">{title}</h3>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <IconX size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-surface px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ----------------------------------------------------------------- Confirm */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {body && <p className="text-body text-muted">{body}</p>}
      <div className="mt-5 flex gap-2">
        <Button full variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button full variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <h3 className="text-base font-bold tracking-tight text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* --------------------------------------------------------------- StatTile */

export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'accent' | 'up' | 'down' | 'pr'
  className?: string
}) {
  const toneCls =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'up'
        ? 'text-up'
        : tone === 'down'
          ? 'text-down'
          : tone === 'pr'
            ? 'text-pr'
            : 'text-ink'
  return (
    <div className={cx('card flex min-w-0 flex-col px-3.5 py-3', className)}>
      {/* `break-words` matters: a long word such as "Entrenamientos" in a
          one-third-width tile has nowhere to wrap and would otherwise spill
          straight out of the card. */}
      <p className="label-micro min-w-0 break-words hyphens-auto">{label}</p>
      <p className={cx('mt-1.5 min-w-0 break-words text-metric', toneCls)}>{value}</p>
      {sub && <p className="mt-1.5 min-w-0 break-words text-caption leading-tight text-faint">{sub}</p>}
    </div>
  )
}

/* -------------------------------------------------------------- Checkbox */

export function CheckPill({ checked, onClick, label, disabled }: { checked: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all duration-150',
        checked
          ? 'border-brand bg-brand text-brand-ink'
          : 'border-line bg-elevated text-faint hover:border-accent/40 hover:text-muted',
        disabled && 'opacity-40',
      )}
    >
      <IconCheck size={20} strokeWidth={2.5} />
    </button>
  )
}
