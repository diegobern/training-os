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

type CacheKey = 'exercises' | 'media-index' | 'instructions' | 'media-attribution'

let indexPromise: Promise<CatalogFile> | null = null
let mediaPromise: Promise<MediaIndex> | null = null
let instructionsPromise: Promise<InstructionFile> | null = null
let attributionPromise: Promise<MediaAttributionFile> | null = null

/**
 * Cache-first with a network fallback, never the other way round.
 *
 * The catalog for a given version is immutable — a change ships as v2 — so a
 * cached copy is always correct and there is nothing to revalidate. This is
 * also what makes the library work on a phone with no signal.
 */
async function loadFile<T>(key: CacheKey): Promise<T> {
  const db = await getDB()
  try {
    const row = await db.get('catalog', key)
    if (row && row.version === CATALOG_VERSION) return row.payload as T
  } catch (err) {
    log('catalog', `cache read failed for ${key}: ${String(err)}`, 'warn')
  }

  const res = await fetch(`${BASE}/${key}.json`, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`catalog ${key}: HTTP ${res.status}`)
  const payload = (await res.json()) as T

  try {
    await db.put('catalog', { key, version: CATALOG_VERSION, payload, fetchedAt: Date.now() })
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
