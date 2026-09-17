/** All date keys are local-calendar `YYYY-MM-DD`, never UTC-shifted. */
export function dateKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function startOfDay(d: Date | number): Date {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(d: Date | number, days: number): Date {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  date.setDate(date.getDate() + days)
  return date
}

export function startOfWeek(d: Date | number, weekStartsOn: 0 | 1 = 1): Date {
  const date = startOfDay(d)
  const day = date.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  return addDays(date, -diff)
}

export function startOfMonth(d: Date | number): Date {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(d: Date | number): Date {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function monthKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function daysBetween(a: Date | number, b: Date | number): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime()
  return Math.round(ms / 86_400_000)
}

export type Period = '1M' | '3M' | '6M' | '1Y' | 'ALL'
export const PERIODS: Period[] = ['1M', '3M', '6M', '1Y', 'ALL']

export function periodStart(period: Period, from: Date = new Date()): number {
  const d = new Date(from)
  switch (period) {
    case '1M':
      d.setMonth(d.getMonth() - 1)
      break
    case '3M':
      d.setMonth(d.getMonth() - 3)
      break
    case '6M':
      d.setMonth(d.getMonth() - 6)
      break
    case '1Y':
      d.setFullYear(d.getFullYear() - 1)
      break
    case 'ALL':
      return 0
  }
  return startOfDay(d).getTime()
}

export type BodyPeriod = '7D' | '30D' | '3M' | '6M' | '1Y' | 'ALL'
export const BODY_PERIODS: BodyPeriod[] = ['7D', '30D', '3M', '6M', '1Y', 'ALL']

export function bodyPeriodStart(period: BodyPeriod, from: Date = new Date()): number {
  const d = new Date(from)
  switch (period) {
    case '7D':
      return addDays(d, -7).getTime()
    case '30D':
      return addDays(d, -30).getTime()
    case '3M':
      d.setMonth(d.getMonth() - 3)
      return startOfDay(d).getTime()
    case '6M':
      d.setMonth(d.getMonth() - 6)
      return startOfDay(d).getTime()
    case '1Y':
      d.setFullYear(d.getFullYear() - 1)
      return startOfDay(d).getTime()
    case 'ALL':
      return 0
  }
}

export function relativeDay(ts: number, locale: string, now = Date.now()): string {
  const diff = daysBetween(ts, now)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(diff) < 1) return rtf.format(0, 'day')
  if (Math.abs(diff) < 7) return rtf.format(-diff, 'day')
  if (Math.abs(diff) < 31) return rtf.format(-Math.round(diff / 7), 'week')
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ts)
}

export function fmtDate(ts: number | string, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  const t = typeof ts === 'string' ? fromDateKey(ts).getTime() : ts
  return new Intl.DateTimeFormat(locale, opts ?? { day: 'numeric', month: 'short' }).format(t)
}

export function fmtTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(ts)
}

export function partOfDay(d = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  if (h < 12) return 'morning'
  if (h < 19) return 'afternoon'
  return 'evening'
}
