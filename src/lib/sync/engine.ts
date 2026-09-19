/* ============================================================================
 * SYNC ENGINE
 *
 * Firestore is the persistent source of truth for an account.
 * IndexedDB is the offline copy the interface actually reads from.
 * React state is only what is on screen right now.
 *
 * Writing:   UI → IndexedDB (instant) → outbox → Firestore → confirmed
 * Reading:   Firestore → IndexedDB → UI
 *
 * Every document keeps the same stable id everywhere, so a retry after a
 * dropped connection overwrites rather than duplicates.
 * ========================================================================== */

import type {
  DocumentData,
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Timestamp,
} from 'firebase/firestore'
import { log, notify, readSettings, writeSettings, type StoreName } from '../db/database'
import { clearStores, countStore, getAllStore, getFromStore } from '../db/anystore'
import { getFirebase } from '../firebase/app'
import {
  SCHEMA_VERSION,
  SYNCED_STORES,
  SYNC_FIELD,
  photoStoragePath,
  tombstoneCollection,
  userCollection,
  type SyncedStore,
} from '../firebase/paths'
import { pickAccountSettings, type UserProfile } from '../firebase/profile'
import { readProfile, writeProfile } from '../firebase/account'
import {
  OWNER_KEY,
  TOMBSTONE_PULL_KEY,
  clearEntries,
  clearQueue,
  deleteFromServer,
  enqueueMany,
  getSyncState,
  lastPullKey,
  markFailed,
  pendingCount,
  pendingIds,
  putFromServer,
  setSyncState,
  takeBatch,
  setQueueListener,
} from './queue'
import { DEFAULT_WEEKLY_SET_TARGETS, defaultSettings, type ProgressPhoto } from '../db/schema'

/* ------------------------------------------------------------------ status */

export type SyncPhase = 'idle' | 'restoring' | 'syncing' | 'synced' | 'offline' | 'error' | 'disabled'

export interface SyncStatus {
  phase: SyncPhase
  pending: number
  lastSyncedAt: number | null
  restoreLabel: string | null
  restoreDone: number
  restoreTotal: number
  error: string | null
}

let status: SyncStatus = {
  phase: 'disabled',
  pending: 0,
  lastSyncedAt: null,
  restoreLabel: null,
  restoreDone: 0,
  restoreTotal: 0,
  error: null,
}

const statusListeners = new Set<(s: SyncStatus) => void>()

export function syncStatus(): SyncStatus {
  return status
}

export function subscribeSync(fn: (s: SyncStatus) => void) {
  statusListeners.add(fn)
  fn(status)
  return () => {
    statusListeners.delete(fn)
  }
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  statusListeners.forEach((fn) => fn(status))
}

/* ------------------------------------------------------------- local owner */

export type OwnerCheck = 'fresh' | 'same-user' | 'local-data-found' | 'other-user'

async function countLocalData(): Promise<number> {
  let n = 0
  for (const store of SYNCED_STORES) {
    if (store === 'exercises') continue // the seeded library is not "user data"
    n += await countStore(store as StoreName)
  }
  const exercises = await getAllStore<{ isCustom: boolean }>('exercises')
  n += exercises.filter((e) => e.isCustom).length
  return n
}

/** Works out what the data already on this device means for the user signing in. */
export async function checkLocalOwnership(uid: string): Promise<OwnerCheck> {
  const owner = await getSyncState<string | null>(OWNER_KEY, null)
  if (owner === uid) return 'same-user'
  if (owner && owner !== uid) return 'other-user'
  return (await countLocalData()) > 0 ? 'local-data-found' : 'fresh'
}

/** Adopts whatever is on this device into the account and uploads it. */
export async function adoptLocalData(uid: string): Promise<number> {
  const entries: { store: SyncedStore; docId: string; op: 'put' }[] = []
  for (const store of SYNCED_STORES) {
    const rows = await getAllStore<{ id: string }>(store as StoreName)
    for (const row of rows) entries.push({ store, docId: row.id, op: 'put' })
  }
  await enqueueMany(entries)
  await setSyncState(OWNER_KEY, uid)
  log('sync', `adopted ${entries.length} local documents into account ${uid}`)
  return entries.length
}

