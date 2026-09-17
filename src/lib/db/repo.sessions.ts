import { getDB, notify, log, readSettings, getMeta, setMeta } from './database'
import { enqueueMany, putSynced } from '../sync/queue'
import {
  newId,
  type Exercise,
  type ExerciseLog,
  type PersonalRecord,
  type PRType,
  type Routine,
  type RoutineDay,
  type SessionExercise,
  type SetEntry,
  type WorkoutSession,
} from './schema'
import { aggregateSets, estimate1RM, isLogged } from '../training/metrics'
import { dateKey } from '../dates'
import { getExercisesByIds } from './repo.exercises'

export const ACTIVE_SESSION_KEY = 'activeSessionId'

export function makeSet(type: SetEntry['type'] = 'working'): SetEntry {
  return {
    id: newId(),
    type,
    weight: null,
    reps: null,
    rir: null,
    rpe: null,
    completed: false,
    completedAt: null,
    note: '',
  }
}

/* ------------------------------------------------------------ active session */

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const db = await getDB()
  const id = await getMeta<string | null>(ACTIVE_SESSION_KEY, null)
  if (id) {
    const s = await db.get('sessions', id)
    if (s && s.status === 'active' && !s.deletedAt) return s
  }
  // Fall back to a scan: a crash mid-write must never orphan a workout.
  const all = await db.getAllFromIndex('sessions', 'by-status', 'active')
  const alive = all.filter((s) => !s.deletedAt).sort((a, b) => b.startedAt - a.startedAt)[0]
  if (alive) {
    await setMeta(ACTIVE_SESSION_KEY, alive.id)
    return alive
  }
  return null
}

export interface StartSessionInput {
  routine?: Routine | null
  day?: RoutineDay | null
  freeName?: string
}

