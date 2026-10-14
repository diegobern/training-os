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

/* ------------------------------------------- datos de ejemplo: fuera */
/*
 * The old "Load DEMO data" button is gone, but whoever pressed it still has
 * its records. The start-up purge removes them — and only them: a session,
 * a routine and a body weight the person logged must survive untouched.
 */
{
  const { getDB, writeSettings } = await import('../src/lib/db/database')
  const { commitCompletedSession, makeSet } = await import('../src/lib/db/repo.sessions')
  const { makeRoutine, saveRoutine } = await import('../src/lib/db/repo.routines')
  const { addBodyweight } = await import('../src/lib/db/repo.body')
  const { purgeSampleData, purgeSampleDataOnce, isSampleRecord } = await import('../src/lib/db/sampleData')
  const db = await getDB()

  const finished = (id: string, demo: boolean): WorkoutSession => {
    const set = { ...makeSet('working'), weight: 60, reps: 8, completed: true, completedAt: 1 }
    return {
      id,
      routineId: null,
      routineName: '',
      dayId: null,
      dayName: 'Día',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_900_000,
      durationSec: 900,
      pausedMs: 0,
      pausedAt: null,
      notes: '',
      exercises: [
        {
          id: `${id}-ex`,
          exerciseId: 'lib-barbell-bench-press',
          name: 'Press de banca',
          muscleGroup: 'chest',
          order: 0,
          targetSets: 1,
          repMin: 6,
          repMax: 10,
          rirTarget: null,
          rpeTarget: null,
          restSeconds: 120,
          sets: [set],
          sessionNote: '',
        },
      ],
      demo,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    }
  }

  await commitCompletedSession(finished('ses-sample', true))
  await commitCompletedSession(finished('ses-mine', false))
  const sampleRoutine = await saveRoutine(makeRoutine('Rutina de ejemplo'))
  await db.put('routines', { ...sampleRoutine, demo: true })
  const myRoutine = await saveRoutine(makeRoutine('Mi rutina'))
  await addBodyweight(80, '2026-10-01', '')
  await addBodyweight(81, '2026-10-02', '')
  const [bw1] = await db.getAllFromIndex('bodyweight', 'by-date', '2026-10-01')
  await db.put('bodyweight', { ...bw1, demo: true })
  await writeSettings({ demoDataPresent: true })

  const removed = await purgeSampleData()
  eq(removed >= 4, true, `ejemplo: se borran los datos de ejemplo (${removed})`)
  eq(await db.get('sessions', 'ses-sample'), undefined, 'ejemplo: la sesión de ejemplo desaparece')
  eq(
    (await db.getAllFromIndex('exerciseLogs', 'by-session', 'ses-sample')).length,
    0,
    'ejemplo: y los registros que salieron de ella',
  )
  eq(await db.get('routines', sampleRoutine.id), undefined, 'ejemplo: la rutina de ejemplo desaparece')
  eq(await db.get('bodyweight', bw1.id), undefined, 'ejemplo: el peso de ejemplo desaparece')
  eq((await db.get('sessions', 'ses-mine'))?.id, 'ses-mine', 'ejemplo: la sesión de la persona se queda')
  eq(
    (await db.getAllFromIndex('exerciseLogs', 'by-session', 'ses-mine')).length,
    1,
    'ejemplo: con sus registros',
  )
  eq((await db.get('routines', myRoutine.id))?.name, 'Mi rutina', 'ejemplo: la rutina de la persona se queda')
  eq((await db.getAllFromIndex('bodyweight', 'by-date', '2026-10-02')).length, 1, 'ejemplo: su peso también')
  const queue = await db.getAll('syncQueue')
  eq(
    queue.some((q) => q.id === 'sessions:ses-sample' && q.op === 'delete'),
    true,
    'ejemplo: el borrado se encola para la cuenta, no sólo para el móvil',
  )
  eq((await db.get('settings', 'app'))?.demoDataPresent ?? false, false, 'ejemplo: el dispositivo deja de creer que tiene datos de ejemplo')

  // Once per device: the second launch does not scan again.
  await purgeSampleDataOnce()
  const late = await saveRoutine(makeRoutine('Llegó tarde'))
  await db.put('routines', { ...late, demo: true })
  await purgeSampleDataOnce()
  eq((await db.get('routines', late.id))?.id, late.id, 'ejemplo: la pasada de arranque se hace una sola vez')
  await purgeSampleData()

  eq(isSampleRecord({ demo: true }), true, 'ejemplo: un registro marcado como ejemplo se reconoce')
  eq(isSampleRecord({ demo: false }) || isSampleRecord({ demo: 'true' }) || isSampleRecord(null), false, 'ejemplo: nada más se toma por ejemplo')
}

/* ------------------------------------------------- pila de descartables */
/*
 * El botón "atrás" de Android tiene que cerrar lo último que se abrió, y sólo
 * eso. La pila es lo que lo decide, así que se prueba de verdad en lugar de
 * confiar en que el orden salga bien.
 */
{
  const { pushDismissable, dismissTop, hasDismissable, resetDismissStack } = await import(
    '../src/lib/ui/dismissStack'
  )

  resetDismissStack()
  eq(hasDismissable(), false, 'descartables: sin nada abierto, no hay nada que cerrar')
  eq(dismissTop(), false, 'descartables: cerrar sin nada abierto no hace nada y lo dice')

  const closed: string[] = []
  const releaseA = pushDismissable(() => closed.push('a'))
  const releaseB = pushDismissable(() => closed.push('b'))

  eq(hasDismissable(), true, 'descartables: con dos hojas abiertas hay algo que cerrar')
  eq(dismissTop(), true, 'descartables: cerrar devuelve true cuando había algo')
  eq(closed.join(','), 'b', 'descartables: se cierra la de arriba, no la de abajo')

  // El componente cerrado es quien se desapunta, al desmontarse.
  releaseB()
  dismissTop()
  eq(closed.join(','), 'b,a', 'descartables: la siguiente pulsación cierra la de abajo')

  releaseA()
  eq(hasDismissable(), false, 'descartables: al cerrarse todo, la pila queda vacía')

  // Desapuntar dos veces es un caso real: React puede ejecutar la limpieza de
  // un efecto y luego desmontar el componente.
  releaseA()
  eq(hasDismissable(), false, 'descartables: desapuntar dos veces no rompe la pila')

  // Y el orden se mantiene aunque se desapunte por el medio.
  resetDismissStack()
  const order: string[] = []
  const r1 = pushDismissable(() => order.push('1'))
  const r2 = pushDismissable(() => order.push('2'))
  pushDismissable(() => order.push('3'))
  r2()
  dismissTop()
  eq(order.join(','), '3', 'descartables: quitar uno del medio no altera quién está arriba')
  r1()
  resetDismissStack()
}

