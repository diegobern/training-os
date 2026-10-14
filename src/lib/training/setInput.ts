import type { SetEntry } from '../db/schema'

/**
 * What a strength set's fields accept while it is being typed.
 *
 * The row used to take any number at all: −20 kg, 500 reps and RIR 25 were all
 * stored, ticked, and then fed to volume, e1RM, PRs and the coach, which have
 * no way of telling a typo from a lift. The bounds are wide enough that no
 * real set is ever refused — a 100-rep set is already an endurance test, and
 * RIR/RPE are 0–10 / 1–10 scales by definition — and narrow enough that a
 * slipped finger is caught on the spot rather than months later in a chart.
 *
 * Weight has no ceiling here on purpose: it is typed in kg or lb, and a cap in
 * one unit would be a different number in the other.
 */
export const SET_LIMITS = {
  weight: { min: 0, max: Number.POSITIVE_INFINITY },
  reps: { min: 1, max: 100 },
  rir: { min: 0, max: 10 },
  rpe: { min: 1, max: 10 },
} as const

export type SetField = keyof typeof SET_LIMITS

export interface ParsedSetField {
  /** The value to store, or null when nothing usable was typed. */
  value: number | null
  /** True when something WAS typed and it is not acceptable. Empty is not invalid. */
  invalid: boolean
}

/**
 * Reads what was typed into one field of a set.
 *
 * Empty means "not recorded" and is never an error — that is every untouched
 * row on screen. A decimal comma is accepted, as everywhere else in the app.
 * Reps are rounded as before, then range-checked, so "0,4" is still caught.
 */
export function parseSetField(field: SetField, text: string): ParsedSetField {
  const cleaned = text.replace(',', '.').trim()
  if (cleaned === '') return { value: null, invalid: false }
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return { value: null, invalid: true }
  const v = field === 'reps' ? Math.round(n) : n
  const { min, max } = SET_LIMITS[field]
  if (v < min || v > max) return { value: null, invalid: true }
  return { value: v, invalid: false }
}

/**
 * Whether a set's tick can be pressed.
 *
 * Reps are always needed. Weight is needed too — `null` is "not recorded",
 * and `isValidStrengthPerformance` rightly refuses it — except on a bodyweight
 * exercise, where an empty weight field means "no extra load" and is stored as
 * 0 the moment the set is ticked. Without that, a set of 15 push-ups could not
 * be logged until someone thought of typing "0" into a KG box.
 */
export function canCompleteSet(set: Pick<SetEntry, 'weight' | 'reps'>, bodyweight: boolean): boolean {
  return set.reps !== null && (set.weight !== null || bodyweight)
}
