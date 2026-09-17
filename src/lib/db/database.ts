import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  BodyweightEntry,
  Exercise,
  ExerciseLog,
  MeasurementEntry,
  MetaRow,
  Milestone,
  PersonalRecord,
  ProgressPhoto,
  Routine,
  Settings,
  WorkoutSession,
} from './schema'
import { defaultSettings } from './schema'

export const DB_NAME = 'training-os'
export const DB_VERSION = 3

export interface SyncQueueRow {
  /** `${store}:${docId}` — repeated edits to one document collapse into one entry. */
  id: string
  store: string
  docId: string
  op: 'put' | 'delete'
  queuedAt: number
  attempts: number
  lastError: string | null
}

export interface SyncStateRow {
  key: string
  value: unknown
  updatedAt: number
}

/**
 * A cached copy of the built-in catalog, so the library works offline and does
 * not refetch on every launch. This is a mirror of a static file, never user
 * data: it is not synced, not backed up, and can be thrown away and refetched.
 */
export interface CatalogCacheRow {
  key: string
  version: number
  payload: unknown
  fetchedAt: number
}

/**
 * What the user has done to a catalog exercise: favourited it, hidden it from
 * suggestions, written their own note, or overridden its defaults.
 *
 * This exists so the catalog itself can stay read-only and shared. Without it,
 * favouriting an exercise would mean owning a private copy of that exercise —
 * which is how a built-in catalog turns into hundreds of documents per
 * account. Rows are created only for exercises the user actually touches.
 */
export interface ExercisePrefRow {
  /** The catalog or custom exercise id this refers to. */
  id: string
  favorite?: boolean
  /** Kept out of suggestions. Never out of search — this is a preference. */
  hidden?: boolean
  note?: string
  defaults?: {
    sets?: number
    repMin?: number
    repMax?: number
    restSeconds?: number
    rirTarget?: number | null
  }
  lastUsedAt?: number
  updatedAt: number
}

export interface TrainingDB extends DBSchema {
  settings: { key: string; value: Settings }
  meta: { key: string; value: MetaRow }
  syncQueue: { key: string; value: SyncQueueRow; indexes: { 'by-store': string; 'by-queued': number } }
  syncState: { key: string; value: SyncStateRow }
  catalog: { key: string; value: CatalogCacheRow }
  exercisePrefs: {
    key: string
    value: ExercisePrefRow
    indexes: { 'by-updated': number }
  }
  exercises: {
    key: string
    value: Exercise
    indexes: { 'by-muscle': string; 'by-name': string; 'by-custom': number }
  }
  routines: {
    key: string
    value: Routine
    indexes: { 'by-updated': number }
  }
  sessions: {
    key: string
    value: WorkoutSession
    indexes: { 'by-started': number; 'by-status': string }
  }
  exerciseLogs: {
    key: string
    value: ExerciseLog
    indexes: {
      'by-exercise': string
      'by-date': string
      'by-session': string
      'by-exercise-time': [string, number]
    }
  }
  personalRecords: {
    key: string
    value: PersonalRecord
    indexes: { 'by-exercise': string; 'by-achieved': number; 'by-exercise-type': [string, string] }
  }
  bodyweight: { key: string; value: BodyweightEntry; indexes: { 'by-date': string } }
  measurements: { key: string; value: MeasurementEntry; indexes: { 'by-date': string } }
  photos: { key: string; value: ProgressPhoto; indexes: { 'by-date': string } }
  milestones: { key: string; value: Milestone; indexes: { 'by-key': string } }
}

let dbPromise: Promise<IDBPDatabase<TrainingDB>> | null = null

/**
 * `stale` means another tab upgraded the database and this tab's connection
 * was closed so that could happen. The data is fine; this tab is not.
 */
export type DbStatus = 'idle' | 'ready' | 'blocked' | 'stale' | 'error'

let status: DbStatus = 'idle'
let lastError: string | null = null

export function getDbStatus() {
  return { status, lastError }
}

