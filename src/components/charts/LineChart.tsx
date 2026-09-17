import { useMemo, useRef, useState } from 'react'
import { useMeasure } from '../../hooks/useMeasure'

export interface Point {
  x: number
  y: number
}

export interface LineChartProps {
  points: Point[]
  /** Optional secondary line (e.g. a moving average). Drawn recessive. */
  baseline?: Point[]
  height?: number
  formatY: (v: number) => string
  formatX: (v: number) => string
  /** Extra line in the tooltip, e.g. "35 kg × 8". */
  tooltipDetail?: (p: Point, index: number) => string | null
  ariaLabel: string
  color?: string
  yZero?: boolean
}

const PAD = { top: 14, right: 14, bottom: 22, left: 44 }

/** Rounds a domain outwards to a readable step, so ticks read 30 / 60 / 90. */
function niceDomain(min: number, max: number, ticks = 2) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 1 }
  const raw = (max - min) / ticks || 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step }
}

export function LineChart({
  points,
  baseline,
  height = 200,
  formatY,
  formatX,
  tooltipDetail,
  ariaLabel,
  color = 'rgb(var(--c-accent))',
  yZero = false,
}: LineChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const gradId = useRef(`g${Math.random().toString(36).slice(2, 8)}`)

  const w = Math.max(width, 200)
  const innerW = w - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom

  const scale = useMemo(() => {
    const ys = points.map((p) => p.y)
    if (baseline) ys.push(...baseline.map((p) => p.y))
    let min = Math.min(...ys)
    let max = Math.max(...ys)
    if (yZero) min = Math.min(0, min)
    if (min === max) {
      min = min - Math.max(1, Math.abs(min) * 0.1)
      max = max + Math.max(1, Math.abs(max) * 0.1)
    } else {
      const pad = (max - min) * 0.12
      min -= pad
      max += pad
    }
    const nice = niceDomain(min, max, 2)
    min = nice.min
    max = nice.max
    const xs = points.map((p) => p.x)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const spanX = xMax - xMin || 1
    return {
      min,
      max,
      xMin,
      xMax,
      px: (x: number) => PAD.left + ((x - xMin) / spanX) * innerW,
      py: (y: number) => PAD.top + innerH - ((y - min) / (max - min)) * innerH,
    }
  }, [points, baseline, innerW, innerH, yZero])

  if (!points.length) return <div ref={ref} style={{ height }} />

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.px(p.x).toFixed(1)},${scale.py(p.y).toFixed(1)}`).join(' ')
  const area = `${path} L${scale.px(points[points.length - 1].x).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${scale.px(points[0].x).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
  const basePath = baseline?.length
    ? baseline.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.px(p.x).toFixed(1)},${scale.py(p.y).toFixed(1)}`).join(' ')
    : null

  const nearest = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(scale.px(p.x) - x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  const activePoint = active !== null ? points[active] : null
  const gridYs = [scale.max, (scale.max + scale.min) / 2, scale.min]

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="touch-pan-y"
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerDown={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradId.current} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* recessive hairline grid */}
        {gridYs.map((gy, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={scale.py(gy)}
              y2={scale.py(gy)}
              stroke="rgb(var(--c-line))"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={scale.py(gy) + 3.5}
              textAnchor="end"
              className="tnum fill-[rgb(var(--c-faint))] text-2xs"
            >
              {formatY(gy)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradId.current})`} />
        {basePath && (
          <path d={basePath} fill="none" stroke="rgb(var(--c-muted))" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* end marker, ringed in the surface colour so it stays legible */}
        <circle
          cx={scale.px(points[points.length - 1].x)}
          cy={scale.py(points[points.length - 1].y)}
          r="4.5"
          fill={color}
          stroke="rgb(var(--c-surface))"
          strokeWidth="2"
        />

        {activePoint && (
          <>
            <line
              x1={scale.px(activePoint.x)}
              x2={scale.px(activePoint.x)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="rgb(var(--c-ink))"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
            <circle
              cx={scale.px(activePoint.x)}
              cy={scale.py(activePoint.y)}
              r="5"
              fill={color}
              stroke="rgb(var(--c-surface))"
              strokeWidth="2"
            />
          </>
        )}

        <text x={PAD.left} y={height - 5} className="fill-[rgb(var(--c-faint))] text-2xs">
          {formatX(scale.xMin)}
        </text>
        <text x={w - PAD.right} y={height - 5} textAnchor="end" className="fill-[rgb(var(--c-faint))] text-2xs">
          {formatX(scale.xMax)}
        </text>
      </svg>

      {activePoint && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[104px] rounded-lg border border-line bg-elevated/95 px-2.5 py-1.5 shadow-lift backdrop-blur"
          style={{
            left: Math.min(Math.max(scale.px(activePoint.x) - 52, 2), Math.max(w - 110, 2)),
          }}
        >
          <p className="tnum text-sm font-bold leading-tight text-ink">{formatY(activePoint.y)}</p>
          {tooltipDetail && tooltipDetail(activePoint, active as number) && (
            <p className="tnum text-caption leading-tight text-muted">{tooltipDetail(activePoint, active as number)}</p>
          )}
          <p className="text-caption leading-tight text-faint">{formatX(activePoint.x)}</p>
        </div>
      )}
    </div>
  )
}