/** Clears this device's copy so the account starts from what Firestore holds. */
export async function resetLocalData(uid: string | null): Promise<void> {
  await clearStores(SYNCED_STORES as StoreName[])
  await clearQueue()
  for (const store of SYNCED_STORES) await setSyncState(lastPullKey(store), null)
  await setSyncState(TOMBSTONE_PULL_KEY, null)
  await setSyncState(OWNER_KEY, uid)

  /*
   * The questionnaire belongs to the ACCOUNT, not to the phone.
   *
   * `settings` is not a synced store, so it survives this reset — which is
   * right for the theme and the language, and wrong for everything the
   * questionnaire produced. Without this, signing up on a device that had
   * already been through onboarding meant the new account inherited the last
   * person's "already answered" flag: it was never asked, and it silently
   * started out with someone else's weekly set targets and rest times.
   *
   * Cleared here rather than at the call site so that every path that rebinds
   * this device to a different account gets it.
   */
  const settings = await readSettings()
  if (settings.onboardingVersion || settings.trainingProfile) {
    await writeSettings({
      onboardingVersion: 0,
      trainingProfile: null,
      weeklySetTargets: { ...DEFAULT_WEEKLY_SET_TARGETS },
      defaultRestSeconds: defaultSettings().defaultRestSeconds,
    })
    log('sync', 'personalisation cleared: this device now belongs to another account')
  }

  notify(...(SYNCED_STORES as StoreName[]))
  log('sync', `local copy cleared, now bound to ${uid ?? 'no account'}`)
}

/* -------------------------------------------------------------- push (out) */

const BATCH_SIZE = 100

function sanitize(store: SyncedStore, value: Record<string, unknown>): Record<string, unknown> {
  if (store === 'photos') {
    const { blob: _blob, ...rest } = value
    void _blob
    return rest
  }
  return value
}

async function uploadPhoto(uid: string, photo: ProgressPhoto): Promise<string | null> {
  if (!photo.blob) return photo.storagePath
  const services = await getFirebase()
  if (!services) return null
  const { ref, uploadBytes } = await import('firebase/storage')
  const path = photoStoragePath(uid, photo.id)
  await uploadBytes(ref(services.storage, path), photo.blob, { contentType: 'image/jpeg' })
  return path
}

/**
 * Flushes the outbox. Only runs while the browser believes it is online: with
 * an in-memory Firestore cache an offline write would hang forever instead of
 * failing, and a hung write can't be reported honestly.
 */
