import type { Units } from './db/schema'

export const KG_PER_LB = 0.45359237

/* ------------------------------------------------------------ number locale */

/**
 * The language numbers are written in.
 *
 * Every formatter below writes for the app's language, not the phone's: a
 * Spanish app says "32,5 kg" on an English phone and an English app "32.5 kg"
 * on a Spanish one. `useApp` sets it when the app starts and whenever the
 * language changes. Until then — and in tests that never set it — numbers come
 * out exactly as they always did: a point, and `Intl` on the runtime default.
 *
 * Module state rather than a parameter on purpose: these helpers are called
 * from some seventy places, and the alternative is threading a locale through
 * every one of them for the one value the whole app shares.
 */
let numberLocale: string | undefined
let decimalSep = '.'

/** A BCP 47 tag (`LOCALES[language]`); null goes back to the default. */
export function setFormatLocale(locale: string | null | undefined): void {
  numberLocale = locale || undefined
  decimalSep = numberLocale ? decimalSeparatorOf(numberLocale) : '.'
}

function decimalSeparatorOf(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.'
  } catch {
    return '.' // an unknown tag: keep the point rather than break every number
  }
}

/** "32.5" written the way the app's language writes it: "32,5" in Spanish. */
function localDecimal(s: string): string {
  return decimalSep === '.' ? s : s.replace('.', decimalSep)
}

/** Storage is always kg. These convert to/from the user's display unit. */
export function toDisplayWeight(kg: number, units: Units): number {
  return units === 'kg' ? kg : kg / KG_PER_LB
}

export function fromDisplayWeight(value: number, units: Units): number {
  return units === 'kg' ? value : value * KG_PER_LB
}

/**
 * Trims trailing zeros: 32.50 -> "32.5", 35.00 -> "35" — "32,5" in Spanish.
 * Text to read. A value written INTO an `<input>` goes through `inputNum`.
 */
export function trimNum(n: number, maxDecimals = 2): string {
  return localDecimal(inputNum(n, maxDecimals))
}

/**
 * The same number for an `<input>`: always with a point, whatever the
 * language. What a field holds is parsed back — comma or point, both are
 * accepted — and a value that changed shape under the cursor while someone
 * types would be worse than a point in a Spanish app.
 */
export function inputNum(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return '—'
  const fixed = n.toFixed(maxDecimals)
  // Only a decimal part has zeros to trim: with no decimals, 100 stays "100".
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
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

/**
 * Compact volume for tiles and lists. Thousands of kilos are tonnes ("1.8t").
 * Thousands of pounds are not: a "t" there reads as tonnes of something else,
 * so they are "1.8k lb".
 */
export function fmtVolume(kg: number, units: Units): string {
  const v = toDisplayWeight(kg, units)
  if (v >= 1000) {
    const thousands = trimNum(v / 1000, v >= 10000 ? 0 : 1)
    return units === 'kg' ? `${thousands}t` : `${thousands}k ${units}`
  }
  return `${Math.round(v)} ${units}`
}

export function fmtVolumeFull(kg: number, units: Units): string {
  const v = toDisplayWeight(kg, units)
  return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(v)} ${units}`
}

export function fmtDuration(totalSeconds: number, style: 'clock' | 'compact' = 'clock'): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (style === 'compact') {
    // «45m» reads as metres to a Spanish speaker: Spanish says «min».
    const min = numberLocale?.startsWith('es') ? 'min' : 'm'
    if (h > 0) return `${h}h ${m}${min}`
    if (m > 0) return `${m}${min}`
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
  return `${sign}${localDecimal(n.toFixed(decimals).replace(/\.0$/, ''))}%`
}

export function fmtSigned(n: number, decimals = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${trimNum(Math.abs(n), decimals)}`
}

export function fmtCompactNumber(n: number): string {
  return new Intl.NumberFormat(numberLocale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/**
 * Storage sizes: "945 KB", "12,5 MB", "10 GB". From 1024 MB up it is
 * gigabytes — a quota of "10240.9 MB" is a number nobody reads.
 */
export function fmtBytes(n: number | null): string {
  if (n === null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${trimNum(n / 1024 ** 2, 1)} MB`
  return `${trimNum(n / 1024 ** 3, 1)} GB`
}

/**
 * A list of numbers as a person types it: "2.5, 5, 7.5", "1,25; 2,5", "5 10".
 *
 * Values are separated by a semicolon, by spaces, or by a comma followed by a
 * space. A comma inside a value is a decimal comma, so "1,25, 2,5" is
 * [1.25, 2.5] — not [1, 2, 5, 25], which is what splitting on every comma
 * made of it. A run that cannot be one decimal number — "5,10,15", more than
 * one comma with no spaces, the way the old hint said to write it, or a comma
 * next to a decimal point — keeps its commas as separators.
 *
 * Positive, finite values only, ascending, as the weight ladders expect.
 */
export function parseNumberList(text: string): number[] {
  const out: number[] = []
  for (const raw of text.split(/;|\s+|,(?=\s)/)) {
    // A comma at either end is a separator someone is still typing after.
    const token = raw.trim().replace(/^,+|,+$/g, '')
    if (!token) continue
    const commas = token.split(',').length - 1
    const parts = commas > 1 || (commas === 1 && token.includes('.')) ? token.split(',') : [token]
    for (const part of parts) {
      const n = Number(part.replace(',', '.'))
      if (part !== '' && Number.isFinite(n) && n > 0) out.push(n)
    }
  }
  return out.sort((a, b) => a - b)
}
