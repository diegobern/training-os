import 'fake-indexeddb/auto'
/* Plain-node unit tests for the training maths. Bundled with esbuild, run with node. */
import { estimate1RM, aggregateSets, isLogged } from '../src/lib/training/metrics'
import { barbellLadder, nextWeightUp, snapToAvailable, prevWeightDown } from '../src/lib/training/weights'
import { suggestNext, detectPlateau, computeTrend } from '../src/lib/training/overload'
import { detectPRsForLog, type ExerciseBests } from '../src/lib/db/repo.sessions'
import { DEFAULT_AVAILABLE_WEIGHTS, type ExerciseLog, type SetEntry } from '../src/lib/db/schema'
import { weekStreak } from '../src/lib/training/stats'
import { dateKey, startOfWeek, periodStart } from '../src/lib/dates'
import { toDisplayWeight, fromDisplayWeight, fmtDuration, trimNum } from '../src/lib/format'
import {
  normalizeUsername,
  validateUsername,
  checkPassword,
  SYNCED_STORES,
  userCollection,
  photoStoragePath,
  usernameDoc,
} from '../src/lib/firebase/paths'
import { pickAccountSettings } from '../src/lib/firebase/profile'
import {
  isValidStrengthPerformance,
  isValidCardioPerformance,
  isValidMobilityPerformance,
  isValidPerformance,
  exerciseKind,
  paceSecPerKm,
  speedKmh,
  aggregateCardio,
  aggregateMobility,
} from '../src/lib/training/performance'
import { filterCatalog, fold, toExercise } from '../src/lib/catalog/resolve'
import {
  usableEquipment,
  defaultsForExercise,
  weeklySetTargets,
  suggestTemplate,
  emphasisFor,
  settingsPatchFor,
} from '../src/lib/training/personalize'
import type { CatalogEntryRaw } from '../src/lib/catalog/types'
import {
  mergeTrainingProfile,
  fromLegacyProfile,
  emptyTrainingProfile,
  isOnboardingCurrent,
  GOAL_DEFAULTS,
  ENVIRONMENT_EQUIPMENT,
  ONBOARDING_VERSION,
} from '../src/lib/training/profile'
import { defaultSettings } from '../src/lib/db/schema'
import { es } from '../src/lib/i18n/es'
import { en } from '../src/lib/i18n/en'

let pass = 0
let fail = 0
const results: string[] = []

function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    pass++
    results.push(`PASS  ${name}`)
  } else {
    fail++
    results.push(`FAIL  ${name}\n        expected ${b}\n        actual   ${a}`)
  }
}

function near(actual: number, expected: number, name: string, tol = 1e-6) {
  if (Math.abs(actual - expected) <= tol) {
    pass++
    results.push(`PASS  ${name}`)
  } else {
    fail++
    results.push(`FAIL  ${name}\n        expected ~${expected}\n        actual    ${actual}`)
  }
}

/* ------------------------------------------------------------------ sets */

let sid = 0
const set = (p: Partial<SetEntry> = {}): SetEntry => ({
  id: `s${++sid}`,
  type: 'working',
  weight: 100,
  reps: 8,
  rir: 1,
  rpe: null,
  completed: true,
  completedAt: 1,
  note: '',
  ...p,
})

eq(isLogged(set()), true, 'isLogged: complete set')
eq(isLogged(set({ completed: false })), false, 'isLogged: unticked set is not logged')
eq(isLogged(set({ reps: null })), false, 'isLogged: missing reps')
eq(isLogged(set({ reps: 0 })), false, 'isLogged: zero reps')

/* ----------------------------------------------------------------- 1RM */

near(estimate1RM(100, 1), 100, 'e1RM: one rep returns the weight unchanged')
near(estimate1RM(100, 10), 100 * (1 + 10 / 30), 'e1RM: Epley at 10 reps')
eq(estimate1RM(0, 5), 0, 'e1RM: zero weight')
eq(estimate1RM(100, 0), 0, 'e1RM: zero reps')

/* ----------------------------------------------------------- aggregates */

const agg = aggregateSets(
  [
    set({ type: 'warmup', weight: 40, reps: 10 }),
    set({ weight: 100, reps: 8 }),
    set({ weight: 100, reps: 7 }),
    set({ weight: 90, reps: 10, completed: false }),
  ],
  true,
)
eq(agg.effectiveSets, 2, 'aggregate: warm-ups excluded from effective sets')
eq(agg.loggedSets, 3, 'aggregate: logged sets include warm-ups')
eq(agg.volume, 100 * 8 + 100 * 7, 'aggregate: volume excludes warm-up and unticked sets')
eq(agg.topSetWeight, 100, 'aggregate: top set weight')
eq(agg.totalReps, 15, 'aggregate: total reps')

const aggInc = aggregateSets([set({ type: 'warmup', weight: 40, reps: 10 })], false)
eq(aggInc.effectiveSets, 1, 'aggregate: warm-ups counted when the setting is off')