export async function push(uid: string): Promise<{ sent: number; failed: number }> {
  if (!navigator.onLine) {
    setStatus({ phase: 'offline', pending: await pendingCount() })
    return { sent: 0, failed: 0 }
  }

  const services = await getFirebase()
  if (!services) return { sent: 0, failed: 0 }
  const { db: fs } = services
  const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore')

  let sent = 0
  let failed = 0
  // A document that keeps failing (a photo upload with Storage not set up, say)
  // stays queued on purpose so it can retry later — but it must never turn the
  // flush into an endless loop, so the number of passes is capped.
  let passes = 0

  for (;;) {
    if (passes++ > 50) break
    const rows = await takeBatch(BATCH_SIZE)
    if (!rows.length) break
    const progressed = rows.length

    setStatus({ phase: 'syncing', pending: await pendingCount() })

    const batch = writeBatch(fs)
    const done: string[] = []

    for (const row of rows) {
      const store = row.store as SyncedStore
      const ref = doc(fs, `${userCollection(uid, store)}/${row.docId}`)

      if (row.op === 'delete') {
        batch.delete(ref)
        batch.set(doc(fs, `${tombstoneCollection(uid)}/${store}_${row.docId}`), {
          store,
          docId: row.docId,
          [SYNC_FIELD]: serverTimestamp(),
        })
        done.push(row.id)
        continue
      }

      const current = await getFromStore<Record<string, unknown>>(store as StoreName, row.docId)
      if (!current) {
        // Deleted locally before it was ever uploaded — nothing to send.
        done.push(row.id)
        continue
      }

      if (store === 'photos') {
        const photo = current as unknown as ProgressPhoto
        try {
          const path = await uploadPhoto(uid, photo)
          if (path && path !== photo.storagePath) {
            await putFromServer('photos', { ...photo, storagePath: path })
            current.storagePath = path
          }
        } catch (err) {
          log('sync', `photo upload failed: ${String(err)}`, 'warn')
          failed++
          continue
        }
      }

      batch.set(ref, { ...sanitize(store, current), [SYNC_FIELD]: serverTimestamp() })
      done.push(row.id)
    }

    try {
      await batch.commit()
      await clearEntries(done)
      sent += done.length
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await markFailed(
        rows.map((r) => r.id),
        message,
      )
      setStatus({ phase: 'error', error: message, pending: await pendingCount() })
      log('sync', `push failed: ${message}`, 'error')
      return { sent, failed: failed + rows.length }
    }

    if (rows.length < BATCH_SIZE) break
    if (done.length === 0 && progressed === rows.length) break // nothing is moving
  }

  const pending = await pendingCount()
  setStatus({
    phase: pending === 0 ? 'synced' : 'syncing',
    pending,
    lastSyncedAt: Date.now(),
    error: null,
  })
  if (sent) log('sync', `pushed ${sent} documents`)
  return { sent, failed }
}

/* --------------------------------------------------------------- pull (in) */

const PAGE = 300
const HEAVY_PAGE = 50

function decode(store: SyncedStore, snap: QueryDocumentSnapshot<DocumentData>): Record<string, unknown> {
  const data = { ...snap.data() }
  delete data[SYNC_FIELD]
  data.id = snap.id
  if (store === 'photos') {
    data.blob = null // bytes are fetched from Storage the first time they are shown
  }
  return data
}

async function pullCollection(
  fs: Firestore,
  uid: string,
  store: SyncedStore,
  pendingLocally: Set<string>,
): Promise<number> {
  const { collection, query, where, orderBy, limit, getDocs, startAfter } = await import('firebase/firestore')
  const last = await getSyncState<number | null>(lastPullKey(store), null)
  const pageSize = store === 'sessions' || store === 'exerciseLogs' ? HEAVY_PAGE : PAGE

  let cursor: QueryDocumentSnapshot<DocumentData> | null = null
  let newest = last
  let count = 0

  for (;;) {
    const parts: QueryConstraint[] = [
      ...(last ? [where(SYNC_FIELD, '>', new Date(last))] : []),
      orderBy(SYNC_FIELD),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    ]
    const snap: QuerySnapshot<DocumentData> = await getDocs(
      query(collection(fs, userCollection(uid, store)), ...parts),
    )
    if (snap.empty) break

    for (const docSnap of snap.docs) {
      // A document still waiting in our outbox is newer here than on the
      // server; leave ours alone so the push wins.
      if (pendingLocally.has(`${store}:${docSnap.id}`)) continue
      await putFromServer(store, decode(store, docSnap) as { id: string })
      count++
      const ts = docSnap.get(SYNC_FIELD) as Timestamp | undefined
      const ms = ts?.toMillis?.()
      if (typeof ms === 'number' && (newest === null || ms > newest)) newest = ms
    }

    cursor = snap.docs[snap.docs.length - 1]
    if (snap.docs.length < pageSize) break
  }

  if (newest !== null) await setSyncState(lastPullKey(store), newest)
  if (count) notify(store as StoreName)
  return count
}