export function getDB(): Promise<IDBPDatabase<TrainingDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrainingDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        log('upgrade', `from v${oldVersion} to v${DB_VERSION}`)

        // `transaction` is destructured on purpose. The guarded
        // `if (!contains(store))` pattern below can only ever create a store
        // whole — it cannot add an index to a store that already exists,
        // because the guard skips the entire block. Anything that needs to
        // alter an existing store goes in a version-gated branch at the
        // bottom of this function, using this transaction.

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('exercises')) {
          const s = db.createObjectStore('exercises', { keyPath: 'id' })
          s.createIndex('by-muscle', 'muscleGroup')
          s.createIndex('by-name', 'name')
          s.createIndex('by-custom', 'isCustom')
        }
        if (!db.objectStoreNames.contains('routines')) {
          const s = db.createObjectStore('routines', { keyPath: 'id' })
          s.createIndex('by-updated', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id' })
          s.createIndex('by-started', 'startedAt')
          s.createIndex('by-status', 'status')
        }
        if (!db.objectStoreNames.contains('exerciseLogs')) {
          const s = db.createObjectStore('exerciseLogs', { keyPath: 'id' })
          s.createIndex('by-exercise', 'exerciseId')
          s.createIndex('by-date', 'date')
          s.createIndex('by-session', 'sessionId')
          s.createIndex('by-exercise-time', ['exerciseId', 'performedAt'])
        }
        if (!db.objectStoreNames.contains('personalRecords')) {
          const s = db.createObjectStore('personalRecords', { keyPath: 'id' })
          s.createIndex('by-exercise', 'exerciseId')
          s.createIndex('by-achieved', 'achievedAt')
          s.createIndex('by-exercise-type', ['exerciseId', 'type'])
        }
        if (!db.objectStoreNames.contains('bodyweight')) {
          const s = db.createObjectStore('bodyweight', { keyPath: 'id' })
          s.createIndex('by-date', 'date')
        }
        if (!db.objectStoreNames.contains('measurements')) {
          const s = db.createObjectStore('measurements', { keyPath: 'id' })
          s.createIndex('by-date', 'date')
        }
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id' })
          s.createIndex('by-date', 'date')
        }
        if (!db.objectStoreNames.contains('milestones')) {
          const s = db.createObjectStore('milestones', { keyPath: 'id' })
          s.createIndex('by-key', 'key')
        }

        // v2 — account sync. Purely additive: no existing store is touched, so
        // upgrading an install that already holds months of training keeps it.
        if (!db.objectStoreNames.contains('syncQueue')) {
          const s = db.createObjectStore('syncQueue', { keyPath: 'id' })
          s.createIndex('by-store', 'store')
          s.createIndex('by-queued', 'queuedAt')
        }
        if (!db.objectStoreNames.contains('syncState')) {
          db.createObjectStore('syncState', { keyPath: 'key' })
        }

        // v3 — the built-in catalog and per-user exercise preferences.
        // Additive, like v2: nothing existing is touched, so an install
        // holding months of training keeps every row of it.
        if (!db.objectStoreNames.contains('catalog')) {
          db.createObjectStore('catalog', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('exercisePrefs')) {
          const s = db.createObjectStore('exercisePrefs', { keyPath: 'id' })
          s.createIndex('by-updated', 'updatedAt')
        }

        /* --- alterations to stores that already exist ---------------------
           These need the version gate AND the upgrade transaction, because
           the guards above deliberately skip a store that is already there.
           Nothing needs one yet; this is the seam, documented so the next
           change does not repeat the v2 mistake of quietly not running.

           if (oldVersion > 0 && oldVersion < 3) {
             transaction.objectStore('exercises').createIndex('by-kind', 'kind')
           }
        */
        void transaction
      },
      /**
       * We want to upgrade and someone else is holding the old version open.
       *
       * This used to only set a flag. `openDB` then never settled, `init()`
       * awaited it forever, and the app sat on its boot screen with no error
       * of any kind — which is exactly the production failure this handler
       * now exists to prevent. The timeout below turns the hang into a real,
       * recoverable error.
       */
      blocked(currentVersion, blockedVersion) {
        status = 'blocked'
        lastError = `BLOCKED_UPGRADE v${currentVersion ?? '?'}->v${blockedVersion ?? DB_VERSION}`
        log('blocked', `another client is holding v${currentVersion ?? '?'} open; cannot upgrade to v${blockedVersion ?? DB_VERSION}`)
      },

      /**
       * Someone else wants to upgrade and WE are what is blocking them.
       *
       * The old code logged "closing this connection" and then did not close
       * it. So one forgotten tab — or the installed PWA window — held the old
       * version open indefinitely and every new tab hung on boot. Closing is
       * the whole job of this callback; the comment was right and the code
       * was missing.
       *
       * Once closed, this tab's database handle is dead. It is marked stale so
       * the UI can offer a reload rather than failing on the next write.
       */
      blocking(currentVersion, blockedVersion, event) {
        log('blocking', `this tab holds v${currentVersion ?? '?'}; closing so v${blockedVersion ?? '?'} can upgrade`)
        try {
          ;(event.target as IDBDatabase | null)?.close()
        } catch (err) {
          log('blocking', `could not close: ${String(err)}`, 'warn')
        }
        status = 'stale'
        dbPromise = null
        notify('db-stale')
      },
      terminated() {
        status = 'error'
        lastError = 'The browser terminated the database connection unexpectedly.'
        log('terminated', lastError)
        dbPromise = null
      },
    })

    /**
     * A blocked upgrade produces a promise that never settles. Racing it is
     * what makes that impossible: after OPEN_TIMEOUT_MS the boot fails with a
     * named error the UI can act on, instead of sitting on a screen forever.
     *
     * Ten seconds is long enough that a slow device mid-migration is never cut
     * off — a migration that is actually running keeps the connection, it does
     * not stall — and short enough that nobody stares at a logo wondering.
     */
    const OPEN_TIMEOUT_MS = 10_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const reason =
          status === 'blocked'
            ? 'BLOCKED_UPGRADE'
            : 'OPEN_TIMEOUT'
        reject(new Error(reason))
      }, OPEN_TIMEOUT_MS)
    })

    dbPromise = Promise.race([dbPromise, guard])
      .then((db) => {
        clearTimeout(timer)
        status = 'ready'
        lastError = null
        return db
      })
      .catch((err: unknown) => {
        clearTimeout(timer)
        // A blocked upgrade is not a corrupt database — it is a different tab
        // in the way — so it keeps its own status and its own message.
        if (status !== 'blocked') status = 'error'
        lastError = err instanceof Error ? err.message : String(err)
        log('error', lastError)
        // Cleared so a retry actually reopens rather than returning the same
        // rejected promise forever.
        dbPromise = null
        throw err
      })
  }
  return dbPromise
}

