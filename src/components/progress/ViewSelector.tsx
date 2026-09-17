import { useState, type ReactNode } from 'react'
import { Sheet, cx } from '../ui/primitives'
import { IconCheck, IconChevronDown } from '../ui/Icon'
import { haptic } from '../../lib/feedback'
import { useT } from '../../store/useApp'

export interface ViewOption<T extends string> {
  value: T
  labelKey: string
  icon: ReactNode
}

/**
 * The view switcher that sits at the top of Progress.
 *
 * Statistics, records, the calendar and body tracking used to live at the
 * bottom of a long scroll; they are primary destinations, so they belong in a
 * control you can reach without scrolling at all. A native <select> would be
 * one tap too, but it cannot carry icons or a selected state, and on mobile it
 * hands the whole thing to a system picker that looks nothing like the app.
 */
export function ViewSelector<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: ViewOption<T>[]
  label: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value) ?? options[0]

  return (
    <>
      <button
        onClick={() => {
          haptic('tick')
          setOpen(true)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="press flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left shadow-card transition-colors hover:border-line-strong"
      >
        <span className="shrink-0 text-accent">{current.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-bold uppercase tracking-[0.1em] text-faint">{label}</span>
          <span className="block truncate text-card text-ink">{t(current.labelKey)}</span>
        </span>
        <IconChevronDown size={20} className="shrink-0 text-muted" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-col">
          {options.map((o, i) => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                onClick={() => {
                  haptic('tick')
                  onChange(o.value)
                  setOpen(false)
                }}
                className={cx(
                  'press flex items-center gap-3 rounded-xl px-2 py-3.5 text-left transition-colors',
                  i > 0 && 'border-t border-line',
                  active ? 'text-accent' : 'text-ink hover:bg-elevated',
                )}
                aria-current={active}
              >
                <span className={cx('shrink-0', active ? 'text-accent' : 'text-muted')}>{o.icon}</span>
                <span className="min-w-0 flex-1 truncate text-body font-medium">{t(o.labelKey)}</span>
                {active && <IconCheck size={18} className="shrink-0" />}
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}
