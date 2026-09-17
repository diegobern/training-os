import type { Exercise, Language, MuscleGroup } from '../db/schema'
import type { ExercisePrefRow } from '../db/database'
import type { CatalogEntryRaw } from './types'

/**
 * Turns a catalog entry into the `Exercise` shape the rest of the app already
 * consumes, applying the user's own preferences on top.
 *
 * This is the bridge that let the catalog change from per-user documents to a
 * shared static file without rewriting every screen. Components keep receiving
 * an `Exercise`; what changed is where it comes from.
 *
 * Three things are layered, in this order:
 *
 *   1. the catalog entry — shared, read-only, identical for everyone
 *   2. the user's preference row — favourite, note, overridden defaults
 *   3. the active language — which decides which of the two stored names is
 *      shown, at read time
 *
 * Point 3 is the fix for the bug the audit found: the old seeder collapsed the
 * bilingual catalogue to one language at first launch and stored that, so
 * switching to English left every exercise in Spanish forever. Both names are
 * kept and the choice is made now, on every read.
 */
export function toExercise(
  entry: CatalogEntryRaw,
  lang: Language,
  pref?: ExercisePrefRow | null,
): Exercise {
  const name = lang === 'es' ? entry.n.es : entry.n.en
  const primary = lang === 'es' ? entry.pm.es : entry.pm.en
  const d = entry.def

  return {
    id: entry.id,
    name,
    muscleGroup: entry.mg,
    primaryMuscle: primary,
    secondaryMuscles: (entry.sm ?? []) as string[],
    equipment: entry.eq,
    type: entry.t,
    kind: entry.kind,
    cardioMetrics: entry.cm,
    cardioMode: entry.cmo,
    defaultSets: pref?.defaults?.sets ?? d.sets,
    repMin: pref?.defaults?.repMin ?? d.repMin,
    repMax: pref?.defaults?.repMax ?? d.repMax,
    rirTarget:
      pref?.defaults?.rirTarget !== undefined
        ? pref.defaults.rirTarget
        : entry.kind === 'strength'
          ? 1
          : null,
    rpeTarget: entry.kind === 'strength' ? 9 : null,
    restSeconds: pref?.defaults?.restSeconds ?? d.restSeconds,
    instructions: pref?.note ?? '',
    referenceUrl: '',
    imageUrl: '',
    isCustom: false,
    isFavorite: pref?.favorite ?? false,
    incrementSource: entry.inc,
    demo: false,
    // The catalog is not per-user data, so it has no per-user timestamps.
    // These exist because `Exercise` has them; nothing reads them for a
    // catalog row, and giving them a real date would imply an edit that
    // never happened.
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    fromCatalog: true,
    catalogSlug: entry.slug,
    mediaKey: entry.m ?? null,
    hasInstructions: entry.hasInstructions,
    nameStatus: entry.ns,
  }
}

const SEP = ' | '

/** Everything a catalog entry can be searched by, in either language. */
export function searchHaystack(entry: CatalogEntryRaw): string {
  return [entry.n.en, entry.n.es, entry.pm.en, entry.pm.es, ...(entry.a ?? [])].join(SEP)
}

/**
 * Accent-insensitive lowercase.
 *
 * Without this, a Spanish user typing "biceps" finds nothing because the
 * catalogue says "Bíceps", and typing the accent on a phone keyboard is work
 * nobody should have to do to find an exercise.
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface CatalogFilter {
  search?: string
  muscleGroup?: MuscleGroup | 'all'
  equipment?: string
  kind?: string
  type?: string
  difficulty?: string
  cardioMode?: string
  favoritesOnly?: boolean
  /** Ranks compatible equipment first without hiding anything else. */
  preferredEquipment?: string[]
  /** Kept out of the results only when the caller is asking for suggestions. */
  excludeHidden?: boolean
}

export function filterCatalog(
  entries: CatalogEntryRaw[],
  filter: CatalogFilter,
  lang: Language,
  prefs: Map<string, ExercisePrefRow>,
): CatalogEntryRaw[] {
  const q = filter.search ? fold(filter.search.trim()) : ''
  const terms = q ? q.split(/\s+/).filter(Boolean) : []

  const out = entries.filter((e) => {
    if (filter.kind && filter.kind !== 'all' && e.kind !== filter.kind) return false
    if (filter.muscleGroup && filter.muscleGroup !== 'all' && e.mg !== filter.muscleGroup) return false
    if (filter.equipment && filter.equipment !== 'all' && e.eq !== filter.equipment) return false
    if (filter.type && filter.type !== 'all' && e.t !== filter.type) return false
    if (filter.difficulty && filter.difficulty !== 'all' && e.d !== filter.difficulty) return false
    if (filter.cardioMode && filter.cardioMode !== 'all' && e.cmo !== filter.cardioMode) return false
    if (filter.favoritesOnly && !prefs.get(e.id)?.favorite) return false
    if (filter.excludeHidden && prefs.get(e.id)?.hidden) return false
    if (terms.length) {
      const hay = fold(searchHaystack(e))
      // Every term must appear somewhere, so "incline dumbbell" narrows the
      // result the way a person expects, rather than widening it as OR would.
      for (const t of terms) if (!hay.includes(t)) return false
    }
    return true
  })

  const preferred = filter.preferredEquipment?.length ? new Set(filter.preferredEquipment) : null

  return out.sort((a, b) => {
    // Our own curated entries first: they have real Spanish and better
    // defaults than anything imported.
    if (!!a.curated !== !!b.curated) return a.curated ? -1 : 1
    if (preferred) {
      const ap = preferred.has(a.eq) ? 0 : 1
      const bp = preferred.has(b.eq) ? 0 : 1
      if (ap !== bp) return ap - bp
    }
    const an = lang === 'es' ? a.n.es : a.n.en
    const bn = lang === 'es' ? b.n.es : b.n.en
    return an.localeCompare(bn, lang === 'es' ? 'es' : 'en')
  })
}
