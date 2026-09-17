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
 */
export function nextDayIndex(routine: Routine, lastDayId: string | null): number {
  if (!routine.days.length) return -1
  if (!lastDayId) return 0
  const idx = routine.days.findIndex((d) => d.id === lastDayId)
  if (idx === -1) return 0
  return (idx + 1) % routine.days.length
}