/* ----------------------------------------------------- detección de plataforma */
/*
 * `isNative()` decide si se registra el service worker, si se abre un enlace
 * fuera de la app y si se habla con el plugin propio; `isNativeAndroid()` y
 * `isNativeIOS()`, lo que sólo existe en una de las dos (botón atrás, gesto de
 * volver). Si alguna devolviera `true` por error en un navegador, la web se
 * quedaría sin actualizaciones.
 */
{
  const { isNative, platform, isNativeAndroid, isNativeIOS } = await import('../src/lib/native/platform')
  const w = globalThis as unknown as { Capacitor?: unknown }
  const original = w.Capacitor

  delete w.Capacitor
  eq(isNative(), false, 'plataforma: sin el global de Capacitor, no es nativo')
  eq(platform(), 'web', 'plataforma: sin el global de Capacitor, es web')
  eq(isNativeAndroid(), false, 'plataforma: un navegador nunca es Android nativo')
  eq(isNativeIOS(), false, 'plataforma: un navegador nunca es iOS nativo')

  // Un objeto Capacitor presente pero que dice que NO es nativo: es el caso
  // real de la web cuando alguien sirve el bundle con el puente cargado.
  w.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }
  eq(isNativeAndroid(), false, 'plataforma: Capacitor en modo web sigue siendo web')
  eq(isNativeIOS(), false, 'plataforma: Capacitor en modo web tampoco es iOS')

  w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }
  eq(isNative(), true, 'plataforma: dentro del APK sí es nativo')
  eq(platform(), 'android', 'plataforma: dentro del APK la plataforma es android')
  eq(isNativeAndroid(), true, 'plataforma: dentro del APK isNativeAndroid es true')
  eq(isNativeIOS(), false, 'plataforma: dentro del APK no es iOS')

  w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
  eq(isNativeAndroid(), false, 'plataforma: iOS es nativo pero no es Android')
  eq(isNative(), true, 'plataforma: dentro de la app de iPhone sí es nativo')
  eq(platform(), 'ios', 'plataforma: dentro de la app de iPhone la plataforma es ios')
  eq(isNativeIOS(), true, 'plataforma: dentro de la app de iPhone isNativeIOS es true')

  // Una plataforma que no conocemos no es ninguna de las dos.
  w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'electron' }
  eq(platform(), 'web', 'plataforma: una plataforma desconocida se trata como web')
  eq(isNativeAndroid() || isNativeIOS(), false, 'plataforma: y no activa nada de Android ni de iOS')

  if (original === undefined) delete w.Capacitor
  else w.Capacitor = original
}

/* -------------------------------------- catálogo: copia en caché vigente */
/*
 * Filling in the Spanish instructions changed the content of
 * instructions.json without changing its format or the catalog version. A
 * phone holding the old copy in IndexedDB must fetch the new one; a phone
 * whose copy is the same file must not fetch anything.
 */
{
  const { cachedRowIsCurrent, catalogRevision, CATALOG_VERSION } = await import('../src/lib/catalog/store')
  const revs = { [`v${CATALOG_VERSION}/instructions`]: 'aaa111', [`v${CATALOG_VERSION}/exercises`]: 'bbb222' }
  eq(catalogRevision('instructions', revs), 'aaa111', 'catálogo: la huella se busca por versión y fichero')
  eq(catalogRevision('media-index', revs), null, 'catálogo: un fichero sin huella no tiene revisión')
  eq(cachedRowIsCurrent({ version: CATALOG_VERSION, rev: 'aaa111' }, 'aaa111'), true, 'catálogo: misma huella → se usa la copia, sin red')
  eq(cachedRowIsCurrent({ version: CATALOG_VERSION, rev: 'old000' }, 'aaa111'), false, 'catálogo: contenido nuevo → se vuelve a pedir')
  eq(
    cachedRowIsCurrent({ version: CATALOG_VERSION }, 'aaa111'),
    false,
    'catálogo: una copia guardada antes de existir las huellas se renueva una vez',
  )
  eq(cachedRowIsCurrent({ version: CATALOG_VERSION - 1, rev: 'aaa111' }, 'aaa111'), false, 'catálogo: otra versión del catálogo nunca vale')
  eq(cachedRowIsCurrent({ version: CATALOG_VERSION }, null), true, 'catálogo: sin huella en el build manda sólo la versión, como antes')
  eq(cachedRowIsCurrent(undefined, 'aaa111'), false, 'catálogo: sin copia, se pide')
}

/* --------------------------------------------------- cronómetro del entreno */
/*
 * The one formula behind the session header, the bar that follows the workout
 * around the app and the lock-screen notification. It must also agree with
 * the duration `finishSession` stores, or the summary would contradict the
 * clock the person has been watching.
 */
{
  const { elapsedSeconds } = await import('../src/hooks/useElapsed')
  eq(elapsedSeconds(10_000, 4_000, 1_000), 5, 'cronómetro: descuenta el tiempo en pausa')
  eq(elapsedSeconds(10_000, undefined, 0), 0, 'cronómetro: sin sesión marca cero')
  eq(elapsedSeconds(1_000, 5_000, 0), 0, 'cronómetro: un reloj que va hacia atrás no da tiempo negativo')
  eq(elapsedSeconds(1_499, 0.0001, 0), 1, 'cronómetro: redondea al segundo más cercano (abajo)')
  eq(elapsedSeconds(2_500, 1_000, 0), 2, 'cronómetro: redondea al segundo más cercano (arriba)')
  const start = 1_700_000_000_000
  const now = start + 3 * 3600_000 + 17_400
  eq(
    elapsedSeconds(now, start, 60_000),
    Math.max(0, Math.round((now - start - 60_000) / 1000)),
    'cronómetro: misma cuenta que la duración que guarda finishSession',
  )
}

/* ------------------------------------------- resumen antes de finalizar */
{
  const { sessionProgress } = await import('../src/lib/training/sessionProgress')
  const set = (patch: Partial<SetEntry>): SetEntry => ({
    id: Math.random().toString(36).slice(2),
    type: 'working',
    weight: null,
    reps: null,
    rir: null,
    rpe: null,
    completed: false,
    completedAt: null,
    note: '',
    ...patch,
  })
  const exercise = (exerciseId: string, sets: SetEntry[]) => ({
    id: exerciseId,
    exerciseId,
    name: exerciseId,
    muscleGroup: 'chest' as const,
    order: 0,
    targetSets: sets.length,
    repMin: 8,
    repMax: 12,
    rirTarget: null,
    rpeTarget: null,
    restSeconds: 90,
    sets,
    sessionNote: '',
  })
  const session = (exercises: ReturnType<typeof exercise>[]): WorkoutSession => ({
    id: 's1',
    routineId: null,
    routineName: '',
    dayId: null,
    dayName: 'Push',
    status: 'active',
    startedAt: 0,
    endedAt: null,
    durationSec: 0,
    pausedMs: 0,
    pausedAt: null,
    notes: '',
    exercises,
    demo: false,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  })

  const mixed = session([
    exercise('bench', [
      set({ type: 'warmup', weight: 40, reps: 10, completed: true }),
      set({ weight: 80, reps: 8, completed: true }),
      set({ weight: 80, reps: null }),
    ]),
    exercise('fly', [set({})]),
  ])
  eq(
    sessionProgress(mixed, true),
    { doneSets: 1, totalSets: 3, loggedExercises: 1, totalExercises: 2, anyLogged: true },
    'resumen: cuenta como la cabecera, sin calentamiento si el ajuste lo pide',
  )
  eq(
    sessionProgress(mixed, false),
    { doneSets: 2, totalSets: 4, loggedExercises: 1, totalExercises: 2, anyLogged: true },
    'resumen: con el calentamiento dentro si el ajuste no lo excluye',
  )

  // Ticked but without reps: it counts as done in the header, but finishing
  // would save nothing — which is exactly the case for the discard dialog.
  const tickedEmpty = session([exercise('bench', [set({ weight: 80, completed: true })])])
  eq(sessionProgress(tickedEmpty, true).doneSets, 1, 'resumen: una serie marcada sin reps cuenta como hecha')
  eq(sessionProgress(tickedEmpty, true).anyLogged, false, 'resumen: pero no hay nada que guardar, así que se ofrece descartar')
  eq(
    sessionProgress(session([]), true),
    { doneSets: 0, totalSets: 0, loggedExercises: 0, totalExercises: 0, anyLogged: false },
    'resumen: una sesión vacía no tiene nada que guardar',
  )
}

