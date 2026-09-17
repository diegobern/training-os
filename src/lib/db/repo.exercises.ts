import { flag } from '../flags'
import { useApp } from '../../store/useApp'
import { catalogById, catalogEntry, loadCatalogIndex } from '../catalog/store'
import { filterCatalog, toExercise } from '../catalog/resolve'
import { allPrefs, getPref, toggleFavorite } from './repo.prefs'
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
/**
 * Seeds the old built-in library.
 *
 * Retired once the catalog is on: those 69 exercises are now in the shared
 * catalog under the same `lib-*` ids, so writing copies of them into the
 * account would be the duplication this architecture exists to prevent — and
 * it would put 69 writes on a brand-new account's first launch.
 *
 * Kept behind the flag so turning the catalog off restores the old behaviour
 * exactly.
 */
export async function seedLibraryIfEmpty(language: Language): Promise<number> {
  if (flag('exerciseMediaV2')) return 0
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
  /** strength | cardio | mobility. The axis cardio needs. */
  kind?: string
  difficulty?: string
  cardioMode?: string
  favoritesOnly?: boolean
  customOnly?: boolean
  includeDeleted?: boolean
  /** Ranks compatible equipment first. Never hides anything. */
  preferredEquipment?: string[]
}

/**
 * Every exercise the user can reach: the shared catalog plus their own.
 *
 * The catalog is a static file, loaded once and cached; the user's own
 * exercises come from their database, as they always did. They are merged
 * here rather than in each screen so that the library, the routine editor and
 * the workout picker cannot drift apart.
 *
 * Two rules the merge exists to enforce:
 *
 *   · The catalog wins on id collisions. Existing accounts still hold the 69
 *     rows the old seeder wrote, under the very same `lib-*` ids the catalog
 *     uses. Those rows are stale shadows — the catalog entry is bilingual and
 *     better curated — but they are NOT deleted, so nothing is destroyed if
 *     this has to be rolled back.
 *   · Names resolve in the language being used NOW. The old seeder froze one
 *     language into the row at first launch, which is why switching to English
 *     used to leave the whole library in Spanish.
 *
 * Nothing here runs at boot. It is called by the library, the picker and the
 * routine editor — never before a screen needs it.
 */
export async function listExercises(filter: ExerciseFilter = {}): Promise<Exercise[]> {
  const lang = useApp.getState().settings.language

  const [db, prefs] = await Promise.all([getDB(), allPrefs()])
  const own = await db.getAll('exercises')

  let catalogRows: Exercise[] = []
  if (flag('exerciseMediaV2')) {
    try {
      const file = await loadCatalogIndex()
      const entries = filterCatalog(
        file.exercises,
        {
          search: filter.search,
          muscleGroup: filter.muscleGroup,
          equipment: filter.equipment === 'all' ? undefined : filter.equipment,
          type: filter.type === 'all' ? undefined : filter.type,
          kind: filter.kind,
          difficulty: filter.difficulty,
          cardioMode: filter.cardioMode,
          favoritesOnly: filter.favoritesOnly,
          preferredEquipment: filter.preferredEquipment,
        },
        lang,
        prefs,
      )
      catalogRows = entries.map((e) => toExercise(e, lang, prefs.get(e.id)))
    } catch (err) {
      // A catalog that will not load must not take the library with it. The
      // user's own exercises are still theirs and still work.
      log('catalog', `could not load: ${String(err)}`, 'warn')
    }
  }

  const catalogIds = new Set(catalogRows.map((e) => e.id))
  const q = filter.search?.trim().toLowerCase()

  const ownRows = own
    // A row the catalog also provides is a stale shadow of it.
    .filter((e) => !catalogIds.has(e.id))
    // Once the catalog is on, the old seeded rows are redundant: they are not
    // the user's work, they are a copy of a list we now ship. Only what the
    // user actually created stays.
    .filter((e) => (flag('exerciseMediaV2') ? e.isCustom : true))
    .filter((e) => (filter.includeDeleted ? true : !e.deletedAt))
    .filter((e) => (filter.muscleGroup && filter.muscleGroup !== 'all' ? e.muscleGroup === filter.muscleGroup : true))
    .filter((e) => (filter.equipment && filter.equipment !== 'all' ? e.equipment === filter.equipment : true))
    .filter((e) => (filter.type && filter.type !== 'all' ? e.type === filter.type : true))
    .filter((e) => (filter.kind && filter.kind !== 'all' ? (e.kind ?? 'strength') === filter.kind : true))
    .filter((e) => (filter.favoritesOnly ? (prefs.get(e.id)?.favorite ?? e.isFavorite) : true))
    .filter((e) =>
      q ? e.name.toLowerCase().includes(q) || e.primaryMuscle.toLowerCase().includes(q) : true,
    )
    // A custom exercise carries its favourite flag in prefs like everything
    // else, so one star works the same wherever it is tapped.
    .map((e) => ({ ...e, isFavorite: prefs.get(e.id)?.favorite ?? e.isFavorite }))

  if (filter.customOnly) return ownRows.sort(byName(lang))

  // The user's own exercises lead: they made them on purpose.
  return [...ownRows.sort(byName(lang)), ...catalogRows]
}