/* -------------------------------------------------------------- weights */

const W = { ...DEFAULT_AVAILABLE_WEIGHTS }
eq(nextWeightUp(30, 'dumbbell', W), 32.5, 'ladder: next dumbbell above 30 kg')
eq(nextWeightUp(32.5, 'dumbbell', W), 35, 'ladder: next dumbbell above 32.5 kg')
eq(prevWeightDown(32.5, 'dumbbell', W), 30, 'ladder: previous dumbbell below 32.5 kg')
eq(nextWeightUp(50, 'dumbbell', W), null, 'ladder: nothing above the heaviest dumbbell')
eq(snapToAvailable(36.3, 'dumbbell', W), 37.5, 'ladder: 36.3 kg snaps to the nearest real dumbbell')
eq(snapToAvailable(35.9, 'dumbbell', W), 35, 'ladder: 35.9 kg snaps down to 35')
eq(snapToAvailable(36.9, 'dumbbell', W), 37.5, 'ladder: rounds to the nearest real dumbbell')

const bar = barbellLadder(W)
eq(bar[0], 20, 'barbell: empty bar is the lightest option')
eq(bar.includes(22.5), true, 'barbell: 20 + 1.25 per side')
eq(bar.includes(60), true, 'barbell: 60 kg is loadable')
eq(bar.includes(61), false, 'barbell: 61 kg is not loadable with these plates')
eq(
  bar.every((v, i) => i === 0 || v > bar[i - 1]),
  true,
  'barbell: ladder is strictly ascending',
)

/* ------------------------------------------------------- overload coach */

const mkLog = (weight: number, reps: number[], at: number, rir = 1): ExerciseLog => {
  const sets = reps.map((r) => set({ weight, reps: r, rir }))
  return {
    id: `l${at}`,
    sessionId: `sess${at}`,
    exerciseId: 'ex',
    exerciseName: 'Incline DB Press',
    muscleGroup: 'chest',
    date: dateKey(at),
    performedAt: at,
    sets,
    effectiveSets: sets.length,
    totalReps: reps.reduce((a, b) => a + b, 0),
    volume: reps.reduce((a, b) => a + b * weight, 0),
    topSetWeight: weight,
    topSetReps: Math.max(...reps),
    bestE1rm: estimate1RM(weight, Math.max(...reps)),
    repMin: 6,
    repMax: 10,
    rirTarget: 1,
    demo: false,
  }
}

const base = { repMin: 6, repMax: 10, rirTarget: 1, source: 'dumbbell' as const, weights: W }

eq(suggestNext({ ...base, logs: [] }).kind, 'establish', 'coach: no history -> establish a baseline')
eq(suggestNext({ ...base, logs: [] }).weight, null, 'coach: no history -> no invented target')

const sAddRep = suggestNext({ ...base, logs: [mkLog(35, [8, 8, 8], 1000)] })
eq(sAddRep.kind, 'add-rep', 'coach: inside the range -> add a rep')
eq([sAddRep.weight, sAddRep.reps], [35, 9], 'coach: same load, one more rep')

const sUp = suggestNext({ ...base, logs: [mkLog(35, [10, 10, 10], 1000)] })
eq(sUp.kind, 'increase-weight', 'coach: whole cluster at the top -> more weight')
eq([sUp.weight, sUp.reps], [37.5, 6], 'coach: next real dumbbell, back to the bottom of the range')

const sUneven = suggestNext({ ...base, logs: [mkLog(35, [10, 8, 7], 1000)] })
eq(sUneven.kind, 'hold', 'coach: only the top set reached the cap -> hold and even out')
eq(sUneven.weight, 35, 'coach: hold keeps the load')

const sHighRir = suggestNext({ ...base, logs: [mkLog(35, [10, 10, 10], 1000, 4)] })
eq(sHighRir.kind, 'add-rep', 'coach: top of range but RIR far above target -> do not add weight yet')

const sBelow = suggestNext({ ...base, logs: [mkLog(35, [5, 5, 4], 1000)] })
eq(sBelow.kind, 'hold', 'coach: below the range once -> repeat the load')

const sBelowTwice = suggestNext({
  ...base,
  logs: [mkLog(35, [5, 5, 5], 900), mkLog(35, [5, 4, 4], 1000)],
})
eq(sBelowTwice.kind, 'step-down', 'coach: below the range twice -> step down')
eq(sBelowTwice.weight, 32.5, 'coach: step down to the previous real dumbbell')

/* ------------------------------------------------------------- plateau */

eq(detectPlateau([mkLog(35, [8], 1), mkLog(35, [9], 2), mkLog(35, [10], 3)]), null, 'plateau: steady progress is not a plateau')
const plateau = detectPlateau([mkLog(35, [9], 1), mkLog(35, [9], 2), mkLog(35, [9], 3)])
eq(plateau?.detected, true, 'plateau: three identical sessions')
eq(plateau?.sessions, 3, 'plateau: counts the stalled sessions')
eq(detectPlateau([mkLog(35, [9], 1), mkLog(35, [9], 2)]), null, 'plateau: two sessions is not enough')
eq(detectPlateau([mkLog(35, [9], 1), mkLog(37.5, [9], 2), mkLog(37.5, [9], 3)]), null, 'plateau: a load change resets it')