/* ------------------------------------------ aviso de la pantalla de bloqueo */
/*
 * The JavaScript half of the Android notification, against a fake native
 * side shaped exactly like the one Capacitor injects into the WebView:
 * `androidBridge`, `PluginHeaders`, `nativePromise` and `nativeCallback`. The
 * real @capacitor/core is what talks to it, so these exercise the same code
 * path the APK runs. The Java half is checked by scripts/android and on a
 * device. The iOS half (same plugin, other rules for the permission) runs in
 * its own bundle, tests/unit-native.ts: @capacitor/core keeps the first
 * Capacitor global it sees, so one bundle can only be one platform.
 */
{
  type Call = { method: string; options: Record<string, unknown> }
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { Capacitor: g.Capacitor, androidBridge: g.androidBridge, localStorage: g.localStorage }

  const store = new Map<string, string>()
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }

  const calls: Call[] = []
  const scenario = {
    permission: 'prompt',
    afterRequest: 'granted',
    failStart: false,
    failHaptic: false,
    delivered: true,
    exactAlarms: false,
  }
  let tap: ((data: unknown) => void) | null = null

  // Before anything imports @capacitor/core: it reads these once, on load.
  g.androidBridge = { postMessage: () => {} }
  g.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {},
    PluginHeaders: [
      {
        name: 'WorkoutNotification',
        methods: [
          { name: 'start', rtype: 'promise' },
          { name: 'stop', rtype: 'promise' },
          { name: 'scheduleRestAlert', rtype: 'promise' },
          { name: 'cancelRestAlert', rtype: 'promise' },
          { name: 'haptic', rtype: 'promise' },
          { name: 'isSupported', rtype: 'promise' },
          { name: 'checkPermissions', rtype: 'promise' },
          { name: 'requestPermissions', rtype: 'promise' },
          { name: 'requestExactAlarm', rtype: 'promise' },
          { name: 'addListener', rtype: 'callback' },
          { name: 'removeListener', rtype: 'promise' },
        ],
      },
    ],
    nativePromise: async (plugin: string, method: string, options: Record<string, unknown> = {}) => {
      if (plugin !== 'WorkoutNotification') throw new Error('no native ' + plugin)
      calls.push({ method, options })
      if (method === 'checkPermissions') return { display: scenario.permission }
      if (method === 'requestPermissions') {
        scenario.permission = scenario.afterRequest
        return { display: scenario.permission }
      }
      if (method === 'start') {
        if (scenario.failStart) throw new Error('el plugin ha fallado')
        return { shown: true }
      }
      if (method === 'scheduleRestAlert') return { scheduled: true, exact: scenario.exactAlarms }
      if (method === 'cancelRestAlert') return { delivered: scenario.delivered }
      if (method === 'haptic' && scenario.failHaptic) throw new Error('sin vibrador')
      if (method === 'isSupported') return { presence: true, restAlerts: true, exactAlarms: scenario.exactAlarms }
      if (method === 'requestExactAlarm') {
        scenario.exactAlarms = true
        return { exactAlarms: true }
      }
      return {}
    },
    nativeCallback: (plugin: string, method: string, options: Record<string, unknown>, cb: (data: unknown) => void) => {
      calls.push({ method, options })
      if (plugin === 'WorkoutNotification' && method === 'addListener' && options.eventName === 'open') tap = cb
      return 'cb-1'
    },
  }

  const notice = await import('../src/lib/native/workoutNotification')
  const methods = () => calls.map((c) => c.method)
  // Lo que construye buildWorkoutPresence para un día «Push» sin descanso,
  // con la app en español y en Android (lleva los textos del canal).
  const payload = {
    sessionId: 'sesion-1',
    startedAt: 1_700_000_000_000,
    title: 'Entrenamiento en curso',
    body: 'Push · 0 de 3 series',
    sessionName: 'Push',
    exerciseName: null,
    setLabel: null,
    progressLabel: '0 de 3 series',
    rest: null,
    labels: { rest: 'Descanso', restOver: 'Descanso terminado', elapsed: 'Duración', paused: 'En pausa' },
    locale: 'es-ES',
    channelName: 'Entrenamiento en curso',
    channelDescription: 'Muestra en la pantalla de bloqueo el tiempo que llevas entrenando mientras dure el entrenamiento.',
  }

  await notice.showWorkoutPresence(payload)
  eq(
    methods(),
    ['checkPermissions', 'requestPermissions', 'start'],
    'aviso: el primer entrenamiento pide permiso y, concedido, publica el aviso',
  )
  eq(calls[2]?.options, payload, 'aviso: llega al nativo la hora de inicio, el título y el texto, tal cual')

  calls.length = 0
  await notice.showWorkoutPresence(payload)
  eq(methods(), [], 'aviso: lo mismo otra vez no cruza el puente (deduplicado por lo que se ve)')

  calls.length = 0
  await notice.showWorkoutPresence({ ...payload, body: 'Push · 1 de 3 series', progressLabel: '1 de 3 series' })
  eq(methods(), ['checkPermissions', 'start'], 'aviso: con permiso ya concedido no se vuelve a preguntar')

  calls.length = 0
  await notice.hideWorkoutPresence()
  eq(methods(), ['stop'], 'aviso: terminar o descartar lo retira')

  calls.length = 0
  await notice.showWorkoutPresence({ ...payload, body: 'Push · 1 de 3 series', progressLabel: '1 de 3 series' })
  eq(methods(), ['checkPermissions', 'start'], 'aviso: tras retirarlo, el mismo aviso se vuelve a publicar (la retirada borra la clave)')

  // El aviso de «Descanso terminado», con permiso: se programa tal cual.
  const alert = {
    sessionId: 'sesion-1',
    at: 1_700_000_090_000,
    title: 'Descanso terminado',
    body: 'Siguiente serie: Press banca',
    sound: true,
    vibrate: true,
    channelName: 'Fin del descanso',
    channelDescription: 'Avisa cuando termina el descanso entre series.',
  }
  calls.length = 0
  const scheduled = await notice.scheduleRestAlert(alert)
  eq(methods(), ['checkPermissions', 'scheduleRestAlert'], 'descanso: con permiso se programa el aviso')
  eq(calls[1]?.options, alert, 'descanso: llega al nativo la hora, los textos y los ajustes, tal cual')
  eq(scheduled, { scheduled: true, exact: false }, 'descanso: se sabe si quedó programado y si es exacto')

  calls.length = 0
  eq(await notice.cancelRestAlert(), { delivered: true }, 'descanso: cancelar dice si el aviso ya había salido')
  eq(methods(), ['cancelRestAlert'], 'descanso: cancelar no pregunta permisos')

  calls.length = 0
  eq(await notice.isSupported(), { presence: true, restAlerts: true, exactAlarms: false }, 'descanso: se sabe si hay alarma exacta')
  eq(await notice.requestExactAlarm(), { exactAlarms: true }, 'descanso: pedir la alarma exacta contesta si se concedió')
  eq(methods(), ['isSupported', 'requestExactAlarm'], 'descanso: consultar y pedir la alarma exacta van directos')

  calls.length = 0
  await notice.nativeHaptic('pr')
  eq(calls, [{ method: 'haptic', options: { kind: 'pr' } }], 'háptica: llega al nativo el tipo de vibración')
  scenario.failHaptic = true
  let threw = false
  await notice.nativeHaptic('tick').catch(() => (threw = true))
  eq(threw, false, 'háptica: si el nativo falla, nadie se entera')
  scenario.failHaptic = false

  // Denied: never asked again, never shown, and nothing thrown at the caller.
  scenario.permission = 'denied'
  calls.length = 0
  threw = false
  await notice.showWorkoutPresence(payload).catch(() => (threw = true))
  eq(methods(), ['checkPermissions'], 'aviso: con el permiso denegado no se publica nada')
  eq(threw, false, 'aviso: el permiso denegado no rompe nada')

  calls.length = 0
  eq(await notice.scheduleRestAlert(alert), null, 'descanso: con el permiso denegado no se programa nada')
  eq(methods(), ['checkPermissions'], 'descanso: y no llega a llamar a scheduleRestAlert')

  // A second fresh install would ask; one that has already asked does not.
  scenario.permission = 'prompt'
  calls.length = 0
  await notice.showWorkoutPresence(payload)
  eq(methods(), ['checkPermissions'], 'aviso: el permiso se pide UNA vez, no en cada entrenamiento')

  // The plugin failing must not reach the workout.
  scenario.permission = 'granted'
  scenario.failStart = true
  threw = false
  await notice.showWorkoutPresence(payload).catch(() => (threw = true))
  eq(threw, false, 'aviso: si el plugin falla, el entrenamiento ni se entera')
  scenario.failStart = false

  // Order: a show still waiting must not land after the hide that follows it.
  calls.length = 0
  void notice.showWorkoutPresence(payload)
  await notice.hideWorkoutPresence()
  eq(methods().at(-1), 'stop', 'aviso: las llamadas van en fila; un stop nunca queda antes que su start')
  eq(methods().includes('start'), false, 'aviso: y el start que esperaba en la fila ya no publica nada')

  // forceStopNative (cerrar sesión, borrar todo): retira y olvida la clave.
  await notice.showWorkoutPresence(payload)
  calls.length = 0
  await notice.forceStopNative()
  await notice.showWorkoutPresence(payload)
  eq(methods().filter((m) => m === 'stop').length, 2, 'aviso: la retirada urgente manda el stop ya y otro al final de la fila')
  eq(methods().at(-1), 'start', 'aviso: y después el mismo aviso se vuelve a publicar (no se queda deduplicado)')

  let tapped: unknown[] = []
  const off = notice.onWorkoutNoticeTap((e) => tapped.push(e))
  await new Promise((r) => setTimeout(r, 20))
  const emit = tap as ((data: unknown) => void) | null
  emit?.({})
  eq(tapped.length, 1, 'aviso: tocar la notificación llega a quien escucha')
  emit?.({ sessionId: 'sesion-1' })
  emit?.({ sessionId: 42 })
  emit?.(null)
  eq(tapped, [{}, { sessionId: 'sesion-1' }, {}, {}], 'aviso: el toque trae el id de la sesión, y sólo si es una cadena')
  tapped = []
  off()

  if (saved.Capacitor === undefined) delete g.Capacitor
  else g.Capacitor = saved.Capacitor
  if (saved.androidBridge === undefined) delete g.androidBridge
  else g.androidBridge = saved.androidBridge
  if (saved.localStorage === undefined) delete g.localStorage
  else g.localStorage = saved.localStorage
}

