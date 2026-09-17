import type { AvailableWeights, Exercise } from '../db/schema'

export type IncrementSource = Exercise['incrementSource']

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Every weight the user can actually put on the bar, given their plate set.
 * Plates are per side, so each combination is counted twice plus the bar.
 */
export function barbellLadder(w: AvailableWeights, maxTotal = 400): number[] {
  const plates = [...w.barbellPlates, ...w.microPlates].filter((p) => p > 0).sort((a, b) => a - b)
  if (plates.length === 0) return [w.barWeight]
  const perSide = new Set<number>([0])
  // Bounded breadth-first combination build; a gym plate set is small.
  const limit = (maxTotal - w.barWeight) / 2
  let frontier = [0]
  for (let depth = 0; depth < 12 && frontier.length; depth++) {
    const next: number[] = []
    for (const base of frontier) {
      for (const p of plates) {
        const v = round2(base + p)
        if (v > limit) continue
        if (!perSide.has(v)) {
          perSide.add(v)
          next.push(v)
        }
      }
    }
    frontier = next
  }
  return [...perSide].map((s) => round2(w.barWeight + s * 2)).sort((a, b) => a - b)
}

export function ladderFor(source: IncrementSource, w: AvailableWeights): number[] {
  switch (source) {
    case 'dumbbell':
      return [...w.dumbbells].filter((n) => n > 0).sort((a, b) => a - b)
    case 'barbell':
      return barbellLadder(w)
    case 'machine':
      return stepLadder(w.machineStep)
    case 'cable':
      return stepLadder(w.cableStep)
    case 'bodyweight':
      return stepLadder(w.microPlates[0] ?? 1.25)
  }
}

function stepLadder(step: number, max = 300): number[] {
  const s = step > 0 ? step : 2.5
  const out: number[] = []
  for (let v = s; v <= max; v = round2(v + s)) out.push(v)
  return out
}

/** Closest weight that actually exists in the gym. */
export function snapToAvailable(target: number, source: IncrementSource, w: AvailableWeights): number {
  const ladder = ladderFor(source, w)
  if (!ladder.length) return round2(target)
  let best = ladder[0]
  let bestDiff = Math.abs(ladder[0] - target)
  for (const v of ladder) {
    const d = Math.abs(v - target)
    if (d < bestDiff - 1e-9) {
      best = v
      bestDiff = d
    }
  }
  return best
}

/** The next loadable weight strictly above `current`. Null when at the top. */
export function nextWeightUp(
  current: number,
  source: IncrementSource,
  w: AvailableWeights,
): number | null {
  const ladder = ladderFor(source, w)
  for (const v of ladder) if (v > current + 1e-9) return v
  return null
}

export function prevWeightDown(
  current: number,
  source: IncrementSource,
  w: AvailableWeights,
): number | null {
  const ladder = ladderFor(source, w)
  for (let i = ladder.length - 1; i >= 0; i--) if (ladder[i] < current - 1e-9) return ladder[i]
  return null
}

export function incrementSourceForEquipment(equipment: Exercise['equipment']): IncrementSource {
  switch (equipment) {
    case 'dumbbell':
    case 'kettlebell':
      return 'dumbbell'
    case 'barbell':
    case 'smith':
      return 'barbell'
    case 'cable':
    case 'band':
      return 'cable'
    case 'bodyweight':
      return 'bodyweight'
    default:
      return 'machine'
  }
}