async function pullTombstones(fs: Firestore, uid: string): Promise<number> {
  const { collection, query, where, orderBy, getDocs } = await import('firebase/firestore')
  const last = await getSyncState<number | null>(TOMBSTONE_PULL_KEY, null)
  const parts: QueryConstraint[] = [
    ...(last ? [where(SYNC_FIELD, '>', new Date(last))] : []),
    orderBy(SYNC_FIELD),
  ]
  const snap: QuerySnapshot<DocumentData> = await getDocs(
    query(collection(fs, tombstoneCollection(uid)), ...parts),
  )
  let newest = last
  let count = 0
  const touched = new Set<StoreName>()

  for (const docSnap of snap.docs) {
    const store = docSnap.get('store') as SyncedStore
    const docId = docSnap.get('docId') as string
    if (SYNCED_STORES.includes(store) && docId) {
      await deleteFromServer(store, docId)
      touched.add(store as StoreName)
      count++
    }
    const ts = docSnap.get(SYNC_FIELD) as Timestamp | undefined
    const ms = ts?.toMillis?.()
    if (typeof ms === 'number' && (newest === null || ms > newest)) newest = ms
  }

  if (newest !== null) await setSyncState(TOMBSTONE_PULL_KEY, newest)
  if (touched.size) notify(...touched)
  return count
}

/** Fast first: what HOME needs. Then everything else, in the background. */
const FIRST_WAVE: SyncedStore[] = ['exercises', 'exercisePrefs', 'routines']
const SECOND_WAVE: SyncedStore[] = [
  'sessions',
  'exerciseLogs',
  'personalRecords',
  'bodyweight',
  'measurements',
  'milestones',
  'photos',
]

export async function pull(uid: string, opts: { restoring?: boolean } = {}): Promise<number> {
  const services = await getFirebase()
  if (!services) return 0
  const { db: fs } = services
  let total = 0

  const waves = [...FIRST_WAVE, ...SECOND_WAVE]
  if (opts.restoring) {
    setStatus({ phase: 'restoring', restoreDone: 0, restoreTotal: waves.length, restoreLabel: null })
  }

  // Read once for the whole pull. This used to be one full scan of the outbox
  // per collection — ten reads of the same rows to answer the same question.
  const pendingLocally = await pendingIds()
  let done = 0

  /**
   * A wave goes out together.
   *
   * Every collection was being awaited in turn, so signing in cost ten round
   * trips end to end before the app said it was synced — and most of those
   * queries come back empty. They are independent: different collections,
   * different object stores, different cursors. Running a wave in parallel
   * turns ten latencies into two.
   *
   * The waves themselves stay ordered, because the point of the first one is
   * that the home screen has what it needs before the heavy history arrives.
   */
  async function runWave(stores: SyncedStore[]) {
    const counts = await Promise.all(
      stores.map(async (store) => {
        const n = await pullCollection(fs, uid, store, pendingLocally)
        done++
        if (opts.restoring) setStatus({ restoreLabel: store, restoreDone: done, restoreTotal: waves.length })
        return n
      }),
    )
    for (const n of counts) total += n
  }

  await runWave(FIRST_WAVE)
  await runWave(SECOND_WAVE)
  total += await pullTombstones(fs, uid)

  if (opts.restoring) setStatus({ restoreLabel: null, restoreDone: waves.length })
  log('sync', `pulled ${total} documents`)
  return total
}

/* -------------------------------------------------------------- photo bytes */

/** Downloads one photo's bytes on demand and caches them locally. */
export async function ensurePhotoBlob(photo: ProgressPhoto): Promise<Blob | null> {
  if (photo.blob) return photo.blob
  if (!photo.storagePath) return null
  const services = await getFirebase()
  if (!services) return null
  try {
    const { ref, getBlob } = await import('firebase/storage')
    const blob = await getBlob(ref(services.storage, photo.storagePath))
    await putFromServer('photos', { ...photo, blob })
    notify('photos')
    return blob
  } catch (err) {
    log('sync', `photo download failed: ${String(err)}`, 'warn')
    return null
  }
}

/* ------------------------------------------------------------- orchestration */

