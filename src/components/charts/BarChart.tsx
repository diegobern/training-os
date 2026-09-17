import { useState } from 'react'

export interface BarDatum {
  label: string
  value: number
  /** Optional reference line, e.g. a weekly set target. */
  target?: number
  hint?: string
}

/**
 * Horizontal bars. One hue, magnitude encoded by length — the bar already says
 * "more", so colour carries nothing extra and stays a single accent.
 */
export function BarChart({
  data,
  formatValue,
  ariaLabel,
  targetLabel,
}: {
  data: BarDatum[]
  formatValue: (v: number) => string
  ariaLabel: string
  targetLabel?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.target ?? 0)))

  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        const tpct = d.target ? (d.target / max) * 100 : null
        const isActive = active === i
        return (
          <div
            key={d.label}
            className="group"
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onPointerDown={() => setActive(i)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-secondary text-muted">{d.label}</span>
              <span className="tnum shrink-0 text-secondary font-semibold text-ink">{formatValue(d.value)}</span>
            </div>
            <div className="relative h-2.5 w-full overflow-visible rounded-[4px] bg-elevated">
              <div
                className="h-full rounded-r-[4px] bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, opacity: isActive ? 1 : 0.9 }}
              />
              {tpct !== null && (
                <div
                  className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded bg-ink/45"
                  style={{ left: `calc(${tpct}% - 1px)` }}
                  title={targetLabel}
                />
              )}
            </div>
            {isActive && d.hint && <p className="mt-1 text-caption text-faint">{d.hint}</p>}
          </div>
        )
      })}
      {targetLabel && data.some((d) => d.target) && (
        <p className="mt-1 flex items-center gap-1.5 text-caption text-faint">
          <span className="inline-block h-3 w-[2px] rounded bg-ink/45" />
          {targetLabel}
        </p>
      )}
    </div>
  )
}
