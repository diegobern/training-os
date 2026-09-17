import type { Units } from './db/schema'

export const KG_PER_LB = 0.45359237

/** Storage is always kg. These convert to/from the user's display unit. */
export function toDisplayWeight(kg: number, units: Units): number {
  return units === 'kg' ? kg : kg / KG_PER_LB
}

export function fromDisplayWeight(value: number, units: Units): number {
  return units === 'kg' ? value : value * KG_PER_LB
}

/** Trims trailing zeros: 32.50 -> "32.5", 35.00 -> "35". */
export function trimNum(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return '—'
  const fixed = n.toFixed(maxDecimals)
  return fixed.replace(/\.?0+$/, '')
}

export function fmtWeight(
  kg: number | null | undefined,
  units: Units,
  withUnit = true,
  decimals = 1,
): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return '—'
  const v = toDisplayWeight(kg, units)
  const s = trimNum(v, decimals)
  return withUnit ? `${s} ${units}` : s
}

export function fmtVolume(kg: number, units: Units): string {
  const v = toDisplayWeight(kg, units)
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}t`
  return `${Math.round(v)} ${units}`
}

export function fmtVolumeFull(kg: number, units: Units): string {
  const v = toDisplayWeight(kg, units)
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(v)} ${units}`
}

export function fmtDuration(totalSeconds: number, style: 'clock' | 'compact' = 'clock'): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (style === 'compact') {
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${sec}s`
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function fmtTimer(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function fmtPercent(n: number, decimals = 1): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals).replace(/\.0$/, '')}%`
}

export function fmtSigned(n: number, decimals = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${trimNum(Math.abs(n), decimals)}`
}

export function fmtCompactNumber(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