let activeUid: string | null = null
let timer: number | null = null
/** Pending debounced push, so a burst of local writes becomes one upload. */
let pushSoon: number | null = null
let running = false

export function syncingFor(): string | null {
  return activeUid
}

export async function syncNow(): Promise<void> {
  if (!activeUid || running) return
  running = true
  try {
    await push(activeUid)
    await pull(activeUid)
    const pending = await pendingCount()
    setStatus({
      phase: pending === 0 ? 'synced' : 'syncing',
      pending,
      lastSyncedAt: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus({ phase: 'error', error: message })
    log('sync', `sync cycle failed: ${message}`, 'error')
  } finally {
    running = false
  }
}

export async function startSync(uid: string, opts: { restore?: boolean } = {}): Promise<void> {
  activeUid = uid
  setStatus({ phase: 'syncing', error: null })

  if (opts.restore) {
    await pull(uid, { restoring: true })
  }
  await syncNow()

  if (timer !== null) window.clearInterval(timer)
  timer = window.setInterval(() => void syncNow(), 60_000)

  /**
   * Push shortly after a local write, rather than waiting for the interval.
   *
   * The interval alone meant a routine saved at second 1 reached the account
   * at second 60. The local write was always instant; what felt slow was the
   * upload, and nothing was triggering it.
   *
   * Debounced because one user action can enqueue many documents — finishing
   * a session writes the session, a log per exercise and any records — and
   * that should be one push, not twenty. 1.2s is long enough to collect a
   * burst and short enough to feel immediate.
   */
  setQueueListener(() => {
    if (pushSoon) window.clearTimeout(pushSoon)
    pushSoon = window.setTimeout(() => {
      pushSoon = null
      void syncNow()
    }, 1200)
  })

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
}

export function stopSync(): void {
  setQueueListener(null)
  if (pushSoon) {
    window.clearTimeout(pushSoon)
    pushSoon = null
  }
  activeUid = null
  if (timer !== null) window.clearInterval(timer)
  timer = null
  window.removeEventListener('online', onOnline)
  document.removeEventListener('visibilitychange', onVisible)
  setStatus({ phase: 'disabled', pending: 0, error: null, restoreLabel: null })
}

function onOnline() {
  void syncNow()
}

function onVisible() {
  if (document.visibilityState === 'visible') void syncNow()
}

export async function refreshPending(): Promise<void> {
  const pending = await pendingCount()
  setStatus({
    pending,
    phase: !navigator.onLine ? 'offline' : pending > 0 ? 'syncing' : status.phase === 'disabled' ? 'disabled' : 'synced',
  })
}

/* ------------------------------------------------------------- settings sync */

/** Settings live on the account, so a new device is configured the moment you log in. */
export async function pushSettings(uid: string): Promise<void> {
  const settings = await readSettings()
  await writeProfile(uid, { settings: pickAccountSettings(settings), schemaVersion: SCHEMA_VERSION })
}

export async function applyRemoteSettings(profile: UserProfile): Promise<void> {
  if (!profile.settings) return
  await writeSettings(profile.settings)
}

/* --------------------------------------------------------- account deletion */

/** Removes every remote document for this user before the auth record goes. */
export async function wipeRemoteData(uid: string): Promise<number> {
  const services = await getFirebase()
  if (!services) return 0
  const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore')
  const fs = services.db
  let removed = 0

  for (const store of [...SYNCED_STORES]) {
    const snap = await getDocs(collection(fs, userCollection(uid, store)))
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(fs)
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref)
      await batch.commit()
      removed += Math.min(400, snap.docs.length - i)
    }
  }

  const tomb = await getDocs(collection(fs, tombstoneCollection(uid)))
  for (let i = 0; i < tomb.docs.length; i += 400) {
    const batch = writeBatch(fs)
    for (const d of tomb.docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }

  void doc
  log('sync', `removed ${removed} remote documents for ${uid}`, 'warn')
  return removed
}

export { readProfile }
