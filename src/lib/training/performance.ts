import type { ExerciseKind, SetEntry } from '../db/schema'

/**
 * The single definition of "this entry counts".
 *
 * Before cardio existed there was one rule — `completed && reps > 0 && weight
 * !== null` — and it was the gate for volume, e1RM, personal records,
 * statistics and the overload coach. A cardio set has no weight and no reps,
 * so under that rule a 25-minute run is invisible to the entire app.
 *
 * The fix is not a condition added at each call site. Scattered conditions
 * drift: one file starts counting a set the next file ignores, and the totals
 * on two screens stop agreeing with no obvious reason. So there is exactly one
 * definition per kind, here, and everything else calls it.
 *
 * What each kind needs:
 *
 *   strength  weight AND reps. Weight may be 0 — a bodyweight set is real —
 *             but it must have been entered, because `null` means "not
 *             recorded" and 0 means "no external load". Those are different.
 *   cardio    duration OR distance. Someone who only knows they ran for 25
 *             minutes has logged a real session; demanding pace or heart rate
 *             would throw that away.
 *   mobility  duration OR reps. A stretch is usually held for time, but some
 *             are counted.
 *
 * Every kind requires `completed`. An untouched row on screen is not data.
 */

export function isValidStrengthPerformance(set: SetEntry): boolean {
  return set.completed && set.reps !== null && set.reps > 0 && set.weight !== null
}

export function isValidCardioPerformance(set: SetEntry): boolean {
  if (!set.completed) return false
  const duration = set.durationSec ?? null
  const distance = set.distanceM ?? null
  return (duration !== null && duration > 0) || (distance !== null && distance > 0)
}

export function isValidMobilityPerformance(set: SetEntry): boolean {
  if (!set.completed) return false
  const duration = set.durationSec ?? null
  if (duration !== null && duration > 0) return true
  return set.reps !== null && set.reps > 0
}

/** Dispatches on kind. This is what the rest of the app should call. */
export function isValidPerformance(kind: ExerciseKind, set: SetEntry): boolean {
  switch (kind) {
    case 'cardio':
      return isValidCardioPerformance(set)
    case 'mobility':
      return isValidMobilityPerformance(set)
    default:
      return isValidStrengthPerformance(set)
  }
}

/**
 * The kind of an exercise or session entry that may predate the field.
 *
 * Every row written before cardio existed is a strength exercise, and none of
 * them carries `kind`. Reading it through here is what keeps `undefined` out
 * of a branch that would otherwise silently take the cardio path.
 */
export function exerciseKind(x: { kind?: ExerciseKind | null } | null | undefined): ExerciseKind {
  return x?.kind ?? 'strength'
}

/* ------------------------------------------------------------ cardio maths */

/** Seconds per kilometre. Null when either side is missing or zero. */
export function paceSecPerKm(durationSec: number | null | undefined, distanceM: number | null | undefined): number | null {
  if (!durationSec || !distanceM || durationSec <= 0 || distanceM <= 0) return null
  return durationSec / (distanceM / 1000)
}

/** Kilometres per hour. */
export function speedKmh(durationSec: number | null | undefined, distanceM: number | null | undefined): number | null {
  if (!durationSec || !distanceM || durationSec <= 0 || distanceM <= 0) return null
  return distanceM / 1000 / (durationSec / 3600)
}

export interface CardioAggregate {
  entries: number
  durationSec: number
  distanceM: number
  /** Weighted by distance, not a mean of paces — averaging paces is wrong. */
  paceSecPerKm: number | null
  avgHr: number | null
  calories: number
}

/**
 * Totals for a set of cardio entries.
 *
 * Pace is derived from the summed duration and distance rather than averaged
 * across entries. Averaging pace over-weights short efforts: a 200 m sprint
 * and a 10 km run do not contribute equally to how fast someone ran that week,
 * however tempting the arithmetic mean is.
 *
 * Heart rate IS a plain mean over the entries that recorded one, because each
 * reading is already an average over its own effort and weighting it by
 * duration would need per-sample data the app does not have.
 */
export function aggregateCardio(sets: SetEntry[]): CardioAggregate {
  let entries = 0
  let durationSec = 0
  let distanceM = 0
  let calories = 0
  let hrSum = 0
  let hrCount = 0

  for (const s of sets) {
    if (!isValidCardioPerformance(s)) continue
    entries++
    durationSec += s.durationSec ?? 0
    distanceM += s.distanceM ?? 0
    calories += s.calories ?? 0
    if (s.avgHr != null && s.avgHr > 0) {
      hrSum += s.avgHr
      hrCount++
    }
  }

  return {
    entries,
    durationSec,
    distanceM,
    paceSecPerKm: paceSecPerKm(durationSec, distanceM),
    avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
    calories,
  }
}

export interface MobilityAggregate {
  entries: number
  durationSec: number
  totalReps: number
}

export function aggregateMobility(sets: SetEntry[]): MobilityAggregate {
  let entries = 0
  let durationSec = 0
  let totalReps = 0
  for (const s of sets) {
    if (!isValidMobilityPerformance(s)) continue
    entries++
    durationSec += s.durationSec ?? 0
    totalReps += s.reps ?? 0
  }
  return { entries, durationSec, totalReps }
}
