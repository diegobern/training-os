import { getDB, notify, log } from './database'
import { putSynced } from '../sync/queue'
import { CATALOG } from './catalog'
import {
  newId,
  type Exercise,
  type Equipment,
  type ExerciseType,
  type Language,
  type MuscleGroup,
} from './schema'
import { incrementSourceForEquipment } from '../training/weights'

export function makeExercise(partial: Partial<Exercise> & { name: string }): Exercise {
  const now = Date.now()
  const equipment: Equipment = partial.equipment ?? 'other'
  return {
    id: partial.id ?? newId(),
    name: partial.name,
    muscleGroup: partial.muscleGroup ?? 'other',
    primaryMuscle: partial.primaryMuscle ?? '',
    secondaryMuscles: partial.secondaryMuscles ?? [],
    equipment,
    type: partial.type ?? 'compound',
    defaultSets: partial.defaultSets ?? 3,
    repMin: partial.repMin ?? 8,
    repMax: partial.repMax ?? 12,
    rirTarget: partial.rirTarget ?? 1,
    rpeTarget: partial.rpeTarget ?? 9,
    restSeconds: partial.restSeconds ?? 120,
    instructions: partial.instructions ?? '',
    referenceUrl: partial.referenceUrl ?? '',
    imageUrl: partial.imageUrl ?? '',
    isCustom: partial.isCustom ?? true,
    isFavorite: partial.isFavorite ?? false,
    incrementSource: partial.incrementSource ?? incrementSourceForEquipment(equipment),
    demo: partial.demo ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
    deletedAt: partial.deletedAt ?? null,
  }
}

/** Seeds the built-in library exactly once. Never overwrites user edits. */
export async function seedLibraryIfEmpty(language: Language): Promise<number> {
  const db = await getDB()
  const count = await db.count('exercises')
  if (count > 0) return 0
  const tx = db.transaction('exercises', 'readwrite')
  let n = 0
  for (const c of CATALOG) {
    const ex = makeExercise({
      id: `lib-${c.slug}`,
      name: language === 'es' ? c.es : c.en,
      muscleGroup: c.muscleGroup,
      primaryMuscle: language === 'es' ? c.primaryEs : c.primaryEn,
      secondaryMuscles: c.secondary,
      equipment: c.equipment,
      type: c.type,
      defaultSets: c.sets,
      repMin: c.repMin,
      repMax: c.repMax,
      rirTarget: 1,
      rpeTarget: 9,
      restSeconds: c.rest,
      instructions: (language === 'es' ? c.cueEs : c.cueEn) ?? '',
      isCustom: false,
    })
    await tx.store.put(ex)
    n++
  }
  await tx.done
  log('library', `seeded ${n} built-in exercises`)
  notify('exercises')
  return n
}

export interface ExerciseFilter {
  search?: string
  muscleGroup?: MuscleGroup | 'all'
  equipment?: Equipment | 'all'
  type?: ExerciseType | 'all'
  favoritesOnly?: boolean
  customOnly?: boolean
  includeDeleted?: boolean
}

export async function listExercises(filter: ExerciseFilter = {}): Promise<Exercise[]> {
  const db = await getDB()
  const all = await db.getAll('exercises')
  const q = filter.search?.trim().toLowerCase()
  return all
    .filter((e) => (filter.includeDeleted ? true : !e.deletedAt))
    .filter((e) => (filter.muscleGroup && filter.muscleGroup !== 'all' ? e.muscleGroup === filter.muscleGroup : true))
    .filter((e) => (filter.equipment && filter.equipment !== 'all' ? e.equipment === filter.equipment : true))
    .filter((e) => (filter.type && filter.type !== 'all' ? e.type === filter.type : true))
    .filter((e) => (filter.favoritesOnly ? e.isFavorite : true))
    .filter((e) => (filter.customOnly ? e.isCustom : true))
    .filter((e) =>
      q ? e.name.toLowerCase().includes(q) || e.primaryMuscle.toLowerCase().includes(q) : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  const db = await getDB()
  return db.get('exercises', id)
}

export async function getExercisesByIds(ids: string[]): Promise<Map<string, Exercise>> {
  const db = await getDB()
  const tx = db.transaction('exercises')
  const map = new Map<string, Exercise>()
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const ex = await tx.store.get(id)
      if (ex) map.set(id, ex)
    }),
  )
  await tx.done
  return map
}

export async function saveExercise(ex: Exercise): Promise<Exercise> {
  const next = { ...ex, updatedAt: Date.now() }
  await putSynced('exercises', next)
  return next
}

export async function createExercise(partial: Partial<Exercise> & { name: string }): Promise<Exercise> {
  const ex = makeExercise({ ...partial, isCustom: true })
  await putSynced('exercises', ex)
  log('library', `custom exercise created: ${ex.name}`)
  return ex
}

/** Soft delete — history that references the exercise must stay readable. */
export async function deleteExercise(id: string): Promise<void> {
  const db = await getDB()
  const ex = await db.get('exercises', id)
  if (!ex) return
  await putSynced('exercises', { ...ex, deletedAt: Date.now(), updatedAt: Date.now() })
}

export async function restoreExercise(id: string): Promise<void> {
  const db = await getDB()
  const ex = await db.get('exercises', id)
  if (!ex) return
  await putSynced('exercises', { ...ex, deletedAt: null, updatedAt: Date.now() })
}

export async function toggleFavoriteExercise(id: string): Promise<void> {
  const db = await getDB()
  const ex = await db.get('exercises', id)
  if (!ex) return
  await putSynced('exercises', { ...ex, isFavorite: !ex.isFavorite, updatedAt: Date.now() })
}