/* --------------------------------------------------------------- trend */

eq(computeTrend([mkLog(35, [8], 1)]).trend, 'insufficient', 'trend: one session gives no trend')
eq(computeTrend([mkLog(35, [8], 1), mkLog(37.5, [9], 2)]).trend, 'progressing', 'trend: heavier and more reps -> progressing')
eq(computeTrend([mkLog(40, [10], 1), mkLog(30, [6], 2)]).trend, 'lower', 'trend: a big drop -> lower performance')
eq(computeTrend([mkLog(35, [8], 1), mkLog(35, [8], 2)]).trend, 'stable', 'trend: identical sessions -> stable')

/* ----------------------------------------------------------------- PRs */

const bests: ExerciseBests = {
  maxWeight: 35,
  bestE1rm: estimate1RM(35, 8),
  bestSessionVolume: 800,
  repsByWeight: new Map([
    [35, 8],
    [32.5, 10],
  ]),
  sessions: 5,
}

const prsWeight = detectPRsForLog(mkLog(37.5, [8, 7, 7], 2000), bests)
eq(prsWeight.some((p) => p.type === 'weight'), true, 'PR: heavier top set is a weight PR')
eq(prsWeight.find((p) => p.type === 'weight')?.delta, 2.5, 'PR: weight delta')

const prsReps = detectPRsForLog(mkLog(35, [9, 8, 8], 2000), bests)
eq(prsReps.some((p) => p.type === 'reps'), true, 'PR: more reps at a known load is a rep PR')
eq(prsReps.some((p) => p.type === 'weight'), false, 'PR: same load is not a weight PR')

const prsNone = detectPRsForLog(mkLog(35, [8, 7, 6], 2000), bests)
eq(prsNone.some((p) => p.type === 'weight' || p.type === 'reps'), false, 'PR: repeating a session sets no PR')

const prsNewLoad = detectPRsForLog(mkLog(30, [15], 2000), bests)
eq(prsNewLoad.some((p) => p.type === 'reps'), false, 'PR: a load never used before cannot set a rep PR')

/* ------------------------------------------------------------- streaks */

const now = new Date('2026-09-15T12:00:00').getTime()
const mkSession = (daysAgo: number) => ({ startedAt: now - daysAgo * 86400000 }) as never
eq(weekStreak([], 1, now), 0, 'streak: no sessions')
eq(weekStreak([mkSession(0)], 1, now), 1, 'streak: trained this week')
eq(weekStreak([mkSession(0), mkSession(8), mkSession(15)], 1, now), 3, 'streak: three consecutive weeks')
eq(weekStreak([mkSession(0), mkSession(22)], 1, now), 1, 'streak: a missed week breaks it')

/* -------------------------------------------------------------- format */

near(toDisplayWeight(100, 'lb'), 220.462262, 'units: kg -> lb', 1e-4)
near(fromDisplayWeight(220.462262, 'lb'), 100, 'units: lb -> kg', 1e-4)
eq(toDisplayWeight(100, 'kg'), 100, 'units: kg is stored unchanged')
eq(trimNum(32.5), '32.5', 'format: keeps a meaningful decimal')
eq(trimNum(35.0), '35', 'format: drops trailing zeros')
eq(fmtDuration(4112), '1:08:32', 'format: hours:minutes:seconds')
eq(fmtDuration(92), '01:32', 'format: minutes:seconds')

/* --------------------------------------------------------------- dates */

eq(dateKey(new Date(2026, 0, 5)), '2026-01-05', 'dates: local calendar key')
eq(startOfWeek(new Date(2026, 8, 15), 1).getDay(), 1, 'dates: week starts on Monday')
eq(startOfWeek(new Date(2026, 8, 15), 0).getDay(), 0, 'dates: week starts on Sunday')
eq(periodStart('ALL'), 0, 'dates: ALL has no lower bound')

/* ------------------------------------------------------------- usernames */

eq(normalizeUsername('Diego'), 'diego', 'username: case is folded')
eq(normalizeUsername('  DIEGO  '), 'diego', 'username: surrounding space is dropped')
eq(normalizeUsername('di ego'), 'diego', 'username: inner space is dropped')
eq(normalizeUsername('Diego') === normalizeUsername('DIEGO'), true, 'username: Diego and DIEGO are the same name')

