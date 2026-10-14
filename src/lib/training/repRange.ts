import type { ExerciseKind } from '../db/schema'
import { exerciseKind } from './performance'

/**
 * The rep range of an exercise as it should be printed in a list, or null
 * when it means nothing and should not be printed at all.
 *
 * The catalog gives every cardio entry and most mobility entries a range of
 * 0–0, and a couple of holds 1–1. Printed as is, the picker and the library
 * said "0–0 reps" under a treadmill run, which reads as a bug and tells the
 * person nothing. So:
 *
 *   cardio          never a range — it is logged by time and distance
 *   top below 2     no range (0–0, 1–1): nothing to aim for between them
 *   min equal max   a single number, "12" rather than "12–12"
 *   otherwise       "8–12"
 *
 * Only the number is returned; the caller adds the translated word for reps.
 */
export function repRangeLabel(ex: { kind?: ExerciseKind | null; repMin: number; repMax: number }): string | null {
  if (exerciseKind(ex) === 'cardio') return null
  const lo = Math.min(ex.repMin, ex.repMax)
  const hi = Math.max(ex.repMin, ex.repMax)
  if (!Number.isFinite(hi) || hi < 2) return null
  if (lo < 1 || lo === hi) return String(hi)
  return `${lo}–${hi}`
}