export async function startSession(input: StartSessionInput): Promise<WorkoutSession> {
  const existing = await getActiveSession()
  if (existing) return existing

  const now = Date.now()
  const settings = await readSettings()
  const exercises: SessionExercise[] = []

  if (input.routine && input.day) {
    const lib = await getExercisesByIds(input.day.exercises.map((e) => e.exerciseId))
    input.day.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((re, i) => {
        const ex = lib.get(re.exerciseId)
        exercises.push({
          id: newId(),
          exerciseId: re.exerciseId,
          name: ex?.name ?? 'Exercise',
          muscleGroup: ex?.muscleGroup ?? 'other',
          order: i,
          targetSets: re.targetSets,
          repMin: re.repMin,
          repMax: re.repMax,
          rirTarget: re.rirTarget,
          rpeTarget: re.rpeTarget,
          restSeconds: re.restSeconds || settings.defaultRestSeconds,
          sets: Array.from({ length: Math.max(1, re.targetSets) }, () => makeSet('working')),
          sessionNote: '',
        })
      })
  }

  const session: WorkoutSession = {
    id: newId(),
    routineId: input.routine?.id ?? null,
    routineName: input.routine?.name ?? '',
    dayId: input.day?.id ?? null,
    dayName: input.day?.name ?? input.freeName ?? 'Workout',
    status: 'active',
    startedAt: now,
    endedAt: null,
    durationSec: 0,
    pausedMs: 0,
    pausedAt: null,
    notes: '',
    exercises,
    demo: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  await putSynced('sessions', session)
  await setMeta(ACTIVE_SESSION_KEY, session.id)
  log('workout', `session started: ${session.dayName} (${exercises.length} exercises)`)
  return session
}

export async function persistSession(session: WorkoutSession): Promise<void> {
  // Autosave during a workout. The outbox collapses repeated edits of the same
  // session into one pending entry, so this is cheap even every few seconds.
  await putSynced('sessions', { ...session, updatedAt: Date.now() })
}

export async function discardSession(id: string): Promise<void> {
  const db = await getDB()
  const s = await db.get('sessions', id)
  if (s) {
    await putSynced('sessions', {
      ...s,
      status: 'completed' as const,
      deletedAt: Date.now(),
      endedAt: Date.now(),
      updatedAt: Date.now(),
    })
    log('workout', `session discarded: ${s.dayName}`)
  }
  await setMeta(ACTIVE_SESSION_KEY, null)
}

/* ------------------------------------------------------------- exercise logs */

export function buildLog(
  session: WorkoutSession,
  se: SessionExercise,
  excludeWarmups: boolean,
): ExerciseLog | null {
  const logged = se.sets.filter(isLogged)
  if (!logged.length) return null
  const agg = aggregateSets(se.sets, excludeWarmups)
  if (agg.effectiveSets === 0 && agg.loggedSets === 0) return null
  const performedAt = session.endedAt ?? session.startedAt
  return {
    id: `${session.id}:${se.exerciseId}`,
    sessionId: session.id,
    exerciseId: se.exerciseId,
    exerciseName: se.name,
    muscleGroup: se.muscleGroup,
    date: dateKey(performedAt),
    performedAt,
    sets: se.sets.filter(isLogged).map((s) => ({ ...s })),
    effectiveSets: agg.effectiveSets,
    totalReps: agg.totalReps,
    volume: agg.volume,
    topSetWeight: agg.topSetWeight,
    topSetReps: agg.topSetReps,
    bestE1rm: agg.bestE1rm,
    repMin: se.repMin,
    repMax: se.repMax,
    rirTarget: se.rirTarget,
    demo: session.demo,
  }
}

/* -------------------------------------------------------------- PR detection */

export interface ExerciseBests {
  maxWeight: number
  bestE1rm: number
  bestSessionVolume: number
  /** Best reps ever achieved at each exact weight. */
  repsByWeight: Map<number, number>
  sessions: number
}

export async function bestsForExercise(
  exerciseId: string,
  beforeTs = Number.MAX_SAFE_INTEGER,
  excludeSessionId?: string,
): Promise<ExerciseBests> {
  const db = await getDB()
  const logs = await db.getAllFromIndex('exerciseLogs', 'by-exercise', exerciseId)
  const bests: ExerciseBests = {
    maxWeight: 0,
    bestE1rm: 0,
    bestSessionVolume: 0,
    repsByWeight: new Map(),
    sessions: 0,
  }
  for (const l of logs) {
    if (l.performedAt >= beforeTs) continue
    if (excludeSessionId && l.sessionId === excludeSessionId) continue
    bests.sessions++
    bests.maxWeight = Math.max(bests.maxWeight, l.topSetWeight)
    bests.bestE1rm = Math.max(bests.bestE1rm, l.bestE1rm)
    bests.bestSessionVolume = Math.max(bests.bestSessionVolume, l.volume)
    for (const s of l.sets) {
      if (!isLogged(s)) continue
      const w = s.weight as number
      const r = s.reps as number
      bests.repsByWeight.set(w, Math.max(bests.repsByWeight.get(w) ?? 0, r))
    }
  }
  return bests
}

export interface DetectedPR {
  type: PRType
  exerciseId: string
  exerciseName: string
  value: number
  weight: number | null
  reps: number | null
  previousValue: number | null
  delta: number | null
}

export function detectPRsForLog(logEntry: ExerciseLog, bests: ExerciseBests): DetectedPR[] {
  const out: DetectedPR[] = []
  const base = { exerciseId: logEntry.exerciseId, exerciseName: logEntry.exerciseName }

  // Weight PR — heaviest single set ever, for at least one rep.
  if (logEntry.topSetWeight > bests.maxWeight + 1e-9) {
    out.push({
      ...base,
      type: 'weight',
      value: logEntry.topSetWeight,
      weight: logEntry.topSetWeight,
      reps: logEntry.topSetReps,
      previousValue: bests.maxWeight || null,
      delta: bests.maxWeight ? logEntry.topSetWeight - bests.maxWeight : null,
    })
  }

  // Rep PR — more reps than ever before at that exact load.
  let bestRepPr: DetectedPR | null = null
  for (const s of logEntry.sets) {
    if (!isLogged(s)) continue
    const w = s.weight as number
    const r = s.reps as number
    const prev = bests.repsByWeight.get(w) ?? 0
    if (prev > 0 && r > prev) {
      const candidate: DetectedPR = {
        ...base,
        type: 'reps',
        value: r,
        weight: w,
        reps: r,
        previousValue: prev,
        delta: r - prev,
      }
      if (!bestRepPr || w > (bestRepPr.weight ?? 0)) bestRepPr = candidate
    }
  }
  if (bestRepPr) out.push(bestRepPr)

  // Estimated 1RM PR. Skipped when a weight or rep record already covers the
  // same improvement — otherwise one good set would report three records.
  const impliedByAnother = out.some((p) => p.type === 'weight' || p.type === 'reps')
  if (!impliedByAnother && logEntry.bestE1rm > bests.bestE1rm + 1e-6 && bests.bestE1rm > 0) {
    out.push({
      ...base,
      type: 'e1rm',
      value: logEntry.bestE1rm,
      weight: logEntry.topSetWeight,
      reps: logEntry.topSetReps,
      previousValue: bests.bestE1rm,
      delta: logEntry.bestE1rm - bests.bestE1rm,
    })
  }

  // Volume PR for the exercise within one session.
  if (logEntry.volume > bests.bestSessionVolume + 1e-6 && bests.bestSessionVolume > 0) {
    out.push({
      ...base,
      type: 'volume',
      value: logEntry.volume,
      weight: null,
      reps: null,
      previousValue: bests.bestSessionVolume,
      delta: logEntry.volume - bests.bestSessionVolume,
    })
  }

  return out
}

/**
 * Live PR check used while training, so the celebration can fire the instant a
 * set is ticked. Read-only: nothing is written until the session is finished.
 */
export async function checkLivePR(
  exerciseId: string,
  exerciseName: string,
  set: SetEntry,
  sessionId: string,
): Promise<DetectedPR | null> {
  if (!isLogged(set)) return null
  const bests = await bestsForExercise(exerciseId, Number.MAX_SAFE_INTEGER, sessionId)
  if (bests.sessions === 0) return null // first ever session: everything would be a "PR"
  const w = set.weight as number
  const r = set.reps as number
  if (w > bests.maxWeight + 1e-9) {
    return {
      type: 'weight',
      exerciseId,
      exerciseName,
      value: w,
      weight: w,
      reps: r,
      previousValue: bests.maxWeight || null,
      delta: bests.maxWeight ? w - bests.maxWeight : null,
    }
  }
  const prevReps = bests.repsByWeight.get(w) ?? 0
  if (prevReps > 0 && r > prevReps) {
    return {
      type: 'reps',
      exerciseId,
      exerciseName,
      value: r,
      weight: w,
      reps: r,
      previousValue: prevReps,
      delta: r - prevReps,
    }
  }
  const e = estimate1RM(w, r)
  if (bests.bestE1rm > 0 && e > bests.bestE1rm + 1e-6) {
    return {
      type: 'e1rm',
      exerciseId,
      exerciseName,
      value: e,
      weight: w,
      reps: r,
      previousValue: bests.bestE1rm,
      delta: e - bests.bestE1rm,
    }
  }
  return null
}

/* ----------------------------------------------------------------- finishing */

export interface FinishResult {
  session: WorkoutSession
  prs: PersonalRecord[]
  totals: SessionTotals
  previousVolume: number | null
}

export interface SessionTotals {
  durationSec: number
  effectiveSets: number
  totalSets: number
  totalReps: number
  volume: number
  exercises: number
}

export function sessionTotals(session: WorkoutSession, excludeWarmups: boolean): SessionTotals {
  let effectiveSets = 0
  let totalSets = 0
  let totalReps = 0
  let volume = 0
  let exercises = 0
  for (const se of session.exercises) {
    const agg = aggregateSets(se.sets, excludeWarmups)
    if (agg.loggedSets > 0) exercises++
    effectiveSets += agg.effectiveSets
    totalSets += agg.loggedSets
    totalReps += agg.totalReps
    volume += agg.volume
  }
  return {
    durationSec: session.durationSec,
    effectiveSets,
    totalSets,
    totalReps,
    volume,
    exercises,
  }
}

/**
 * Writes a completed session plus its read-model rows and any records it set.
 * Shared by "finish workout" and by importing/seeding backdated sessions, so
 * PR detection behaves identically in both.
 */
export async function commitCompletedSession(session: WorkoutSession): Promise<PersonalRecord[]> {
  const settings = await readSettings()
  const db = await getDB()
  const at = session.endedAt ?? session.startedAt

  const logs: ExerciseLog[] = []
  for (const se of session.exercises) {
    const entry = buildLog(session, se, settings.excludeWarmupsFromStats)
    if (entry) logs.push(entry)
  }

  const prs: PersonalRecord[] = []
  for (const entry of logs) {
    // Compare only against what happened BEFORE this session.
    const bests = await bestsForExercise(entry.exerciseId, entry.performedAt, session.id)
    if (bests.sessions === 0) continue // no baseline yet — do not fake a record
    for (const d of detectPRsForLog(entry, bests)) {
      prs.push({
        id: newId(),
        exerciseId: d.exerciseId,
        exerciseName: d.exerciseName,
        type: d.type,
        value: d.value,
        weight: d.weight,
        reps: d.reps,
        previousValue: d.previousValue,
        delta: d.delta,
        sessionId: session.id,
        date: entry.date,
        achievedAt: at,
        demo: session.demo,
      })
    }
  }

  const tx = db.transaction(['sessions', 'exerciseLogs', 'personalRecords'], 'readwrite')
  await tx.objectStore('sessions').put(session)
  const logStore = tx.objectStore('exerciseLogs')
  const stale = await logStore.index('by-session').getAllKeys(session.id)
  for (const key of stale) await logStore.delete(key)
  for (const entry of logs) await logStore.put(entry)
  const prStore = tx.objectStore('personalRecords')
  const removedPrs: string[] = []
  for (const old of await prStore.getAll()) {
    if (old.sessionId === session.id) {
      await prStore.delete(old.id)
      removedPrs.push(old.id)
    }
  }
  for (const pr of prs) await prStore.put(pr)
  await tx.done

  // The transaction is the atomic part; queueing for the account comes after,
  // so a crash mid-write can never leave half a workout in either place.
  await enqueueMany([
    { store: 'sessions', docId: session.id, op: 'put' },
    ...stale.map((key) => ({ store: 'exerciseLogs' as const, docId: String(key), op: 'delete' as const })),
    ...logs.map((l) => ({ store: 'exerciseLogs' as const, docId: l.id, op: 'put' as const })),
    ...removedPrs.map((id) => ({ store: 'personalRecords' as const, docId: id, op: 'delete' as const })),
    ...prs.map((p) => ({ store: 'personalRecords' as const, docId: p.id, op: 'put' as const })),
  ])

  return prs
}

export async function finishSession(session: WorkoutSession): Promise<FinishResult> {
  const settings = await readSettings()
  const now = Date.now()

  const finished: WorkoutSession = {
    ...session,
    status: 'completed',
    endedAt: now,
    durationSec: Math.max(0, Math.round((now - session.startedAt - session.pausedMs) / 1000)),
    updatedAt: now,
  }

  const prs = await commitCompletedSession(finished)
  await setMeta(ACTIVE_SESSION_KEY, null)

  const totals = sessionTotals(finished, settings.excludeWarmupsFromStats)
  const previousVolume = await previousComparableVolume(finished)

  log(
    'workout',
    `session finished: ${finished.dayName} · ${totals.effectiveSets} sets · ${Math.round(totals.volume)} kg · ${prs.length} PR`,
  )
  notify('sessions', 'exerciseLogs', 'personalRecords')

  return { session: finished, prs, totals, previousVolume }
}

/** Volume of the previous session of the same routine day, for the summary delta. */
export async function previousComparableVolume(session: WorkoutSession): Promise<number | null> {
  const db = await getDB()
  const settings = await readSettings()
  const all = await db.getAllFromIndex('sessions', 'by-started')
  const prev = all
    .filter(
      (s) =>
        s.id !== session.id &&
        s.status === 'completed' &&
        !s.deletedAt &&
        s.startedAt < session.startedAt &&
        (session.dayId ? s.dayId === session.dayId : s.dayName === session.dayName),
    )
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  if (!prev) return null
  return sessionTotals(prev, settings.excludeWarmupsFromStats).volume
}

/* ------------------------------------------------------------------- queries */

export async function listSessions(opts: { from?: number; to?: number; limit?: number } = {}) {
  const db = await getDB()
  const all = await db.getAllFromIndex('sessions', 'by-started')
  const filtered = all
    .filter((s) => s.status === 'completed' && !s.deletedAt)
    .filter((s) => (opts.from ? s.startedAt >= opts.from : true))
    .filter((s) => (opts.to ? s.startedAt <= opts.to : true))
    .sort((a, b) => b.startedAt - a.startedAt)
  return opts.limit ? filtered.slice(0, opts.limit) : filtered
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  const db = await getDB()
  const s = await db.get('sessions', id)
  return s && !s.deletedAt ? s : undefined
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB()
  const s = await db.get('sessions', id)
  if (!s) return
  const tx = db.transaction(['sessions', 'exerciseLogs', 'personalRecords'], 'readwrite')
  await tx.objectStore('sessions').put({ ...s, deletedAt: Date.now(), updatedAt: Date.now() })
  const logStore = tx.objectStore('exerciseLogs')
  const logKeys = (await logStore.index('by-session').getAllKeys(id)).map(String)
  for (const key of logKeys) await logStore.delete(key)
  const prStore = tx.objectStore('personalRecords')
  const prIds: string[] = []
  for (const pr of await prStore.getAll()) {
    if (pr.sessionId === id) {
      await prStore.delete(pr.id)
      prIds.push(pr.id)
    }
  }
  await tx.done
  await enqueueMany([
    { store: 'sessions', docId: id, op: 'put' },
    ...logKeys.map((docId) => ({ store: 'exerciseLogs' as const, docId, op: 'delete' as const })),
    ...prIds.map((docId) => ({ store: 'personalRecords' as const, docId, op: 'delete' as const })),
  ])
  log('history', `session deleted: ${s.dayName}`)
  notify('sessions', 'exerciseLogs', 'personalRecords')
}

export async function logsForExercise(exerciseId: string, from = 0): Promise<ExerciseLog[]> {
  const db = await getDB()
  const logs = await db.getAllFromIndex('exerciseLogs', 'by-exercise', exerciseId)
  return logs.filter((l) => l.performedAt >= from).sort((a, b) => a.performedAt - b.performedAt)
}

export async function lastLogForExercise(
  exerciseId: string,
  beforeTs = Number.MAX_SAFE_INTEGER,
): Promise<ExerciseLog | null> {
  const logs = await logsForExercise(exerciseId)
  const prior = logs.filter((l) => l.performedAt < beforeTs)
  return prior.length ? prior[prior.length - 1] : null
}

export async function logsInRange(from: number, to = Date.now()): Promise<ExerciseLog[]> {
  const db = await getDB()
  const all = await db.getAll('exerciseLogs')
  return all.filter((l) => l.performedAt >= from && l.performedAt <= to)
}

export async function listPRs(limit?: number): Promise<PersonalRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('personalRecords', 'by-achieved')
  const sorted = all.sort((a, b) => b.achievedAt - a.achievedAt)
  return limit ? sorted.slice(0, limit) : sorted
}

export async function prsForSession(sessionId: string): Promise<PersonalRecord[]> {
  const db = await getDB()
  const all = await db.getAll('personalRecords')
  return all.filter((p) => p.sessionId === sessionId)
}

export async function prsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('personalRecords', 'by-exercise', exerciseId)).sort(
    (a, b) => b.achievedAt - a.achievedAt,
  )
}

/** Exercises used most recently, for the "Recent" tab of the library. */
export async function recentExerciseIds(limit = 20): Promise<string[]> {
  const db = await getDB()
  const all = await db.getAll('exerciseLogs')
  const seen = new Map<string, number>()
  for (const l of all) seen.set(l.exerciseId, Math.max(seen.get(l.exerciseId) ?? 0, l.performedAt))
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}

export async function exerciseUsageCounts(): Promise<Map<string, number>> {
  const db = await getDB()
  const all = await db.getAll('exerciseLogs')
  const counts = new Map<string, number>()
  for (const l of all) counts.set(l.exerciseId, (counts.get(l.exerciseId) ?? 0) + 1)
  return counts
}

export type { Exercise }