function byName(lang: string) {
  return (a: Exercise, b: Exercise) => a.name.localeCompare(b.name, lang === 'es' ? 'es' : 'en')
}

/**
 * One exercise by id, from wherever it lives.
 *
 * The user's own database is consulted first because a custom exercise is
 * theirs and can never be shadowed by the catalog; the catalog answers for
 * everything else. Routines, logs and records all reference exercises by id,
 * so this is the lookup that keeps years of history resolving after the
 * library moved out of the account.
 */
export async function getExercise(id: string): Promise<Exercise | undefined> {
  const db = await getDB()
  const own = await db.get('exercises', id)
  if (own?.isCustom) return { ...own, isFavorite: (await getPref(id))?.favorite ?? own.isFavorite }

  if (flag('exerciseMediaV2')) {
    try {
      const entry = await catalogEntry(id)
      if (entry) {
        const lang = useApp.getState().settings.language
        return toExercise(entry, lang, await getPref(id))
      }
    } catch (err) {
      log('catalog', `lookup failed for ${id}: ${String(err)}`, 'warn')
    }
  }
  // Falls through to the user's row: an account from before the catalog still
  // has the seeded copies, and a stale name beats a missing exercise.
  return own
}

/**
 * Several exercises at once, for a routine day or a session.
 *
 * The user's own rows come from one transaction and the catalog from its
 * already-loaded index, so this is one database read regardless of how many
 * ids are asked for.
 */
export async function getExercisesByIds(ids: string[]): Promise<Map<string, Exercise>> {
  const unique = [...new Set(ids)]
  const db = await getDB()
  const tx = db.transaction('exercises')
  const map = new Map<string, Exercise>()
  await Promise.all(
    unique.map(async (id) => {
      const ex = await tx.store.get(id)
      if (ex) map.set(id, ex)
    }),
  )
  await tx.done

  if (!flag('exerciseMediaV2')) return map

  try {
    const [byId, prefs] = await Promise.all([catalogById(), allPrefs()])
    const lang = useApp.getState().settings.language
    for (const id of unique) {
      // A custom exercise is the user's and is never shadowed; everything
      // else prefers the catalog, which is bilingual and current.
      if (map.get(id)?.isCustom) continue
      const entry = byId.get(id)
      if (entry) map.set(id, toExercise(entry, lang, prefs.get(id)))
    }
  } catch (err) {
    log('catalog', `batch lookup failed: ${String(err)}`, 'warn')
  }
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

/**
 * Favourites live in preferences, not on the exercise.
 *
 * A catalog exercise is shared and read-only, so the star cannot be stored on
 * it — that is exactly the copy-per-account this architecture exists to avoid.
 * One tiny preference row per favourited exercise instead.
 */
export async function toggleFavoriteExercise(id: string): Promise<void> {
  await toggleFavorite(id)
  notify('exercises')
}
