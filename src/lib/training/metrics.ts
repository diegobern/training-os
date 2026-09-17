import { EFFECTIVE_SET_TYPES, type SetEntry, type SetType } from '../db/schema'
import { isValidStrengthPerformance } from './performance'

/**
 * A strength set only counts once it has been ticked and carries usable
 * numbers.
 *
 * Kept as a name because it is used in a dozen places, but the rule itself
 * lives in performance.ts, which holds one definition per exercise kind. There
 * must not be a second copy of this condition anywhere in the codebase.
 */
export const isLogged = isValidStrengthPerformance

export function isEffective(set: SetEntry, excludeWarmups: boolean): boolean {
  if (!isLogged(set)) return false
  if (!excludeWarmups) return true
  return EFFECTIVE_SET_TYPES.includes(set.type)
}

export function setVolume(set: SetEntry): number {
  if (!isLogged(set)) return 0
  return (set.weight as number) * (set.reps as number)
}

/**
 * Epley estimate. Reported everywhere as ESTIMATED 1RM, never as a true 1RM.
 * A single rep is returned unchanged — the formula has nothing to extrapolate.
 * Above ~12 reps the estimate drifts badly, so callers can check `confident`.
 */
export function estimate1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function e1rmIsConfident(reps: number): boolean {
  return reps >= 1 && reps <= 12
}

export interface SetAggregate {
  loggedSets: number
  effectiveSets: number
  totalReps: number
  volume: number
  topSetWeight: number
  topSetReps: number
  bestE1rm: number
  bestE1rmWeight: number
  bestE1rmReps: number
}

export function aggregateSets(sets: SetEntry[], excludeWarmups: boolean): SetAggregate {
  const agg: SetAggregate = {
    loggedSets: 0,
    effectiveSets: 0,
    totalReps: 0,
    volume: 0,
    topSetWeight: 0,
    topSetReps: 0,
    bestE1rm: 0,
    bestE1rmWeight: 0,
    bestE1rmReps: 0,
  }
  for (const set of sets) {
    if (!isLogged(set)) continue
    agg.loggedSets++
    const counts = isEffective(set, excludeWarmups)
    if (!counts) continue
    const w = set.weight as number
    const r = set.reps as number
    agg.effectiveSets++
    agg.totalReps += r
    agg.volume += w * r
    if (w > agg.topSetWeight || (w === agg.topSetWeight && r > agg.topSetReps)) {
      agg.topSetWeight = w
      agg.topSetReps = r
    }
    const e = estimate1RM(w, r)
    if (e > agg.bestE1rm) {
      agg.bestE1rm = e
      agg.bestE1rmWeight = w
      agg.bestE1rmReps = r
    }
  }
  return agg
}

export const SET_TYPE_SHORT: Record<SetType, string> = {
  warmup: 'W',
  working: '',
  top: 'T',
  backoff: 'B',
  drop: 'D',
  failure: 'F',
  restpause: 'RP',
}

/**
 * Weekly effective-set attribution.
 *
 * We deliberately attribute a whole set to the exercise's primary muscle group
 * only. Splitting fractional credit across secondary muscles would invent a
 * precision that the underlying sports science does not support.
 */
export function bestSetOf(sets: SetEntry[]): SetEntry | null {
  let best: SetEntry | null = null
  let bestScore = -1
  for (const set of sets) {
    if (!isLogged(set)) continue
    const score = estimate1RM(set.weight as number, set.reps as number)
    if (score > bestScore) {
      bestScore = score
      best = set
    }
  }
  return best
}
