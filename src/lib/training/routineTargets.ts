/**
 * Reading the targets typed into the routine editor.
 *
 * The fields used to go straight through `Number(text)`, which does not know
 * that Spanish writes "1,5": the routine saved NaN and the list said "RIR NaN".
 * Nothing out of range was stopped either. These functions decide what a
 * field's text means; the editor only saves what they accept and shows the
 * reason for anything they refuse.
 */

/** Inclusive limits of the intensity targets. RPE is a 1–10 scale; RIR 0 is failure. */
export const INTENSITY_LIMITS = {
  rir: { min: 0, max: 10 },
  rpe: { min: 1, max: 10 },
} as const

/** Inclusive limits of a rep target, the same ones a logged set accepts. */
export const REP_LIMITS = { min: 1, max: 100 } as const

/**
 * A decimal typed either way: "1,5" and "1.5" are the same number. `null` when
 * it is not one. A trailing separator ("1,") counts as the whole number, so the
 * field does not flag an error halfway through typing "1,5".
 */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export type IntensityResult = { ok: true; value: number | null } | { ok: false }

/**
 * A RIR or RPE target. Empty means "no target", which is allowed and saved as
 * `null`; anything else must be a number inside the scale.
 */
export function parseIntensity(raw: string, kind: keyof typeof INTENSITY_LIMITS): IntensityResult {
  if (raw.trim() === '') return { ok: true, value: null }
  const n = parseDecimal(raw)
  const { min, max } = INTENSITY_LIMITS[kind]
  if (n === null || n < min || n > max) return { ok: false }
  return { ok: true, value: n }
}

export type RepRangeResult =
  | { ok: true; min: number; max: number }
  | { ok: false; invalidMin: boolean; invalidMax: boolean; reversed: boolean }

function parseReps(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return n >= REP_LIMITS.min && n <= REP_LIMITS.max ? n : null
}

/**
 * The two ends of a rep range, checked together: each must be a whole number
 * of reps, and the minimum cannot be above the maximum. They are judged as a
 * pair so that changing "8–12" to "15–20" works whichever field is typed first:
 * the range is only saved once both ends agree.
 */
export function parseRepRange(minRaw: string, maxRaw: string): RepRangeResult {
  const min = parseReps(minRaw)
  const max = parseReps(maxRaw)
  if (min === null || max === null) {
    return { ok: false, invalidMin: min === null, invalidMax: max === null, reversed: false }
  }
  if (min > max) return { ok: false, invalidMin: false, invalidMax: false, reversed: true }
  return { ok: true, min, max }
}