eq(validateUsername('diego'), null, 'username: a plain name is valid')
eq(validateUsername('di'), 'too-short', 'username: two characters is too short')
eq(validateUsername('d'.repeat(21)), 'too-long', 'username: 21 characters is too long')
eq(validateUsername('die go!'), 'charset', 'username: punctuation is rejected')
eq(validateUsername('.diego'), 'edge-dot', 'username: cannot start with a dot')
eq(validateUsername('diego.'), 'edge-dot', 'username: cannot end with a dot')
eq(validateUsername('die..go'), 'edge-dot', 'username: no double dots')
eq(validateUsername('admin'), 'reserved', 'username: reserved names are rejected')
eq(validateUsername('diego_92'), null, 'username: underscore and digits are fine')
eq(validateUsername('die.go'), null, 'username: an inner dot is fine')

/* ------------------------------------------------------------- passwords */

eq(checkPassword('short').acceptable, false, 'password: five characters is not enough')
eq(checkPassword('abcdefghij').acceptable, false, 'password: letters alone are not enough')
eq(checkPassword('1234567890').acceptable, false, 'password: digits alone are not enough')
eq(checkPassword('training1').acceptable, true, 'password: eight characters with a letter and a digit is accepted')
eq(checkPassword('training1').length, true, 'password: length rule')
eq(checkPassword('Training1').mixedCase, true, 'password: mixed case is detected')
eq(checkPassword('training1').mixedCase, false, 'password: lower case only is detected')
eq(checkPassword('TrainingOs2026!').score >= 3, true, 'password: a strong password scores high')
eq(checkPassword('').score, 0, 'password: an empty password scores zero')

/* ---------------------------------------------------------- account sync */

eq(SYNCED_STORES.includes('sessions'), true, 'sync: workouts are synced')
eq(SYNCED_STORES.includes('personalRecords'), true, 'sync: records are synced')
eq(SYNCED_STORES.includes('photos'), true, 'sync: progress photos are synced')
// Ten, since exercise preferences became their own store. That store is what
// lets the shared catalog stay read-only: a favourite is a tiny preference
// row, not a private copy of the exercise.
eq(SYNCED_STORES.length, 10, 'sync: ten collections belong to the account')
eq(SYNCED_STORES.includes('exercisePrefs'), true, 'sync: exercise preferences follow the account')
eq(userCollection('u1', 'sessions'), 'users/u1/sessions', 'sync: every collection hangs off the owner uid')
eq(photoStoragePath('u1', 'p1'), 'users/u1/photos/p1.jpg', 'sync: photos are stored under the owner uid')
eq(usernameDoc('diego'), 'usernames/diego', 'sync: the username index is keyed by the normalised name')

const accountSettings = pickAccountSettings(defaultSettings())
eq(accountSettings.theme, 'light', 'settings: light is the default theme')
eq(accountSettings.units, 'kg', 'settings: kilograms by default')
eq('demoDataPresent' in accountSettings, false, 'settings: device-only flags stay off the account')
eq('availableWeights' in accountSettings, true, 'settings: the gym weight list follows the account')

/* ------------------------------------------- performance: one definition */

const cardioSet = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: 'c', type: 'working', weight: null, reps: null, rir: null, rpe: null,
  completed: true, completedAt: 1, note: '', ...over,
})

eq(isValidStrengthPerformance(set()), true, 'strength: a complete set counts')
eq(isValidStrengthPerformance(set({ weight: 0 })), true, 'strength: zero weight is a real bodyweight set')
eq(isValidStrengthPerformance(set({ weight: null })), false, 'strength: missing weight is not zero weight')
eq(isValidStrengthPerformance(set({ completed: false })), false, 'strength: an unticked set is not data')

eq(isValidCardioPerformance(cardioSet({ durationSec: 1500 })), true, 'cardio: duration alone is enough')
eq(isValidCardioPerformance(cardioSet({ distanceM: 4200 })), true, 'cardio: distance alone is enough')
eq(isValidCardioPerformance(cardioSet()), false, 'cardio: neither duration nor distance is nothing')
eq(isValidCardioPerformance(cardioSet({ durationSec: 0 })), false, 'cardio: zero duration is not a session')
eq(isValidCardioPerformance(cardioSet({ durationSec: 1500, completed: false })), false, 'cardio: still has to be ticked')

eq(isValidMobilityPerformance(cardioSet({ durationSec: 30 })), true, 'mobility: held for time')
eq(isValidMobilityPerformance(cardioSet({ reps: 10 })), true, 'mobility: counted in reps')
eq(isValidMobilityPerformance(cardioSet()), false, 'mobility: neither is nothing')

// The whole point of the abstraction: a strength set never validates as
// cardio, and a cardio set never validates as strength.
eq(isValidPerformance('strength', cardioSet({ durationSec: 1500 })), false, 'a run is not a strength set')
eq(isValidPerformance('cardio', set()), false, 'a bench press is not a cardio entry')
eq(isValidPerformance('cardio', cardioSet({ durationSec: 1500 })), true, 'dispatch: cardio')
eq(isValidPerformance('mobility', cardioSet({ durationSec: 30 })), true, 'dispatch: mobility')

eq(exerciseKind(undefined), 'strength', 'kind: a row with no kind predates cardio and is strength')
eq(exerciseKind({ kind: 'cardio' }), 'cardio', 'kind: read when present')