/* ------------------------------------------------- aviso: en web, nada */
{
  // Without the Capacitor global (a browser) the same calls are no-ops and do
  // not even reach for the bridge.
  const g = globalThis as unknown as Record<string, unknown>
  const had = g.Capacitor
  delete g.Capacitor
  const { isNative } = await import('../src/lib/native/platform')
  const notice = await import('../src/lib/native/workoutNotification')
  let threw = false
  const presence = {
    sessionId: 's',
    startedAt: 1,
    title: 't',
    body: 'b',
    sessionName: 'n',
    exerciseName: null,
    setLabel: null,
    progressLabel: 'p',
    rest: null,
    labels: { rest: 'r', restOver: 'o', elapsed: 'e', paused: 'p' },
    locale: 'es-ES',
  }
  await notice.showWorkoutPresence(presence).catch(() => (threw = true))
  await notice.hideWorkoutPresence().catch(() => (threw = true))
  const web = {
    alert: await notice.scheduleRestAlert({ sessionId: 's', at: 1, title: 't', body: 'b', sound: true, vibrate: true }),
    cancel: await notice.cancelRestAlert(),
    support: await notice.isSupported(),
  }
  await notice.nativeHaptic('tick').catch(() => (threw = true))
  await notice.forceStopNative().catch(() => (threw = true))
  eq(isNative() === false && threw === false, true, 'aviso: en el navegador es un no-op silencioso')
  eq(web, { alert: null, cancel: null, support: null }, 'aviso: en el navegador no hay descanso, ni cancelación, ni soporte')
  if (had !== undefined) g.Capacitor = had
}

