/* ============================================================================
 * PROGRESSIVE OVERLOAD ASSISTANT
 *
 * Deterministic double progression. No model, no black box: every suggestion
 * carries the exact reason it was produced so the UI can answer "WHY?".
 *
 * The rule set, in order:
 *   1. No history            -> nothing to suggest. Say so.
 *   2. Every working set at the load reached the top of the rep range
 *      (at or below the RIR target) -> move up one real gym increment,
 *      and expect to land back at the bottom of the range.
 *   3. The top set reached the top of the range but the others did not
 *      -> hold the load, bring the lagging sets up.
 *   4. Inside the range -> add one rep.
 *   5. Below the range twice in a row -> hold, or step the load down once.
 *
 * Everything is clamped to weights that actually exist in the user's gym.
 * ========================================================================== */

import type { AvailableWeights, ExerciseLog, SetEntry } from '../db/schema'
import { EFFECTIVE_SET_TYPES } from '../db/schema'
import { estimate1RM } from './metrics'
import { nextWeightUp, prevWeightDown, type IncrementSource } from './weights'

export type SuggestionKind =
  | 'establish'
  | 'increase-weight'
  | 'add-rep'
  | 'hold'
  | 'step-down'

export type Trend = 'progressing' | 'stable' | 'lower' | 'insufficient'

export interface PlateauInfo {
  detected: boolean
  sessions: number
  weight: number
  reps: number
}

export interface Suggestion {
  kind: SuggestionKind
  /** Null when there is not enough history to suggest anything. */
  weight: number | null
  reps: number | null
  /** i18n key + params, so the reason is translatable and never hard-coded. */
  reasonKey: string
  reasonParams: Record<string, string | number>
  lastWeight: number | null
  lastReps: number | null
  repMin: number
  repMax: number
  sessionsAnalysed: number
}

export interface ExerciseInsight {
  suggestion: Suggestion
  trend: Trend
  trendDeltaPct: number | null
  plateau: PlateauInfo | null
}

function effectiveSets(sets: SetEntry[]): SetEntry[] {
  return sets.filter(
    (s) =>
      s.completed &&
      s.reps !== null &&
      s.reps > 0 &&
      s.weight !== null &&
      EFFECTIVE_SET_TYPES.includes(s.type),
  )
}

/** The load the session actually worked at: the most used weight, ties -> heaviest. */
function primaryLoad(sets: SetEntry[]): number | null {
  const eff = effectiveSets(sets)
  if (!eff.length) return null
  const counts = new Map<number, number>()
  for (const s of eff) counts.set(s.weight as number, (counts.get(s.weight as number) ?? 0) + 1)
  let best = -1
  let bestCount = -1
  for (const [w, c] of counts) {
    if (c > bestCount || (c === bestCount && w > best)) {
      best = w
      bestCount = c
    }
  }
  return best
}

function setsAtLoad(sets: SetEntry[], load: number): SetEntry[] {
  return effectiveSets(sets).filter((s) => Math.abs((s.weight as number) - load) < 1e-9)
}

