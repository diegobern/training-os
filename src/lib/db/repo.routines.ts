import { getDB, notify, log } from './database'
import { enqueueMany, putSynced } from '../sync/queue'
import { newId, type Exercise, type Routine, type RoutineDay, type RoutineExercise } from './schema'

export function makeRoutineExercise(ex: Exercise, order: number): RoutineExercise {
  return {
    id: newId(),
    exerciseId: ex.id,
    order,
    targetSets: ex.defaultSets,
    repMin: ex.repMin,
    repMax: ex.repMax,
    rirTarget: ex.rirTarget,
    rpeTarget: ex.rpeTarget,
    restSeconds: ex.restSeconds,
    notes: '',
  }
}

export function makeRoutineDay(name: string, order: number): RoutineDay {
  return { id: newId(), name, order, exercises: [] }
}

export function makeRoutine(name: string, days: RoutineDay[] = []): Routine {
  const now = Date.now()
  return {
    id: newId(),
    name,
    description: '',
    days,
    isActive: false,
    archivedAt: null,
    demo: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export async function listRoutines(includeArchived = false): Promise<Routine[]> {
  const db = await getDB()
  const all = await db.getAll('routines')
  return all
    .filter((r) => !r.deletedAt)
    .filter((r) => (includeArchived ? true : !r.archivedAt))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  const db = await getDB()
  const r = await db.get('routines', id)
  return r && !r.deletedAt ? r : undefined
}

export async function getActiveRoutine(): Promise<Routine | undefined> {
  const db = await getDB()
  const all = await db.getAll('routines')
  return all.find((r) => r.isActive && !r.deletedAt && !r.archivedAt)
}

function normalise(routine: Routine): Routine {
  return {
    ...routine,
    days: routine.days
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((d, i) => ({
        ...d,
        order: i,
        exercises: d.exercises
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((e, j) => ({ ...e, order: j })),
      })),
    updatedAt: Date.now(),
  }
}

export async function saveRoutine(routine: Routine): Promise<Routine> {
  const next = normalise(routine)
  await putSynced('routines', next)
  return next
}

export async function createRoutine(name: string, dayNames: string[] = []): Promise<Routine> {
  const days = dayNames.map((n, i) => makeRoutineDay(n, i))
  const routine = makeRoutine(name, days)
  const db = await getDB()
  const existing = await db.getAll('routines')
  // First routine ever becomes the active one — there is nothing to choose between.
  if (existing.filter((r) => !r.deletedAt && !r.archivedAt).length === 0) routine.isActive = true
  await putSynced('routines', routine)
  log('routines', `created routine "${name}"`)
  return routine
}

export async function duplicateRoutine(id: string, newName?: string): Promise<Routine | null> {
  const src = await getRoutine(id)
  if (!src) return null
  const now = Date.now()
  const copy: Routine = {
    ...src,
    id: newId(),
    name: newName ?? `${src.name} (2)`,
    isActive: false,
    archivedAt: null,
    demo: false,
    createdAt: now,
    updatedAt: now,
    days: src.days.map((d) => ({
      ...d,
      id: newId(),
      exercises: d.exercises.map((e) => ({ ...e, id: newId() })),
    })),
  }
  await putSynced('routines', copy)
  return copy
}

export async function setActiveRoutine(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('routines', 'readwrite')
  const all = await tx.store.getAll()
  const touched: string[] = []
  for (const r of all) {
    const shouldBeActive = r.id === id
    if (r.isActive !== shouldBeActive) {
      await tx.store.put({ ...r, isActive: shouldBeActive, updatedAt: Date.now() })
      touched.push(r.id)
    }
  }
  await tx.done
  await enqueueMany(touched.map((docId) => ({ store: 'routines' as const, docId, op: 'put' as const })))
  notify('routines')
}

export async function archiveRoutine(id: string, archived: boolean): Promise<void> {
  const db = await getDB()
  const r = await db.get('routines', id)
  if (!r) return
  await putSynced('routines', {
    ...r,
    archivedAt: archived ? Date.now() : null,
    isActive: archived ? false : r.isActive,
    updatedAt: Date.now(),
  })
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = await getDB()
  const r = await db.get('routines', id)
  if (!r) return
  await putSynced('routines', { ...r, deletedAt: Date.now(), isActive: false, updatedAt: Date.now() })
  log('routines', `deleted routine "${r.name}"`)
}

/**
 * Which day should come next in a routine, given what was trained last.
 * Simple, predictable and explainable: the day after the last one completed,
 * wrapping round; the first day when there is no history yet.
 *
 * Days with no exercises are stepped over — proposing an empty day as "next
 * workout" offers a session with nothing in it. If every day is empty there is
 * nothing better to offer, and the plain rotation stands.
 */
export function nextDayIndex(routine: Routine, lastDayId: string | null): number {
  const n = routine.days.length
  if (!n) return -1
  // No history (or a day since deleted) is -1: the rotation starts from the
  // top, as if the last day trained were a virtual one before the first.
  const from = lastDayId ? routine.days.findIndex((d) => d.id === lastDayId) : -1
  for (let step = 1; step <= n; step++) {
    const i = (from + step + n) % n
    if (routine.days[i].exercises.length > 0) return i
  }
  return (from + 1 + n) % n
}

/**
 * The day of THIS routine that was trained last, from sessions newest first.
 *
 * The rotation used to read the very last session of any kind, so a free
 * workout (no day) or a session of another routine in between sent it back to
 * day one: after TORSO A and a free session, Home proposed TORSO A again.
 * Only sessions of this routine on a day it still has can move it.
 */
export function lastDayIdForRoutine(
  routine: Routine,
  sessions: { routineId: string | null; dayId: string | null }[],
): string | null {
  const days = new Set(routine.days.map((d) => d.id))
  const last = sessions.find((s) => s.routineId === routine.id && s.dayId !== null && days.has(s.dayId))
  return last?.dayId ?? null
}