/* ------------------------- lote C: límites de las series y peso corporal */
{
  const { parseSetField, canCompleteSet } = await import('../src/lib/training/setInput')

  eq(parseSetField('weight', '-20'), { value: null, invalid: true }, 'serie: un peso negativo es inválido y no se guarda')
  eq(parseSetField('weight', '0'), { value: 0, invalid: false }, 'serie: 0 kg es un peso válido (sin carga)')
  eq(parseSetField('weight', '32,5'), { value: 32.5, invalid: false }, 'serie: el peso acepta coma decimal')
  eq(parseSetField('weight', 'abc'), { value: null, invalid: true }, 'serie: un peso que no es un número es inválido')
  eq(parseSetField('weight', '  '), { value: null, invalid: false }, 'serie: un campo vacío no es un error, es «sin registrar»')
  eq(parseSetField('reps', '500'), { value: null, invalid: true }, 'serie: 500 repeticiones es inválido')
  eq(parseSetField('reps', '0'), { value: null, invalid: true }, 'serie: 0 repeticiones es inválido')
  eq(parseSetField('reps', '100'), { value: 100, invalid: false }, 'serie: 100 repeticiones es el máximo y vale')
  eq(parseSetField('reps', '1'), { value: 1, invalid: false }, 'serie: 1 repetición es el mínimo y vale')
  eq(parseSetField('reps', '8,6'), { value: 9, invalid: false }, 'serie: las repeticiones se redondean como antes')
  eq(parseSetField('rir', '25'), { value: null, invalid: true }, 'serie: RIR 25 es inválido')
  eq(parseSetField('rir', '-1'), { value: null, invalid: true }, 'serie: RIR negativo es inválido')
  eq(parseSetField('rir', '0'), { value: 0, invalid: false }, 'serie: RIR 0 vale (al fallo)')
  eq(parseSetField('rir', '1,5'), { value: 1.5, invalid: false }, 'serie: RIR con coma decimal vale')
  eq(parseSetField('rpe', '0'), { value: null, invalid: true }, 'serie: RPE 0 es inválido (la escala empieza en 1)')
  eq(parseSetField('rpe', '8.5'), { value: 8.5, invalid: false }, 'serie: RPE 8.5 vale')
  eq(parseSetField('rpe', '11'), { value: null, invalid: true }, 'serie: RPE 11 es inválido')

  eq(canCompleteSet({ weight: null, reps: 15 }, true), true, 'peso corporal: 15 reps sin peso se pueden marcar')
  eq(canCompleteSet({ weight: null, reps: 15 }, false), false, 'con carga: sin peso no se puede marcar, como antes')
  eq(canCompleteSet({ weight: null, reps: null }, true), false, 'peso corporal: sin repeticiones no se puede marcar')
  eq(canCompleteSet({ weight: 20, reps: 8 }, false), true, 'con carga: peso y reps se pueden marcar')
  // What the tick stores for an empty bodyweight set (weight 0) counts like any
  // other set; the definition for everything else is untouched.
  eq(isValidStrengthPerformance(set({ weight: 0, reps: 15 })), true, 'peso corporal: la serie guardada con 0 kg cuenta')
  eq(isValidStrengthPerformance(set({ weight: null, reps: 15 })), false, 'una serie sin peso registrado sigue sin contar')
}

/* -------------------------------- lote C: rango de repeticiones en listas */
{
  const { repRangeLabel } = await import('../src/lib/training/repRange')
  eq(repRangeLabel({ kind: 'cardio', repMin: 0, repMax: 0 }), null, 'rango: el cardio no muestra «0–0 reps»')
  eq(repRangeLabel({ kind: 'cardio', repMin: 8, repMax: 12 }), null, 'rango: el cardio nunca muestra repeticiones')
  eq(repRangeLabel({ kind: 'mobility', repMin: 0, repMax: 0 }), null, 'rango: un rango vacío no se muestra')
  eq(repRangeLabel({ kind: 'strength', repMin: 1, repMax: 1 }), null, 'rango: «1–1 reps» no se muestra')
  eq(repRangeLabel({ kind: 'strength', repMin: 8, repMax: 12 }), '8–12', 'rango: un rango normal se muestra')
  eq(repRangeLabel({ kind: 'strength', repMin: 12, repMax: 12 }), '12', 'rango: mínimo igual a máximo es un solo número')
  eq(repRangeLabel({ repMin: 6, repMax: 10 }), '6–10', 'rango: un ejercicio sin «kind» es de fuerza')
}

/* ------------------------------ lote C: rotación de días de la rutina */
{
  const { nextDayIndex, lastDayIdForRoutine, makeRoutine } = await import('../src/lib/db/repo.routines')
  const re = (id: string) => ({
    id,
    exerciseId: id,
    order: 0,
    targetSets: 3,
    repMin: 8,
    repMax: 12,
    rirTarget: null,
    rpeTarget: null,
    restSeconds: 90,
    notes: '',
  })
  const day = (id: string, exercises: number) => ({
    id,
    name: id,
    order: 0,
    exercises: Array.from({ length: exercises }, (_, i) => re(`${id}-${i}`)),
  })

  const full = makeRoutine('Torso/Pierna', [day('torsoA', 2), day('piernaA', 2), day('torsoB', 2)])
  eq(nextDayIndex(full, null), 0, 'rotación: sin historial empieza por el primer día')
  eq(nextDayIndex(full, 'torsoA'), 1, 'rotación: tras el primer día toca el segundo')
  eq(nextDayIndex(full, 'torsoB'), 0, 'rotación: tras el último vuelve al primero')
  eq(nextDayIndex(full, 'borrado'), 0, 'rotación: un día que ya no existe vuelve al primero')
  eq(nextDayIndex(makeRoutine('vacía'), null), -1, 'rotación: una rutina sin días no propone nada')

  const gaps = makeRoutine('Con huecos', [day('a', 0), day('b', 3), day('c', 0), day('d', 1)])
  eq(nextDayIndex(gaps, null), 1, 'rotación: sin historial salta el primer día si está vacío')
  eq(nextDayIndex(gaps, 'b'), 3, 'rotación: salta los días sin ejercicios')
  eq(nextDayIndex(gaps, 'd'), 1, 'rotación: al dar la vuelta también salta los vacíos')
  const empty = makeRoutine('Todo vacío', [day('x', 0), day('y', 0)])
  eq(nextDayIndex(empty, null), 0, 'rotación: si todos los días están vacíos se queda la rotación simple')
  eq(nextDayIndex(empty, 'x'), 1, 'rotación: y sigue avanzando de uno en uno')

  // Newest first, as listSessions returns them.
  const free = { routineId: null, dayId: null }
  const other = { routineId: 'otra-rutina', dayId: 'piernaA' }
  const torso = { routineId: full.id, dayId: 'torsoA' }
  eq(lastDayIdForRoutine(full, [free, torso]), 'torsoA', 'rotación: un entrenamiento libre no reinicia la rutina')
  eq(nextDayIndex(full, lastDayIdForRoutine(full, [free, torso])), 1, 'rotación: tras TORSO A y un libre, toca PIERNA A')
  eq(lastDayIdForRoutine(full, [other, torso]), 'torsoA', 'rotación: una sesión de otra rutina no cuenta')
  eq(
    lastDayIdForRoutine(full, [{ routineId: full.id, dayId: 'borrado' }, torso]),
    'torsoA',
    'rotación: una sesión de un día ya borrado se ignora',
  )
  eq(lastDayIdForRoutine(full, [free, other]), null, 'rotación: sin sesiones de esta rutina no hay día anterior')
}