/* --------------------------------------------------------- cardio maths */

eq(Math.round(paceSecPerKm(1500, 4200) ?? 0), 357, 'pace: 25 min over 4.2 km is 5:57/km')
eq(paceSecPerKm(1500, 0), null, 'pace: no distance, no pace')
eq(paceSecPerKm(0, 4200), null, 'pace: no duration, no pace')
eq(Math.round((speedKmh(3600, 10000) ?? 0) * 10) / 10, 10, 'speed: 10 km in an hour is 10 km/h')

{
  // A 200 m sprint and a 10 km run: averaging the two paces would claim a far
  // faster week than the person actually ran.
  const agg = aggregateCardio([
    cardioSet({ id: 'a', durationSec: 40, distanceM: 200 }),
    cardioSet({ id: 'b', durationSec: 3000, distanceM: 10000 }),
  ])
  eq(agg.entries, 2, 'cardio aggregate: counts entries')
  eq(agg.durationSec, 3040, 'cardio aggregate: sums duration')
  eq(agg.distanceM, 10200, 'cardio aggregate: sums distance')
  const naive = (40 / 0.2 + 3000 / 10) / 2
  eq(Math.round(agg.paceSecPerKm ?? 0), 298, 'cardio aggregate: pace comes from the totals')
  eq(Math.round(agg.paceSecPerKm ?? 0) !== Math.round(naive), true, 'cardio aggregate: not a mean of paces')
}

{
  const agg = aggregateCardio([
    cardioSet({ id: 'a', durationSec: 600, avgHr: 140 }),
    cardioSet({ id: 'b', durationSec: 600 }),
  ])
  eq(agg.avgHr, 140, 'cardio aggregate: heart rate averages only the entries that recorded one')
}

eq(aggregateCardio([set()]).entries, 0, 'cardio aggregate: ignores strength sets entirely')

{
  const agg = aggregateMobility([cardioSet({ durationSec: 45 }), cardioSet({ id: 'b', reps: 12 })])
  eq(agg.entries, 2, 'mobility aggregate: counts both forms')
  eq(agg.durationSec, 45, 'mobility aggregate: sums duration')
  eq(agg.totalReps, 12, 'mobility aggregate: sums reps')
}

/* ------------------------------------------------------- catalog filtering */

const ce = (over: Partial<CatalogEntryRaw>): CatalogEntryRaw => ({
  id: 'lib-x', slug: 'x', kind: 'strength', n: { en: 'X', es: 'X' }, ns: 'reviewed',
  mg: 'chest', pm: { en: 'Chest', es: 'Pectoral' }, eq: 'barbell', t: 'compound',
  d: 'intermediate', inc: 'barbell', def: { sets: 3, repMin: 8, repMax: 12, restSeconds: 120 },
  src: 'training-os', hasInstructions: true, ...over,
})

const bench = ce({ id: 'lib-bench', n: { en: 'Barbell Bench Press', es: 'Press de Banca con Barra' }, curated: true })
const incline = ce({ id: 'lib-incline', slug: 'incline', eq: 'dumbbell', n: { en: 'Incline Dumbbell Press', es: 'Press Inclinado con Mancuernas' } })
const run = ce({ id: 'lib-run', slug: 'run', kind: 'cardio', t: 'cardio', eq: 'machine', mg: 'other', cm: ['duration'], cmo: 'run', n: { en: 'Treadmill', es: 'Cinta de Correr' }, pm: { en: 'Cardio', es: 'Cardio' } })
const all = [bench, incline, run]
const noPrefs = new Map()

eq(fold('Bíceps'), 'biceps', 'fold: strips accents so a phone keyboard is enough')
eq(filterCatalog(all, { search: 'biceps' }, 'es', noPrefs).length, 0, 'search: no false positives')
eq(filterCatalog(all, { search: 'pectoral' }, 'es', noPrefs).length, 2, 'search: matches the Spanish muscle label')
eq(filterCatalog(all, { search: 'banca' }, 'es', noPrefs)[0]?.id, 'lib-bench', 'search: finds the Spanish name')
eq(filterCatalog(all, { search: 'bench' }, 'es', noPrefs)[0]?.id, 'lib-bench', 'search: finds the English name even in Spanish')
eq(filterCatalog(all, { search: 'incline dumbbell' }, 'en', noPrefs).length, 1, 'search: every term must match, so two terms narrow')
eq(filterCatalog(all, { search: 'incline treadmill' }, 'en', noPrefs).length, 0, 'search: terms are ANDed, not ORed')
eq(filterCatalog(all, { kind: 'cardio' }, 'en', noPrefs)[0]?.id, 'lib-run', 'filter: by kind')
eq(filterCatalog(all, { cardioMode: 'run' }, 'en', noPrefs).length, 1, 'filter: by cardio mode')
eq(filterCatalog(all, { equipment: 'dumbbell' }, 'en', noPrefs)[0]?.id, 'lib-incline', 'filter: by equipment')

