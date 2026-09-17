import { getDB, getMeta, setMeta, notify, log, type ExercisePrefRow } from './database'
import { putSynced, deleteSynced } from '../sync/queue'

/**
 * What the user has done to an exercise, kept apart from the exercise itself.
 *
 * This is what lets the 1096-exercise catalog stay a shared, read-only static
 * file. Without it, favouriting one exercise would mean writing a private copy
 * of that exercise into the account — and the account would slowly accumulate
 * a personal duplicate of a catalog nobody edited.
 *
 * A row exists only for an exercise the user has actually touched. Someone who
 * has favourited four exercises has four rows, not 1096.
 */

let cache: Map<string, ExercisePrefRow> | null = null

export async function allPrefs(): Promise<Map<string, ExercisePrefRow>> {
  if (cache) return cache
  const db = await getDB()
  const rows = await db.getAll('exercisePrefs')
  cache = new Map(rows.map((r) => [r.id, r]))
  return cache
}

export function invalidatePrefs(): void {
  cache = null
}

export async function getPref(id: string): Promise<ExercisePrefRow | null> {
  return (await allPrefs()).get(id) ?? null
}

async function write(row: ExercisePrefRow): Promise<void> {
  // An empty row is deleted rather than stored. A preference that says nothing
  // is not worth a document, and leaving them behind is how a "only what you
  // touched" store turns into one row per exercise anyway.
  const empty =
    !row.favorite && !row.hidden && !row.note && !row.defaults && !row.lastUsedAt
  if (empty) {
    await deleteSynced('exercisePrefs', row.id)
    cache?.delete(row.id)
  } else {
    await putSynced('exercisePrefs', row)
    cache?.set(row.id, row)
  }
  notify('exercisePrefs')
}

export async function setPref(id: string, patch: Partial<Omit<ExercisePrefRow, 'id'>>): Promise<void> {
  const current = (await getPref(id)) ?? { id, updatedAt: 0 }
  await write({ ...current, ...patch, id, updatedAt: Date.now() })
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const current = await getPref(id)
  const next = !current?.favorite
  await setPref(id, { favorite: next || undefined })
  return next
}

export async function toggleHidden(id: string): Promise<boolean> {
  const current = await getPref(id)
  const next = !current?.hidden
  await setPref(id, { hidden: next || undefined })
  return next
}

export async function markUsed(id: string): Promise<void> {
  await setPref(id, { lastUsedAt: Date.now() })
}

/**
 * Carries favourites from the old per-user exercise rows into preferences.
 *
 * Existing accounts favourited exercises when the library was a copy in their
 * own database. That flag is on rows this app no longer reads for catalog
 * exercises, so without this migration a returning user opens the library and
 * finds their favourites gone.
 *
 * Non-destructive on purpose: `isFavorite` is left exactly where it is. If
 * this has to be rolled back, the original data is still there.
 */
export async function migrateFavoritesToPrefs(): Promise<number> {
  const db = await getDB()
  const existing = await db.getAll('exercisePrefs')
  const known = new Set(existing.map((r) => r.id))

  const exercises = await db.getAll('exercises')
  let moved = 0
  for (const ex of exercises) {
    if (!ex.isFavorite || known.has(ex.id)) continue
    await setPref(ex.id, { favorite: true })
    moved++
  }
  return moved
}

const MIGRATION_KEY = 'prefs:favoritesMigrated'

/**
 * Runs the favourites migration once per device, off the boot path.
 *
 * Deliberately fire-and-forget and deliberately silent: a returning user gets
 * their stars back, and a user who never favourited anything pays one cheap
 * read. Nothing here may throw into boot — the app starting matters more than
 * a star.
 */
export async function migrateFavoritesOnce(): Promise<void> {
  try {
    if (await getMeta<boolean>(MIGRATION_KEY, false)) return
    const moved = await migrateFavoritesToPrefs()
    await setMeta(MIGRATION_KEY, true)
    if (moved > 0) log('library', `moved ${moved} favourites into preferences`)
  } catch (err) {
    log('library', `favourite migration skipped: ${String(err)}`, 'warn')
  }
}