/* ------------------------------------- números en el idioma de la app */
{
  // The formatters write for the app's language once `useApp` sets it; until
  // then (and after a reset) they behave exactly as before.
  const f = await import('../src/lib/format')
  eq(f.trimNum(32.5), '32.5', 'formato: sin idioma fijado, punto decimal como siempre')
  eq(f.trimNum(100, 0), '100', 'formato: sin decimales no se comen los ceros de las decenas')

  f.setFormatLocale('es-ES')
  eq(f.trimNum(32.5), '32,5', 'formato: en español, coma decimal')
  eq(f.fmtWeight(32.5, 'kg'), '32,5 kg', 'formato: peso en español')
  eq(f.fmtWeight(35, 'lb'), '77,2 lb', 'formato: kilos guardados, libras con coma en español')
  eq(f.fmtVolume(1800, 'kg'), '1,8t', 'formato: volumen en toneladas con coma')
  eq(f.fmtVolume(500, 'lb'), '1,1k lb', 'formato: volumen en libras es «k lb», no toneladas')
  eq(f.fmtVolume(5000, 'lb'), '11k lb', 'formato: volumen grande en libras sin decimales')
  eq(f.fmtVolumeFull(12345, 'kg'), '12.345 kg', 'formato: volumen completo con separador de miles español')
  eq(f.fmtPercent(2.5), '+2,5%', 'formato: porcentaje con coma')
  eq(f.fmtSigned(-1.5), '−1,5', 'formato: diferencia con signo y coma')
  eq(f.inputNum(32.5), '32.5', 'formato: lo que se escribe en un campo sigue con punto en español')
  eq(f.fmtBytes(945 * 1024), '945 KB', 'formato: almacenamiento en KB')
  eq(f.fmtBytes(12.5 * 1024 ** 2), '12,5 MB', 'formato: almacenamiento en MB con coma')
  eq(f.fmtBytes(10240.9 * 1024 ** 2), '10 GB', 'formato: 10240.9 MB se dice 10 GB')
  eq(f.fmtDuration(4800, 'compact'), '1h 20min', 'formato: duración corta en español con «min», no «m» de metros')
  eq(f.fmtDuration(2700, 'compact'), '45min', 'formato: minutos sueltos en español')

  f.setFormatLocale('en-GB')
  eq(f.trimNum(32.5), '32.5', 'formato: en inglés, punto decimal')
  eq(f.fmtWeight(35, 'lb'), '77.2 lb', 'formato: libras con punto en inglés')
  eq(f.fmtVolume(500, 'lb'), '1.1k lb', 'formato: «k lb» también en inglés')
  eq(f.fmtVolume(1800, 'kg'), '1.8t', 'formato: toneladas con punto en inglés')
  eq(f.fmtVolumeFull(12345, 'kg'), '12,345 kg', 'formato: separador de miles inglés')
  eq(f.fmtDuration(4800, 'compact'), '1h 20m', 'formato: duración corta en inglés como siempre')
  f.setFormatLocale(null)
  eq(f.trimNum(32.5), '32.5', 'formato: volver al valor por defecto deja el punto')

  // Lists of weights as typed in Settings: a decimal comma is a decimal.
  eq(f.parseNumberList('1,25, 2,5'), [1.25, 2.5], 'lista de pesos: «1,25, 2,5» son dos pesos con coma decimal')
  eq(f.parseNumberList('1,25; 2,5'), [1.25, 2.5], 'lista de pesos: separados por punto y coma')
  eq(f.parseNumberList('2.5 5 7.5'), [2.5, 5, 7.5], 'lista de pesos: separados por espacios')
  eq(f.parseNumberList('2.5, 5, 7.5'), [2.5, 5, 7.5], 'lista de pesos: el formato que escribe la propia app')
  eq(f.parseNumberList('5,10,15'), [5, 10, 15], 'lista de pesos: «5,10,15» sigue siendo tres pesos')
  eq(f.parseNumberList('1.5,2.5'), [1.5, 2.5], 'lista de pesos: coma junto a punto decimal es separador')
  eq(f.parseNumberList('7,5; 2,5,'), [2.5, 7.5], 'lista de pesos: una coma final no rompe el último valor, y se ordena')
  eq(f.parseNumberList('abc; -2; 0'), [], 'lista de pesos: nada que no sea un peso positivo')
}