{
  const prefs = new Map([['lib-incline', { id: 'lib-incline', favorite: true, updatedAt: 1 }]])
  eq(filterCatalog(all, { favoritesOnly: true }, 'en', prefs).length, 1, 'filter: favourites come from prefs, not from the catalog')
  const hidden = new Map([['lib-run', { id: 'lib-run', hidden: true, updatedAt: 1 }]])
  eq(filterCatalog(all, {}, 'en', hidden).length, 3, 'hidden: still searchable by default')
  eq(filterCatalog(all, { excludeHidden: true }, 'en', hidden).length, 2, 'hidden: dropped only from suggestions')
}

{
  const ranked = filterCatalog([incline, run, bench], { preferredEquipment: ['dumbbell'] }, 'en', noPrefs)
  eq(ranked[0].id, 'lib-bench', 'ranking: curated entries lead regardless of equipment')
  eq(ranked[1].id, 'lib-incline', 'ranking: available equipment comes next')
}

/* ------------------------------------------ names resolve at read time */

eq(toExercise(bench, 'es', null).name, 'Press de Banca con Barra', 'name: Spanish when Spanish')
eq(toExercise(bench, 'en', null).name, 'Barbell Bench Press', 'name: English when English')
eq(toExercise(bench, 'en', null).primaryMuscle, 'Chest', 'muscle label follows the language too')
eq(toExercise(run, 'es', null).kind, 'cardio', 'kind survives resolution')
eq(toExercise(bench, 'es', { id: 'lib-bench', favorite: true, updatedAt: 1 }).isFavorite, true, 'prefs: favourite is layered on')
eq(
  toExercise(bench, 'es', { id: 'lib-bench', defaults: { sets: 5 }, updatedAt: 1 }).defaultSets,
  5,
  'prefs: a personal default overrides the catalog',
)
eq(toExercise(bench, 'es', null).defaultSets, 3, 'prefs: absent leaves the catalog default')

/* ------------------------------------------------------ training profile */

eq(emptyTrainingProfile().onboardingVersion, 0, 'profile: never onboarded starts at 0')
eq(isOnboardingCurrent({ onboardingVersion: 0 }), false, 'profile: version 0 needs onboarding')
eq(isOnboardingCurrent({ onboardingVersion: ONBOARDING_VERSION }), true, 'profile: current version does not')
eq(mergeTrainingProfile(null).mainGoal, 'hypertrophy', 'profile: merging nothing gives the defaults')
eq(mergeTrainingProfile({ mainGoal: 'strength' }).mainGoal, 'strength', 'profile: a stored answer survives the merge')
eq(mergeTrainingProfile({ mainGoal: 'strength' }).daysPerWeek, 4, 'profile: unanswered fields fall back')
eq(mergeTrainingProfile({ preferredDays: [] }).preferredDays.length, 0, 'profile: an empty selection is a real answer')

// A key that is present but undefined means "not answered", exactly like a
// missing key. Spreading it raw would overwrite the default with undefined,
// which is what put "undefined días/semana" on the summary screen.
eq(mergeTrainingProfile({ daysPerWeek: undefined }).daysPerWeek, 4, 'profile: an explicit undefined does not clobber the default')
eq(mergeTrainingProfile({ mainGoal: undefined, units: 'lb' }).mainGoal, 'hypertrophy', 'profile: nor for any other field')
eq(mergeTrainingProfile({ sessionDuration: undefined }).sessionDuration, 60, 'profile: nor for session duration')
eq(suggestTemplate(mergeTrainingProfile({ daysPerWeek: undefined })).days, 4, 'template: an unanswered day count still yields a real split')

{
  // An existing account keeps the two answers it already gave.
  const migrated = fromLegacyProfile('strength', 3, 'lb')
  eq(migrated.mainGoal, 'strength', 'migration: the old goal carries over')
  eq(migrated.daysPerWeek, 3, 'migration: the old day count carries over')
  eq(migrated.units, 'lb', 'migration: units come from settings')
  eq(migrated.onboardingVersion, 0, 'migration: still needs the top-up questionnaire')
  eq(fromLegacyProfile(null, null, 'kg').mainGoal, 'hypertrophy', 'migration: no old answer means the default')
  eq(fromLegacyProfile('nonsense', 0, 'kg').daysPerWeek, 4, 'migration: junk is ignored, not stored')
}