/* ------------------------------------------------------------------ logging */

type LogLevel = 'info' | 'warn' | 'error'
export interface LogEntry {
  at: number
  scope: string
  level: LogLevel
  message: string
}

const LOG_LIMIT = 300
const logs: LogEntry[] = []
const logListeners = new Set<() => void>()

export function log(scope: string, message: string, level: LogLevel = 'info') {
  const entry: LogEntry = { at: Date.now(), scope, level, message }
  logs.unshift(entry)
  if (logs.length > LOG_LIMIT) logs.length = LOG_LIMIT
  logListeners.forEach((fn) => fn())
  if (import.meta.env.DEV) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
    fn(`[training-os:${scope}] ${message}`)
  }
}

export function getLogs(): LogEntry[] {
  return logs
}

export function subscribeLogs(fn: () => void) {
  logListeners.add(fn)
  return () => {
    logListeners.delete(fn)
  }
}

/* -------------------------------------------------------- change broadcast */

export type StoreName = Extract<keyof TrainingDB, string>

const listeners = new Map<string, Set<() => void>>()
let bumpVersion = 0

export function subscribeStore(stores: StoreName[] | '*', fn: () => void) {
  const keys = stores === '*' ? ['*'] : stores
  keys.forEach((k) => {
    if (!listeners.has(k)) listeners.set(k, new Set())
    listeners.get(k)!.add(fn)
  })
  return () => {
    keys.forEach((k) => listeners.get(k)?.delete(fn))
  }
}

export function notify(...stores: StoreName[]) {
  bumpVersion++
  const called = new Set<() => void>()
  const fire = (key: string) => {
    listeners.get(key)?.forEach((fn) => {
      if (!called.has(fn)) {
        called.add(fn)
        fn()
      }
    })
  }
  stores.forEach(fire)
  fire('*')
}

export function storeVersion() {
  return bumpVersion
}

/* ------------------------------------------------------------------ settings */

let settingsCache: Settings | null = null

export async function readSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache
  const db = await getDB()
  const existing = await db.get('settings', 'app')
  if (existing) {
    // Merge forward so a stored settings row from an older build never breaks.
    const merged: Settings = {
      ...defaultSettings(existing.createdAt),
      ...existing,
      availableWeights: {
        ...defaultSettings().availableWeights,
        ...(existing.availableWeights ?? {}),
      },
      weeklySetTargets: {
        ...defaultSettings().weeklySetTargets,
        ...(existing.weeklySetTargets ?? {}),
      },
    }
    settingsCache = merged
    return merged
  }
  const fresh = defaultSettings()
  await db.put('settings', fresh)
  settingsCache = fresh
  log('settings', 'created default settings')
  return fresh
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings()
  const next: Settings = { ...current, ...patch, id: 'app', updatedAt: Date.now() }
  const db = await getDB()
  await db.put('settings', next)
  settingsCache = next
  notify('settings')
  return next
}

export function invalidateSettingsCache() {
  settingsCache = null
}

/* ---------------------------------------------------------------- meta rows */

export async function getMeta<T = unknown>(key: string, fallback: T): Promise<T> {
  const db = await getDB()
  const row = await db.get('meta', key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('meta', { key, value, updatedAt: Date.now() })
  notify('meta')
}

/* -------------------------------------------------------------- estimates */

export interface StorageEstimateInfo {
  usage: number | null
  quota: number | null
  persisted: boolean
}

export async function storageInfo(): Promise<StorageEstimateInfo> {
  let usage: number | null = null
  let quota: number | null = null
  let persisted = false
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      usage = est.usage ?? null
      quota = est.quota ?? null
    }
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted()
  } catch {
    /* storage estimation is a nicety, never a requirement */
  }
  return { usage, quota, persisted }
}

/**
 * Ask the browser to keep our data even under storage pressure.
 * Chrome grants this silently for installed PWAs; Safari ignores it.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist()
      log('storage', granted ? 'persistent storage granted' : 'persistent storage not granted')
      return granted
    }
  } catch (err) {
    log('storage', `persist() failed: ${String(err)}`, 'warn')
  }
  return false
}
