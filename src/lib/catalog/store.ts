import { getDB, log } from '../db/database'
import type {
  CatalogEntryRaw,
  CatalogFile,
  InstructionEntry,
  InstructionFile,
  MediaAttributionFile,
  MediaIndex,
} from './types'

/**
 * The built-in exercise catalog.
 *
 * It is a static, versioned asset — not documents in anyone's account. That is
 * the whole design: 1096 exercises shared by every user cost zero Firestore
 * writes on sign-up, zero reads on a new device, and updating them is
 * publishing a new file rather than rewriting a thousand documents per account.
 *
 * Fetched once, cached in IndexedDB so the library works offline, and split
 * into four files so the first load stays small:
 *
 *   exercises.json          39 KB gz   the index — needed to list anything
 *   media-index.json         5 KB gz   three image paths per illustrated entry
 *   instructions.json      146 KB gz   only when HOW TO is first opened
 *   media-attribution.json  30 KB gz   only by the attributions screen
 */

export const CATALOG_VERSION = 2
const BASE = `/catalog/v${CATALOG_VERSION}`

export type CacheKey = 'exercises' | 'media-index' | 'instructions' | 'media-attribution'

let indexPromise: Promise<CatalogFile> | null = null
let mediaPromise: Promise<MediaIndex> | null = null
let instructionsPromise: Promise<InstructionFile> | null = null
let attributionPromise: Promise<MediaAttributionFile> | null = null

/**
 * The fingerprint of each file as it was when this build was made, from
 * vite.config.ts. Absent outside a Vite build (the unit tests), in which case
 * the version alone decides, as it always did.
 */
const REVISIONS: Record<string, string> = typeof __CATALOG_REVISIONS__ === 'undefined' ? {} : __CATALOG_REVISIONS__

/** The fingerprint this build expects for one file, or null if it has none. */
export function catalogRevision(key: CacheKey, revisions: Record<string, string> = REVISIONS): string | null {
  return revisions[`v${CATALOG_VERSION}/${key}`] ?? null
}

/**
 * Whether a cached row can be served as it is: same catalog version and, when
 * the build knows the file's fingerprint, the same fingerprint.
 */
export function cachedRowIsCurrent(
  row: { version: number; rev?: string } | undefined,
  rev: string | null,
): boolean {
  if (!row || row.version !== CATALOG_VERSION) return false
  return rev === null || row.rev === rev
}

/**
 * Cache-first with a network fallback, never the other way round. This is
 * what makes the library work on a phone with no signal.
 *
 * "A change ships as a new version" was the rule, and it holds for a change of
 * format. It does not hold for content: filling in the Spanish instructions
 * changed instructions.json without changing its shape, and a phone that had
 * opened HOW TO once would have gone on reading the cached English copy for
 * good — from IndexedDB here, and from the service worker's CacheFirst rule
 * underneath. So each row also remembers the fingerprint of the file it came
 * from; when the build carries a different one, the file is fetched again,
 * under a URL that names that fingerprint so no cache in between can answer
 * with the old one. A file that has not changed keeps its fingerprint and is
 * never fetched twice.
 */
async function loadFile<T>(key: CacheKey): Promise<T> {
  const db = await getDB()
  const rev = catalogRevision(key)
  try {
    const row = await db.get('catalog', key)
    if (row && cachedRowIsCurrent(row, rev)) return row.payload as T
  } catch (err) {
    log('catalog', `cache read failed for ${key}: ${String(err)}`, 'warn')
  }

  const url = rev ? `${BASE}/${key}.json?rev=${rev}` : `${BASE}/${key}.json`
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`catalog ${key}: HTTP ${res.status}`)
  const payload = (await res.json()) as T

  try {
    await db.put('catalog', { key, version: CATALOG_VERSION, rev: rev ?? undefined, payload, fetchedAt: Date.now() })
  } catch (err) {
    // A full quota or a private window must not stop the catalog being used;
    // it only means it will be fetched again next launch.
    log('catalog', `cache write failed for ${key}: ${String(err)}`, 'warn')
  }
  return payload
}

export function loadCatalogIndex(): Promise<CatalogFile> {
  indexPromise ??= loadFile<CatalogFile>('exercises')
  return indexPromise
}

export function loadMediaIndex(): Promise<MediaIndex> {
  mediaPromise ??= loadFile<MediaIndex>('media-index')
  return mediaPromise
}

/** Fetched the first time someone opens HOW TO, not before. */
export function loadInstructions(): Promise<InstructionFile> {
  instructionsPromise ??= loadFile<InstructionFile>('instructions')
  return instructionsPromise
}

/** Fetched only by the attributions screen. */
export function loadAttributions(): Promise<MediaAttributionFile> {
  attributionPromise ??= loadFile<MediaAttributionFile>('media-attribution')
  return attributionPromise
}

export async function instructionsFor(id: string): Promise<InstructionEntry | null> {
  const all = await loadInstructions()
  return all[id] ?? null
}

/* --------------------------------------------------------------- lookups */

let byId: Map<string, CatalogEntryRaw> | null = null

export async function catalogById(): Promise<Map<string, CatalogEntryRaw>> {
  if (byId) return byId
  const file = await loadCatalogIndex()
  byId = new Map(file.exercises.map((e) => [e.id, e]))
  return byId
}

export async function catalogEntry(id: string): Promise<CatalogEntryRaw | null> {
  return (await catalogById()).get(id) ?? null
}

export interface MediaFrames {
  start: string | null
  mid: string | null
  end: string | null
}

export async function mediaFor(entry: Pick<CatalogEntryRaw, 'm'> | null | undefined): Promise<MediaFrames | null> {
  if (!entry?.m) return null
  const index = await loadMediaIndex()
  const hit = index.entries[entry.m]
  if (!hit) return null
  return { start: hit.s, mid: hit.m, end: hit.e }
}

/** Drops the in-memory caches. Used by tests and by a catalog version change. */
export function resetCatalogCache(): void {
  indexPromise = null
  mediaPromise = null
  instructionsPromise = null
  attributionPromise = null
  byId = null
}
