import { getDB, notify, type StoreName, type SyncQueueRow } from '../db/database'
import { SYNCED_STORES, type SyncedStore } from '../firebase/paths'

const SYNCED = new Set<string>(SYNCED_STORES)

export function isSyncedStore(store: string): store is SyncedStore {
  return SYNCED.has(store)
}

/* ------------------------------------------------------------ outbox writes */

/**
 * The outbox records *intent*, not payload: "this document changed".
 * At flush time the current local document is read and sent, so a set edited
 * five times while offline uploads once, and the same stable document id means
 * a retry can never create a duplicate.
 */
/**
 * Told whenever something lands in the outbox.
 *
 * The engine registers here rather than the queue importing the engine, which
 * would be a cycle. Before this existed the only thing that pushed was a
 * 60-second interval, so saving a routine could sit locally for most of a
 * minute before it reached the account — which is what "it takes ages to
 * save" actually was. The write was always instant; the upload was not.
 */
let onQueued: (() => void) | null = null

export function setQueueListener(fn: (() => void) | null): void {
  onQueued = fn
}

function queued(): void {
  try {
    onQueued?.()
  } catch {
    /* a listener must never be able to break a local write */
  }
}

export async function enqueue(store: SyncedStore, docId: string, op: 'put' | 'delete'): Promise<void> {
  const db = await getDB()
  const id = `${store}:${docId}`
  const existing = await db.get('syncQueue', id)
  const row: SyncQueueRow = {
    id,
    store,
    docId,
    op,
    queuedAt: existing?.queuedAt ?? Date.now(),
    attempts: 0,
    lastError: null,
  }
  await db.put('syncQueue', row)
  notify('syncQueue')
  queued()
}

export async function enqueueMany(entries: { store: SyncedStore; docId: string; op: 'put' | 'delete' }[]) {
  if (!entries.length) return
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  for (const e of entries) {
    const id = `${e.store}:${e.docId}`
    const existing = await tx.store.get(id)
    await tx.store.put({
      id,
      store: e.store,
      docId: e.docId,
      op: e.op,
      queuedAt: existing?.queuedAt ?? Date.now(),
      attempts: 0,
      lastError: null,
    })
  }
  await tx.done
  notify('syncQueue')
  queued()
}

export async function pendingCount(): Promise<number> {
  const db = await getDB()
  return db.count('syncQueue')
}

export async function pendingIds(): Promise<Set<string>> {
  const db = await getDB()
  const rows = await db.getAll('syncQueue')
  return new Set(rows.map((r) => r.id))
}

export async function takeBatch(limit: number): Promise<SyncQueueRow[]> {
  const db = await getDB()
  const rows = await db.getAllFromIndex('syncQueue', 'by-queued')
  return rows.slice(0, limit)
}

export async function clearEntries(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  for (const id of ids) await tx.store.delete(id)
  await tx.done
  notify('syncQueue')
}

export async function markFailed(ids: string[], message: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  for (const id of ids) {
    const row = await tx.store.get(id)
    if (row) await tx.store.put({ ...row, attempts: row.attempts + 1, lastError: message })
  }
  await tx.done
  notify('syncQueue')
}

export async function clearQueue(): Promise<void> {
  const db = await getDB()
  await db.clear('syncQueue')
  notify('syncQueue')
}

/* ------------------------------------------------------------- sync state */

export async function getSyncState<T>(key: string, fallback: T): Promise<T> {
  const db = await getDB()
  const row = await db.get('syncState', key)
  return row ? (row.value as T) : fallback
}

export async function setSyncState(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('syncState', { key, value, updatedAt: Date.now() })
}

export const OWNER_KEY = 'ownerUid'
export const lastPullKey = (store: SyncedStore) => `lastPull:${store}`
export const TOMBSTONE_PULL_KEY = 'lastPull:tombstones'

/* ------------------------------------------------- sync-aware persistence */

/**
 * Every repository write goes through these two helpers, so there is exactly
 * one place that decides "this change must also reach the account".
 */
/**
 * idb types each store separately; a helper that accepts any of them needs one
 * narrowing cast. Keeping it in these two lines means nothing else has to.
 */
type AnyStore = 'exercises'

async function rawPut(store: SyncedStore, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put(store as AnyStore, value as never)
}

async function rawDelete(store: SyncedStore, id: string): Promise<void> {
  const db = await getDB()
  await db.delete(store as AnyStore, id)
}

export async function putSynced<T extends { id: string }>(store: SyncedStore, value: T): Promise<void> {
  await rawPut(store, value)
  await enqueue(store, value.id, 'put')
  notify(store as StoreName)
}

export async function deleteSynced(store: SyncedStore, id: string): Promise<void> {
  await rawDelete(store, id)
  await enqueue(store, id, 'delete')
  notify(store as StoreName)
}

/** Used by the pull path: writes what the server sent without echoing it back. */
export async function putFromServer<T extends { id: string }>(store: SyncedStore, value: T): Promise<void> {
  await rawPut(store, value)
}

export async function deleteFromServer(store: SyncedStore, id: string): Promise<void> {
  await rawDelete(store, id)
}