/* --------------------------- el «¿por qué?» del asistente, con unidades */
{
  const { reasonParamsFor } = await import('../src/lib/training/overload')
  const f = await import('../src/lib/format')
  const { translate } = await import('../src/lib/i18n')
  // The same log without any RIR written down.
  const noRir = (weight: number, reps: number[], at: number): ExerciseLog => {
    const l = mkLog(weight, reps, at)
    return { ...l, sets: l.sets.map((s) => ({ ...s, rir: null })) }
  }

  const addRep = suggestNext({ ...base, logs: [mkLog(35, [8, 8, 8], 1000)] })
  eq(addRep.reasonParams.weight, 35, 'por qué: el asistente guarda el peso en kg')
  eq(reasonParamsFor(addRep, 'kg').weight, '35 kg', 'por qué: el peso sale con su unidad en kg')
  eq(reasonParamsFor(addRep, 'lb').weight, '77.2 lb', 'por qué: en LB el peso sale convertido y con «lb»')
  eq(
    translate('en', addRep.reasonKey, reasonParamsFor(addRep, 'lb')),
    'Last session you did 77.2 lb × 8 at RIR 1, inside your 6-10 target range.',
    'por qué: el texto en LB no dice «kg»',
  )
  f.setFormatLocale('es-ES')
  eq(
    translate('es', addRep.reasonKey, reasonParamsFor(addRep, 'lb')),
    'La última sesión hiciste 77,2 lb × 8 con RIR 1, dentro de tu rango objetivo de 6-10.',
    'por qué: en español, libras con coma decimal',
  )
  const halfRir = suggestNext({ ...base, logs: [mkLog(35, [8, 8, 8], 1000, 1.5)] })
  eq(reasonParamsFor(halfRir, 'kg').rir, '1,5', 'por qué: el RIR medio también con coma en español')
  f.setFormatLocale(null)

  // No RIR written down: that part of the sentence is left out, never "RIR —".
  const addRepNoRir = suggestNext({ ...base, logs: [noRir(35, [8, 8, 8], 1000)] })
  eq(addRepNoRir.reasonKey, 'coach.reason.addRepNoRir', 'por qué: sin RIR anotado se usa la frase sin RIR')
  eq(
    translate('es', addRepNoRir.reasonKey, reasonParamsFor(addRepNoRir, 'kg')),
    'La última sesión hiciste 35 kg × 8, dentro de tu rango objetivo de 6-10.',
    'por qué: sin RIR la frase no dice «con RIR —»',
  )
  const upNoRir = suggestNext({ ...base, logs: [noRir(35, [10, 10, 10], 1000)] })
  eq(upNoRir.reasonKey, 'coach.reason.topOfRangeNoRir', 'por qué: arriba del rango sin RIR, frase sin RIR')
  const upNoTarget = suggestNext({ ...base, rirTarget: null, logs: [mkLog(35, [10, 10, 10], 1000)] })
  eq(upNoTarget.reasonKey, 'coach.reason.topOfRangeNoTarget', 'por qué: sin RIR objetivo no se escribe «(objetivo —)»')
  for (const s of [addRepNoRir, upNoRir, upNoTarget]) {
    for (const lang of ['es', 'en'] as const) {
      const text = translate(lang, s.reasonKey, reasonParamsFor(s, 'kg'))
      eq(/—|\{/.test(text), false, `por qué: «${s.reasonKey}» en ${lang} sin huecos ni rayas`)
    }
  }

  const twice = suggestNext({ ...base, logs: [mkLog(35, [5, 5, 5], 900), mkLog(35, [5, 4, 4], 1000)] })
  eq(reasonParamsFor(twice, 'lb').weight, '77.2 lb', 'por qué: bajar un escalón también nombra el peso en lb')

  // One working set at the top of the range: «1 serie», never «1 series».
  const oneSet = suggestNext({ ...base, logs: [mkLog(35, [10], 1000)] })
  eq(oneSet.reasonKey, 'coach.reason.topOfRange', 'por qué: una sola serie arriba del rango usa la frase de arriba del rango')
  eq(
    translate('es', oneSet.reasonKey, reasonParamsFor(oneSet, 'kg')).includes('completaste 1 serie de 10 reps'),
    true,
    'por qué: con una serie se dice «1 serie» en español',
  )
  eq(
    translate('en', oneSet.reasonKey, reasonParamsFor(oneSet, 'kg')).includes('completed 1 set of 10 reps'),
    true,
    'por qué: con una serie se dice «1 set» en inglés',
  )
  eq(
    translate('es', upNoRir.reasonKey, reasonParamsFor(upNoRir, 'kg')).includes('completaste 3 series de 10 reps'),
    true,
    'por qué: con tres series sigue diciendo «3 series»',
  )

  // No reason text may carry a unit of its own: the weight brings it.
  const fixedKg = [...Object.entries(es), ...Object.entries(en)].filter(
    ([k, v]) => k.startsWith('coach.') && /\bkg\b/.test(String(v)),
  )
  eq(fixedKg.map(([k]) => k).join(',') || 'none', 'none', 'por qué: ningún texto del asistente lleva «kg» fijo')

  // The celebrations' rep count, singular and plural, in both languages.
  eq(translate('es', 'pr.repsDelta', { n: 1 }), '+1 repetición', 'celebración: «+1 repetición» en singular')
  eq(translate('es', 'pr.repsDelta', { n: 2 }), '+2 repeticiones', 'celebración: «+2 repeticiones» en plural')
  eq(translate('en', 'pr.repsDelta', { n: 1 }), '+1 rep', 'celebración: «+1 rep» en inglés')
  eq(translate('en', 'pr.repsDelta', { n: 3 }), '+3 reps', 'celebración: «+3 reps» en inglés')
}

/* ------------------------------------------- lote B: plurales e idioma */
/*
 * «1 días», «1 ejercicios», «Used in 1 sessions»: translate() now picks the
 * key's `_one` variant by the language's plural rules. And text the app saved
 * in one language (a free workout's name, an exercise's name in a log) is
 * shown in the current one, without touching what is stored.
 */
{
  const i18n = await import('../src/lib/i18n')
  const { translate } = i18n

  eq(translate('es', 'routines.dayCount', { n: 1 }), '1 día', 'plural es: «1 día», no «1 días»')
  eq(translate('es', 'routines.dayCount', { n: 4 }), '4 días', 'plural es: «4 días»')
  eq(translate('es', 'routines.dayCount', { n: 0 }), '0 días', 'plural es: el cero va en plural')
  eq(translate('es', 'routines.exerciseCount', { n: 1 }), '1 ejercicio', 'plural es: «1 ejercicio»')
  eq(translate('es', 'library.usedIn', { n: 1 }), 'Usado en 1 sesión', 'plural es: «Usado en 1 sesión»')
  eq(translate('es', 'history.sessionsCount', { n: 1 }), '1 sesión', 'plural es: «1 sesión»')
  eq(translate('es', 'library.count', { n: 1 }), '1 ejercicio', 'plural es: contador de la biblioteca en singular')
  eq(translate('es', 'workout.setsDone', { n: 1 }), '1 serie', 'plural es: «1 serie»')
  eq(translate('es', 'common.sets', { n: 1 }), 'serie', 'plural es: la palabra suelta «serie» para 1')
  eq(translate('es', 'common.sets', { n: 12 }), 'series', 'plural es: «series» para 12')
  eq(translate('es', 'common.exercises', { n: 1 }), 'ejercicio', 'plural es: «ejercicio» para 1')
  eq(translate('es', 'common.workouts', { n: 1 }), 'entrenamiento', 'plural es: «entrenamiento» para 1')
  // Spanish has a third category, `many`, for round millions: it must fall
  // back to the plural, not to the singular nor to the raw key.
  eq(translate('es', 'library.count', { n: 1000000 }), '1000000 ejercicios', 'plural es: un millón cae en el plural')

  eq(translate('en', 'routines.dayCount', { n: 1 }), '1 day', 'plural en: «1 day»')
  eq(translate('en', 'routines.dayCount', { n: 2 }), '2 days', 'plural en: «2 days»')
  eq(translate('en', 'routines.dayCount', { n: 0 }), '0 days', 'plural en: «0 days»')
  eq(translate('en', 'library.usedIn', { n: 1 }), 'Used in 1 session', 'plural en: «Used in 1 session»')
  eq(translate('en', 'history.sessionsCount', { n: 1 }), '1 session', 'plural en: «1 session»')
  eq(translate('en', 'common.sets', { n: 1 }), 'set', 'plural en: «set» para 1')
  eq(translate('en', 'common.sets', { n: 3 }), 'sets', 'plural en: «sets» para 3')

  // Without a count nothing changes: a header still reads the base key.
  eq(translate('es', 'common.sets'), 'series', 'plural: sin número se lee la clave de siempre')
  eq(translate('es', 'common.sets', { n: '1' }), 'series', 'plural: sólo un número de verdad elige variante')
  eq(translate('es', 'routines.dayN', { n: 1 }), 'DÍA 1', 'plural: una clave sin variantes sigue igual con número')

  // A variant without its base key would be invisible to anything that asks
  // without a count — and a typo in a suffix would never be picked.
  const PLURAL = /_(zero|one|two|few|many|other)$/
  const orphans = [...Object.keys(es), ...Object.keys(en)].filter(
    (k) => PLURAL.test(k) && !(k.replace(PLURAL, '') in es && k.replace(PLURAL, '') in en),
  )
  eq(orphans.join(',') || 'none', 'none', 'plural: toda variante tiene su clave base en los dos idiomas')

  // ---- period chips
  const { PERIODS, BODY_PERIODS, periodKey } = await import('../src/lib/dates')
  const periodKeys = [...new Set([...PERIODS, ...BODY_PERIODS])].map(periodKey)
  const missing = periodKeys.filter((k) => !(k in es) || !(k in en))
  eq(missing.join(',') || 'none', 'none', 'periodos: todos tienen texto en los dos idiomas')
  eq(translate('es', periodKey('1Y')), '1 A', 'periodos: «1Y» en español es «1 A»')
  eq(translate('es', periodKey('ALL')), 'Todo', 'periodos: «ALL» en español es «Todo»')
  eq(translate('en', periodKey('ALL')), 'All', 'periodos: en inglés, «All»')

  // ---- the free workout and exercise names, in the language of NOW
  const tEn = i18n.makeT('en')
  const tEs = i18n.makeT('es')
  eq(i18n.sessionTitle({ dayId: null, dayName: 'Entrenamiento libre' }, tEn), 'Free workout', 'guardado: un libre guardado en español se ve en inglés')
  eq(i18n.sessionTitle({ dayId: null, dayName: 'Free workout' }, tEs), 'Entrenamiento libre', 'guardado: y uno guardado en inglés se ve en español')
  eq(i18n.sessionTitle({ dayId: null, dayName: 'Workout' }, tEs), 'Entrenamiento libre', 'guardado: el antiguo «Workout» fijo también se reconoce')
  eq(i18n.sessionTitle({ dayId: 'd1', dayName: 'Entrenamiento libre' }, tEn), 'Entrenamiento libre', 'guardado: un día de rutina con ese nombre es de la persona y no se toca')
  eq(i18n.sessionTitle({ dayId: 'd1', dayName: 'TORSO A' }, tEn), 'TORSO A', 'guardado: el nombre de un día se pinta tal cual')

  const current = new Map([
    ['lib-bench', { name: 'Barbell Bench Press', isCustom: false }],
    ['own-1', { name: 'Mi press raro (editado)', isCustom: true }],
  ])
  eq(i18n.exerciseTitle('lib-bench', 'Press de banca con barra', current), 'Barbell Bench Press', 'guardado: un ejercicio del catálogo sale en el idioma actual')
  eq(i18n.exerciseTitle('own-1', 'Mi press raro', current), 'Mi press raro', 'guardado: uno propio, siempre con el nombre que se guardó')
  eq(i18n.exerciseTitle('gone', 'Remo antiguo', current), 'Remo antiguo', 'guardado: si ya no existe, el nombre guardado de respaldo')
  eq(i18n.exerciseTitle('lib-bench', 'Press', undefined), 'Press', 'guardado: sin consulta todavía, el nombre guardado')

  // repo.sessions used to fall back to the English word 'Workout'.
  const { writeSettings, readSettings } = await import('../src/lib/db/database')
  const { startSession, discardSession } = await import('../src/lib/db/repo.sessions')
  const before = (await readSettings()).language
  await writeSettings({ language: 'es' })
  const s = await startSession({ routine: null, day: null })
  eq(s.dayName, 'Entrenamiento libre', 'guardado: sin nombre, un libre se llama como en el idioma de la app, no «Workout»')
  eq(i18n.sessionTitle(s, tEn), 'Free workout', 'guardado: y ese nombre se reconoce para traducirlo')
  await discardSession(s.id)
  await writeSettings({ language: before })
}

/* ------------------------------------------- lote B: objetivos de rutina */
{
  const { parseIntensity, parseRepRange, parseDecimal } = await import('../src/lib/training/routineTargets')
  eq(parseDecimal('1,5'), 1.5, 'objetivos: «1,5» con coma es 1.5')
  eq(parseDecimal('1.5'), 1.5, 'objetivos: «1.5» con punto también')
  eq(parseDecimal('2,'), 2, 'objetivos: «2,» a medio escribir no es un error')
  eq(parseDecimal('abc'), null, 'objetivos: texto no es un número')
  eq(parseDecimal('-1'), null, 'objetivos: negativos fuera')

  eq(parseIntensity('1,5', 'rir'), { ok: true, value: 1.5 }, 'objetivos: RIR «1,5» se guarda como 1.5, no NaN')
  eq(parseIntensity('', 'rir'), { ok: true, value: null }, 'objetivos: RIR vacío quita el objetivo')
  eq(parseIntensity('0', 'rir'), { ok: true, value: 0 }, 'objetivos: RIR 0 (al fallo) vale')
  eq(parseIntensity('25', 'rir').ok, false, 'objetivos: RIR 25 no')
  eq(parseIntensity('1,5,5', 'rir').ok, false, 'objetivos: RIR «1,5,5» no')
  eq(parseIntensity('8,5', 'rpe'), { ok: true, value: 8.5 }, 'objetivos: RPE «8,5» vale')
  eq(parseIntensity('0', 'rpe').ok, false, 'objetivos: RPE 0 no (la escala empieza en 1)')
  eq(parseIntensity('11', 'rpe').ok, false, 'objetivos: RPE 11 no')

  eq(parseRepRange('8', '12'), { ok: true, min: 8, max: 12 }, 'objetivos: 8–12 vale')
  eq(parseRepRange('10', '10'), { ok: true, min: 10, max: 10 }, 'objetivos: 10–10 vale')
  eq(parseRepRange('12', '8'), { ok: false, invalidMin: false, invalidMax: false, reversed: true }, 'objetivos: mínimo mayor que el máximo no')
  eq(parseRepRange('0', '12').ok, false, 'objetivos: 0 repeticiones no')
  eq(parseRepRange('8,5', '12').ok, false, 'objetivos: repeticiones con decimales no')
  eq(parseRepRange('8', '').ok, false, 'objetivos: un extremo vacío no')
  eq(parseRepRange('8', '500').ok, false, 'objetivos: 500 repeticiones no')
}

/* ------------------------------------------- lote B: errores de importación */
{
  const { importBackup, importErrorKey } = await import('../src/lib/backup')
  const keyOf = async (json: unknown) => {
    try {
      await importBackup(json, 'merge')
      return 'no error'
    } catch (err) {
      return importErrorKey(err)
    }
  }
  eq(await keyOf({ hello: 1 }), 'data.importNotBackup', 'importar: un JSON que no es una copia lo dice')
  eq(await keyOf(null), 'data.importNotBackup', 'importar: un JSON vacío también')
  eq(await keyOf({ format: 'training-os-backup' }), 'data.importNoData', 'importar: una copia sin datos lo dice')
  let parseError: unknown = null
  try {
    JSON.parse('{ esto no es json')
  } catch (err) {
    parseError = err
  }
  eq(importErrorKey(parseError), 'data.importNotJson', 'importar: un archivo que no es JSON lo dice')
  eq(importErrorKey(new Error('boom')), 'data.importError', 'importar: cualquier otro fallo, el mensaje general')
  const keys = ['data.importNotBackup', 'data.importNoData', 'data.importNotJson', 'data.importNoSpace', 'data.importError']
  eq(keys.filter((k) => !(k in es) || !(k in en)).join(',') || 'none', 'none', 'importar: cada mensaje existe en los dos idiomas')
  const { translate: tr } = await import('../src/lib/i18n')
  const leftovers = ['library.deleted', 'workout.unknownExercise', 'common.routinesCount', 'migrate.counts']
  eq(leftovers.filter((k) => !(k in es) || !(k in en)).join(',') || 'none', 'none', 'textos sueltos: existen en los dos idiomas')
  eq(
    tr('es', 'migrate.counts', { n: 1, routines: tr('es', 'common.routinesCount', { n: 3 }) }),
    '1 entrenamiento · 3 rutinas',
    'migrar: «1 entrenamiento · 3 rutinas» con su singular y su plural',
  )
  eq(
    tr('en', 'migrate.counts', { n: 4, routines: tr('en', 'common.routinesCount', { n: 1 }) }),
    '4 workouts · 1 routine',
    'migrar: en inglés también, «4 workouts · 1 routine»',
  )
  const { translate } = await import('../src/lib/i18n')
  eq(
    translate('es', 'data.importNotBackup'),
    'Este archivo no es una copia de seguridad de Training OS.',
    'importar: en español se explica en español, no «Not a Training OS backup»',
  )
}

/* --------------------------------------------------------------- report */

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
