import { useState } from 'react'

export interface Column {
  label: string
  value: number
  sub?: string
}

/** Compact columns for "last N weeks/months" style comparisons. */
export function ColumnChart({
  data,
  formatValue,
  ariaLabel,
  height = 120,
}: {
  data: Column[]
  formatValue: (v: number) => string
  ariaLabel: string
  height?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 24)
          const isActive = active === i
          return (
            <button
              key={d.label + i}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              style={{ height }}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onClick={() => setActive(i)}
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            >
              {isActive && (
                <span className="tnum -mb-1 rounded bg-elevated px-1.5 py-0.5 text-2xs font-semibold text-ink">
                  {formatValue(d.value)}
                </span>
              )}
              <span
                className="w-full max-w-[24px] rounded-t-[4px] bg-accent transition-all duration-300"
                style={{ height: Math.max(h, d.value > 0 ? 3 : 1), opacity: isActive ? 1 : 0.85 }}
              />
              <span className="w-full truncate text-center text-2xs text-faint">{d.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