eq(GOAL_DEFAULTS.strength.repMax <= GOAL_DEFAULTS.hypertrophy.repMin, true, 'goals: strength works in lower reps than hypertrophy')
// Endurance (12-20) and hypertrophy (8-12) meet at 12, which is how the
// ranges actually work — the test asserts the ceiling moves up, not that the
// ranges are disjoint.
eq(GOAL_DEFAULTS.endurance.repMax > GOAL_DEFAULTS.hypertrophy.repMax, true, 'goals: endurance reaches higher reps')
eq(GOAL_DEFAULTS.strength.primaryMetric, 'e1rm', 'goals: strength leads on estimated 1RM')
eq(GOAL_DEFAULTS.hypertrophy.primaryMetric, 'volume', 'goals: hypertrophy leads on volume')
eq(GOAL_DEFAULTS.fatloss.cardioForward, true, 'goals: fat loss brings cardio forward')
eq(GOAL_DEFAULTS.strength.cardioForward, false, 'goals: pure strength does not')
eq(ENVIRONMENT_EQUIPMENT.bodyweight.length, 1, 'environment: bodyweight implies bodyweight only')
eq(ENVIRONMENT_EQUIPMENT.commercial.includes('barbell'), true, 'environment: a commercial gym has a barbell')
eq(ENVIRONMENT_EQUIPMENT.home.includes('barbell'), false, 'environment: a home gym is not assumed to')

/* ------------------------------------------------- personalization engine */

const prof = (over: Partial<ReturnType<typeof emptyTrainingProfile>> = {}) => ({
  ...emptyTrainingProfile(),
  ...over,
})

{
  const home = prof({ availableEquipment: ['dumbbell', 'band', 'bench', 'bodyweight'] })
  const usable = usableEquipment(home)
  eq(usable.includes('dumbbell'), true, 'equipment: a dumbbell at home is usable')
  eq(usable.includes('barbell'), false, 'equipment: a barbell is not assumed')
  eq(usable.includes('bodyweight'), true, 'equipment: bodyweight is always available')
  eq(usable.includes('other'), true, 'equipment: "other" is never filtered out, so nothing vanishes')
}

{
  const strength = defaultsForExercise(prof({ mainGoal: 'strength' }), false)
  const hyper = defaultsForExercise(prof({ mainGoal: 'hypertrophy' }), false)
  eq(strength.repMax < hyper.repMin || strength.repMax <= hyper.repMax, true, 'defaults: strength works heavier')
  eq(strength.restSeconds > hyper.restSeconds, true, 'defaults: strength rests longer')

  const compound = defaultsForExercise(prof(), false)
  const isolation = defaultsForExercise(prof(), true)
  eq(isolation.repMin > compound.repMin, true, 'defaults: isolation sits higher in the range')
  eq(isolation.restSeconds < compound.restSeconds, true, 'defaults: isolation rests less')

  const beginner = defaultsForExercise(prof({ experienceLevel: 'beginner' }), false)
  const advanced = defaultsForExercise(prof({ experienceLevel: 'advanced' }), false)
  eq(advanced.sets > beginner.sets, true, 'defaults: an advanced lifter starts with more sets')
  eq(beginner.rirTarget > advanced.rirTarget, true, 'defaults: a beginner leaves a rep in reserve')

  const stated = defaultsForExercise(prof({ preferredRepRange: { min: 5, max: 8 } }), false)
  eq(stated.repMin, 5, 'defaults: a range the person stated beats the goal')
}

{
  const three = weeklySetTargets(prof({ daysPerWeek: 3 }))
  const six = weeklySetTargets(prof({ daysPerWeek: 6 }))
  eq((six.chest ?? 0) > (three.chest ?? 0), true, 'volume: more training days carries a higher target')
  eq(Object.values(three).every((v) => (v ?? 0) >= 4), true, 'volume: never drops to a target nobody could miss')

  const older = weeklySetTargets(prof({ daysPerWeek: 4, ageRange: '60+' }))
  const younger = weeklySetTargets(prof({ daysPerWeek: 4, ageRange: '30-39' }))
  eq((older.chest ?? 0) < (younger.chest ?? 0), true, 'volume: eased at the far end of the age range')
}

{
  eq(suggestTemplate(prof({ daysPerWeek: 3, experienceLevel: 'beginner' })).templateId, 'template.fullbody', 'template: a beginner on three days gets full body')
  eq(suggestTemplate(prof({ daysPerWeek: 3, experienceLevel: 'advanced' })).templateId, 'template.ppl', 'template: an advanced lifter on three days gets PPL')
  eq(suggestTemplate(prof({ daysPerWeek: 4 })).days, 4, 'template: four days means a four-day split')
  eq(suggestTemplate(prof({ daysPerWeek: 5 })).dayIds.length, 5, 'template: five distinct days')

  const short = suggestTemplate(prof({ sessionDuration: 30 }))
  const long = suggestTemplate(prof({ sessionDuration: 90 }))
  eq(short.exercisesPerDay < long.exercisesPerDay, true, 'template: a 45-minute window gets a shorter day')
  eq(short.exercisesPerDay >= 3, true, 'template: even a half hour is a real session')
  eq(suggestTemplate(prof({ sessionDuration: 60 })).exercisesPerDay, 5, 'template: an hour is five exercises, not eight')
  eq(long.exercisesPerDay <= 8, true, 'template: capped, because past eight the last ones get skipped anyway')

  // Day names are ids, never Spanish or English text, so switching language
  // renames the day instead of leaving it frozen.
  eq(
    suggestTemplate(prof({ daysPerWeek: 5 })).dayIds.every((d) => d.startsWith('day.')),
    true,
    'template: days are stable ids, not translated strings',
  )
}

