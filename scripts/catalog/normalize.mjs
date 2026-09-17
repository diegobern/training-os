/**
 * Name normalisation, shared by the importer and the duplicate detector.
 *
 * The whole point is that "Incline Dumbbell Press", "Dumbbell Incline Press"
 * and "Incline DB Press" must collapse to one key. Three things do that work:
 * abbreviations are expanded before anything else, filler words are dropped,
 * and what survives is compared as an unordered set rather than a string.
 */

/** Expanded first, because "db" must not survive into the token set. */
const ABBREV = {
  db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell',
  ez: 'ezbar', bw: 'bodyweight', ohp: 'overhead press',
  rdl: 'romanian deadlift', sldl: 'stiff leg deadlift',
  lat: 'lats', abs: 'abdominals', ab: 'abdominals',
  quad: 'quads', quadriceps: 'quads', ham: 'hamstrings', hams: 'hamstrings',
  delt: 'shoulders', delts: 'shoulders', tri: 'triceps', tris: 'triceps',
  pecs: 'chest', pec: 'chest', tricep: 'triceps', bicep: 'biceps',
  hamstring: 'hamstrings', glute: 'glutes', calf: 'calves', forearm: 'forearms',
}

/** Words that never distinguish one exercise from another. */
const STOP = new Set(['the', 'a', 'an', 'with', 'using', 'and', 'or', 'on', 'in', 'to', 'for', 'of', 'exercise', 'variation', 'version', 'style'])

/**
 * Words that DO distinguish, and must never be dropped even though they look
 * like modifiers. Getting this wrong merges an incline press into a flat one.
 */
export const DISCRIMINATORS = new Set([
  'incline', 'decline', 'flat', 'seated', 'standing', 'lying', 'kneeling',
  'single', 'one', 'unilateral', 'alternating', 'close', 'wide', 'narrow',
  'reverse', 'front', 'back', 'behind', 'overhead', 'bent', 'upright', 'lateral',
  'romanian', 'stiff', 'sumo', 'conventional', 'hack', 'bulgarian',
  'preacher', 'concentration', 'hammer', 'spider', 'skull', 'french',
  'pause', 'paused', 'tempo', 'deficit', 'assisted', 'weighted', 'banded',
  'smith', 'machine', 'cable', 'barbell', 'dumbbell', 'kettlebell', 'ezbar',
  'bodyweight', 'landmine', 'trap', 'hex', 'safety', 'pendlay', 'meadows',
  'goblet', 'zercher', 'jefferson', 'nordic', 'sissy', 'pistol', 'cossack',
])

const KEEP_PLURAL = new Set(['lats', 'abs', 'quads', 'hamstrings', 'triceps', 'biceps', 'shoulders', 'glutes', 'calves', 'forearms', 'press', 'abdominals'])

export function tokens(name) {
  const cleaned = String(name)
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const out = []
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue
    const expanded = ABBREV[raw] ?? raw
    for (const w of expanded.split(' ')) {
      if (!w) continue
      if (STOP.has(w) && !DISCRIMINATORS.has(w)) continue
      // Crude singularisation, applied only where it cannot change meaning.
      const singular =
        w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !KEEP_PLURAL.has(w) ? w.slice(0, -1) : w
      out.push(singular)
    }
  }
  return out
}

/** Order-independent key. This is what makes the three "incline press" spellings one. */
export function normKey(name) {
  return [...new Set(tokens(name))].sort().join(' ')
}

/** 0..1 overlap of two token sets (Jaccard). */
export function similarity(a, b) {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/**
 * Two names are the same exercise only if they agree on every discriminating
 * word. "Incline Dumbbell Press" and "Dumbbell Press" overlap heavily, but one
 * carries `incline` and the other does not, so they are different exercises.
 */
export function discriminatorsAgree(a, b) {
  const A = new Set(tokens(a).filter((t) => DISCRIMINATORS.has(t)))
  const B = new Set(tokens(b).filter((t) => DISCRIMINATORS.has(t)))
  if (A.size !== B.size) return false
  for (const t of A) if (!B.has(t)) return false
  return true
}

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