function meanRir(sets: SetEntry[]): number | null {
  const vals = sets.map((s) => s.rir).filter((v): v is number => v !== null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export interface SuggestInput {
  logs: ExerciseLog[] // ascending by performedAt
  repMin: number
  repMax: number
  rirTarget: number | null
  source: IncrementSource
  weights: AvailableWeights
}

export function suggestNext(input: SuggestInput): Suggestion {
  const { logs, repMin, repMax, rirTarget, source, weights } = input
  const base = {
    repMin,
    repMax,
    sessionsAnalysed: logs.length,
    lastWeight: null as number | null,
    lastReps: null as number | null,
  }

  if (!logs.length) {
    return {
      ...base,
      kind: 'establish',
      weight: null,
      reps: null,
      reasonKey: 'coach.reason.noHistory',
      reasonParams: {},
    }
  }

  const last = logs[logs.length - 1]
  const load = primaryLoad(last.sets)
  if (load === null) {
    return {
      ...base,
      kind: 'establish',
      weight: null,
      reps: null,
      reasonKey: 'coach.reason.noHistory',
      reasonParams: {},
    }
  }

  const atLoad = setsAtLoad(last.sets, load)
  const repsAtLoad = atLoad.map((s) => s.reps as number)
  const minReps = Math.min(...repsAtLoad)
  const maxReps = Math.max(...repsAtLoad)
  const rir = meanRir(atLoad)
  base.lastWeight = load
  base.lastReps = maxReps

  const rirOk = rirTarget === null || rir === null || rir <= rirTarget + 0.5

  // 2. Whole set cluster at the top of the range, at or under the RIR target.
  if (minReps >= repMax && rirOk) {
    const up = nextWeightUp(load, source, weights)
    if (up !== null) {
      return {
        ...base,
        kind: 'increase-weight',
        weight: up,
        reps: repMin,
        reasonKey: 'coach.reason.topOfRange',
        reasonParams: {
          sets: atLoad.length,
          reps: repMax,
          rir: rir === null ? '—' : String(Math.round(rir * 10) / 10),
          rirTarget: rirTarget ?? '—',
        },
      }
    }
    return {
      ...base,
      kind: 'hold',
      weight: load,
      reps: repMax,
      reasonKey: 'coach.reason.noHeavierWeight',
      reasonParams: { weight: load },
    }
  }

  // 3. Top set is there but the rest of the cluster is not.
  if (maxReps >= repMax && minReps < repMax) {
    return {
      ...base,
      kind: 'hold',
      weight: load,
      reps: repMax,
      reasonKey: 'coach.reason.evenOutSets',
      reasonParams: { top: maxReps, low: minReps, repMax },
    }
  }

  // 5. Short of the bottom of the range: repeat the load. Twice in a row at the
  //    same load, step down one notch — that usually unblocks it.
  if (maxReps < repMin) {
    if (logs.length >= 2) {
      const prev = logs[logs.length - 2]
      const prevLoad = primaryLoad(prev.sets)
      const prevMax =
        prevLoad === null ? 0 : Math.max(0, ...setsAtLoad(prev.sets, prevLoad).map((s) => s.reps as number))
      if (prevLoad !== null && Math.abs(prevLoad - load) < 1e-9 && prevMax < repMin) {
        const down = prevWeightDown(load, source, weights)
        if (down !== null) {
          return {
            ...base,
            kind: 'step-down',
            weight: down,
            reps: repMin,
            reasonKey: 'coach.reason.belowRangeTwice',
            reasonParams: { reps: maxReps, repMin, weight: load },
          }
        }
      }
    }
    return {
      ...base,
      kind: 'hold',
      weight: load,
      reps: repMin,
      reasonKey: 'coach.reason.belowRange',
      reasonParams: { reps: maxReps, repMin },
    }
  }

  // 4. Inside the range — add one rep.
  const target = Math.min(maxReps + 1, repMax)
  return {
    ...base,
    kind: 'add-rep',
    weight: load,
    reps: target,
    reasonKey: 'coach.reason.addRep',
    reasonParams: {
      weight: load,
      reps: maxReps,
      rir: rir === null ? '—' : String(Math.round(rir * 10) / 10),
      repMin,
      repMax,
    },
  }
}

/* ------------------------------------------------------------------ plateau */

/**
 * A plateau is the same load with no rep improvement across at least three
 * consecutive sessions. Walking backwards, an earlier session with FEWER reps
 * means the latest session did improve on it — so the streak stops there and
 * steady progress is never mislabelled as a plateau.
 *
 * It is a description of the data, never a diagnosis.
 */
export function detectPlateau(logs: ExerciseLog[], minSessions = 3): PlateauInfo | null {
  if (logs.length < minSessions) return null
  const recent = logs.slice(-5)
  const last = recent[recent.length - 1]
  const load = primaryLoad(last.sets)
  if (load === null) return null
  const lastBest = Math.max(...setsAtLoad(last.sets, load).map((s) => s.reps as number))

  let streak = 1
  for (let i = recent.length - 2; i >= 0; i--) {
    const l = primaryLoad(recent[i].sets)
    if (l === null || Math.abs(l - load) > 1e-9) break
    const best = Math.max(0, ...setsAtLoad(recent[i].sets, l).map((s) => s.reps as number))
    if (best < lastBest) break // the latest session beat this one — real progress
    streak++
  }

  if (streak >= minSessions) {
    return { detected: true, sessions: streak, weight: load, reps: lastBest }
  }
  return null
}

/* -------------------------------------------------------------------- trend */

/**
 * Trend uses estimated 1RM of the best set — it folds weight and reps into one
 * number, so adding a rep at the same load reads as progress, which is correct.
 */
export function computeTrend(logs: ExerciseLog[]): { trend: Trend; deltaPct: number | null } {
  if (logs.length < 2) return { trend: 'insufficient', deltaPct: null }
  const last = logs[logs.length - 1]
  const prior = logs.slice(Math.max(0, logs.length - 4), logs.length - 1)
  const baseline = prior.reduce((a, l) => a + l.bestE1rm, 0) / prior.length
  if (!baseline) return { trend: 'insufficient', deltaPct: null }
  const delta = ((last.bestE1rm - baseline) / baseline) * 100
  if (delta >= 1) return { trend: 'progressing', deltaPct: delta }
  if (delta <= -2) return { trend: 'lower', deltaPct: delta }
  return { trend: 'stable', deltaPct: delta }
}

export function buildInsight(input: SuggestInput): ExerciseInsight {
  const suggestion = suggestNext(input)
  const { trend, deltaPct } = computeTrend(input.logs)
  const plateau = detectPlateau(input.logs)
  return { suggestion, trend, trendDeltaPct: deltaPct, plateau }
}

/** Best estimated 1RM series, used by Progress charts. */
export function e1rmSeries(logs: ExerciseLog[]) {
  return logs.map((l) => ({ x: l.performedAt, y: l.bestE1rm }))
}

export function bestSetLabel(l: ExerciseLog) {
  return { weight: l.topSetWeight, reps: l.topSetReps, e1rm: estimate1RM(l.topSetWeight, l.topSetReps) }
}