{
  eq(emphasisFor(prof({ mainGoal: 'strength' })).primaryMetric, 'e1rm', 'emphasis: strength leads on estimated 1RM')
  eq(emphasisFor(prof({ mainGoal: 'hypertrophy' })).cardioForward, false, 'emphasis: pure hypertrophy does not push cardio')
  eq(emphasisFor(prof({ mainGoal: 'hypertrophy', trainingInterests: ['cardio'] })).cardioForward, true, 'emphasis: saying you like cardio is enough on its own')
  eq(emphasisFor(prof({ mainGoal: 'hypertrophy', secondaryGoal: 'fatloss' })).cardioForward, true, 'emphasis: a secondary goal counts too')
  eq(emphasisFor(prof({ mainGoal: 'fatloss' })).cardioForward, true, 'emphasis: fat loss brings cardio forward')
  eq(emphasisFor(prof({ experienceLevel: 'beginner' })).offerAdvancedSetTypes, false, 'emphasis: drop sets are not pushed at a beginner')
}

{
  const patch = settingsPatchFor(prof({ units: 'lb', mainGoal: 'strength' }))
  eq(patch.units, 'lb', 'settings: units come from the questionnaire')
  eq(patch.defaultRestSeconds, 180, 'settings: strength gets a longer default rest')
  eq('theme' in patch, false, 'settings: finishing onboarding never touches the theme')
  eq('haptics' in patch, false, 'settings: nor anything else the questionnaire did not ask about')
}

/* ------------------------------------------------------------------ i18n */

/**
 * The two dictionaries must hold exactly the same keys.
 *
 * A key present in one and missing in the other shows up as a raw
 * `auth.something` in the interface of whichever language lost it — and only
 * on the screen nobody opened that day. Cheap to assert, expensive to find by
 * hand.
 */
{
  const esKeys = new Set(Object.keys(es))
  const enKeys = new Set(Object.keys(en))
  const onlyEs = [...esKeys].filter((k) => !enKeys.has(k))
  const onlyEn = [...enKeys].filter((k) => !esKeys.has(k))
  eq(onlyEs.join(',') || 'none', 'none', 'i18n: no Spanish key is missing from English')
  eq(onlyEn.join(',') || 'none', 'none', 'i18n: no English key is missing from Spanish')

  // An empty string renders as nothing at all, which looks like a broken
  // screen rather than a missing translation.
  const blank = [...esKeys].filter((k) => !String((es as Record<string, string>)[k]).trim())
  eq(blank.join(',') || 'none', 'none', 'i18n: no translation is empty')
}

/* ------------------------------------------- the questionnaire is the account's */

/**
 * Signing in on a phone that already belongs to someone else must NOT inherit
 * their answers.
 *
 * `settings` is not a synced store, so `resetLocalData` used to leave
 * `onboardingVersion` behind: create a second account on the same phone and it
 * was never asked the questionnaire, and it silently started life with the
 * first person's weekly set targets and rest times. Exactly what was reported
 * as "you deleted the form".
 *
 * Runs against a real IndexedDB implementation (fake-indexeddb), so this is
 * the actual function the app calls, not a re-statement of its logic.
 */
{
  const { writeSettings, readSettings } = await import('../src/lib/db/database')
  const { resetLocalData } = await import('../src/lib/sync/engine')

  await writeSettings({
    onboardingVersion: 1,
    trainingProfile: { mainGoal: 'strength', daysPerWeek: 3 },
    defaultRestSeconds: 180,
    weeklySetTargets: { chest: 22 },
    theme: 'dark',
    language: 'en',
  })

  await resetLocalData('otro-usuario')
  const after = await readSettings()

  eq(after.onboardingVersion, 0, 'reset: la cuenta nueva vuelve a tener que responder el cuestionario')
  eq(after.trainingProfile, null, 'reset: no hereda el perfil de entrenamiento del anterior')
  eq(after.defaultRestSeconds, 120, 'reset: los descansos vuelven al valor por defecto')
  eq(after.weeklySetTargets.chest !== 22, true, 'reset: no hereda los objetivos semanales del anterior')

  // Device preferences are NOT someone else's data — they are this phone's.
  eq(after.theme, 'dark', 'reset: el tema es del dispositivo y se respeta')
  eq(after.language, 'en', 'reset: el idioma es del dispositivo y se respeta')

  // And a device that had never onboarded is left alone entirely.
  await writeSettings({ onboardingVersion: 0, trainingProfile: null })
  const before = await readSettings()
  await resetLocalData('otro-mas')
  const untouched = await readSettings()
  eq(untouched.updatedAt, before.updatedAt, 'reset: si no había nada que limpiar, no se escribe nada')
}

/* --------------------------------------------------------------- report */

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
