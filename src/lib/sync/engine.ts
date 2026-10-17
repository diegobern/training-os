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
import { deleteMeta, log, notify, readSettings, writeSettings, type StoreName } from '../db/database'
import { clearStores, countStore, getAllStore, getFromStore } from '../db/anystore'
import { getFirebase } from '../firebase/app'
import {
  SCHEMA_VERSION,
  SYNCED_STORES,
  SYNC_FIELD,
  avatarStoragePath,
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
  putPulled,
  setSyncState,
  takeBatch,
  setQueueListener,
  ticketOf,
  type QueueTicket,
} from './queue'
import { DEFAULT_WEEKLY_SET_TARGETS, defaultSettings, type ProgressPhoto } from '../db/schema'
import { isSampleRecord } from '../db/sampleData'
import { ACTIVE_EXERCISE_INDEX_KEY, ACTIVE_REST_KEY, ACTIVE_SESSION_KEY } from '../db/repo.sessions'

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

/* ------------------------------------------------------- antes de vaciar */

let beforeLocalResetFn: (() => void) | null = null

/**
 * Lo que tiene que pasar ANTES de vaciar la copia local, sincrónicamente.
 *
 * `main.tsx` conecta aquí el vaciado del entrenamiento en memoria
 * (`useWorkout.reset()`) y la retirada del aviso nativo. Tiene que ser lo
 * primero y sin esperar a nada: un autoguardado pendiente o un descanso que
 * suena no pueden sobrevivir al cambio de dueño y escribir, o avisar, con los
 * datos de la persona anterior. El motor no importa los almacenes de React
 * (sería un ciclo); por eso se inyecta.
 */
export function setBeforeLocalReset(fn: (() => void) | null): void {
  beforeLocalResetFn = fn
}

/** Ejecuta lo registrado en `setBeforeLocalReset`. Nunca lanza: un fallo aquí no puede impedir el vaciado. */
export function beforeLocalReset(): void {
  try {
    beforeLocalResetFn?.()
  } catch (err) {
    log('sync', `before-reset hook failed: ${String(err)}`, 'warn')
  }
}

/**
 * Claves de `meta` que son de la persona, no del dispositivo: el puntero al
 * entrenamiento en curso, su descanso y su ejercicio actual, el borrador del
 * cuestionario y el «ahora no» a la actualización del cuestionario. Las dos
 * últimas las escriben `useOnboarding` y `useAuth`; se repiten aquí como
 * texto porque el motor no puede importar los almacenes.
 */
const OWNER_META_KEYS = [
  ACTIVE_SESSION_KEY,
  ACTIVE_REST_KEY,
  ACTIVE_EXERCISE_INDEX_KEY,
  'onboarding:draft',
  'onboarding:topUpDeclined',
] as const

/** Clears this device's copy so the account starts from what Firestore holds. */
export async function resetLocalData(uid: string | null): Promise<void> {
  // Lo primero, antes del primer `await` (ver `setBeforeLocalReset`).
  beforeLocalReset()
  await clearStores(SYNCED_STORES as StoreName[])
  await deleteMeta(OWNER_META_KEYS)
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

/**
 * Tiempo máximo de una escritura por lotes en Firestore.
 *
 * Con la caché en memoria, un `commit()` sin servidor al otro lado no falla:
 * se queda esperando. Y mientras esperaba, el ciclo de sincronización seguía
 * «en marcha» y ninguno nuevo podía empezar, hasta recargar la app. Pasado
 * este tiempo el lote cuenta como fallido, sus filas se quedan en el buzón
 * para el siguiente intento (mismos ids: reenviar no duplica nada) y el ciclo
 * termina.
 */
export const COMMIT_TIMEOUT_MS = 25_000

/**
 * Lo mismo para cada lectura de la bajada. Una lectura que no responde
 * nunca — el canal de Firestore abierto y sin entregar nada, sin error — dejaba
 * el ciclo «en marcha» para siempre, y con él las subidas: en ios-auth, la
 * serie y el «finalizar» de un entrenamiento no subieron hasta el arranque
 * siguiente. Pasado este tiempo la bajada falla, el ciclo termina y el
 * siguiente lo vuelve a intentar.
 */
export const PULL_TIMEOUT_MS = 25_000

/** Un lote de escrituras, tal como lo necesita `push`. En la app es un `WriteBatch` de Firestore. */
export interface PushBatch {
  set(path: string, data: Record<string, unknown>): void
  delete(path: string): void
  commit(): Promise<void>
}

/** Lo que `push` usa del servidor. Inyectable para poder probar el ciclo sin Firebase. */
export interface PushBackend {
  batch(): PushBatch
  serverTimestamp(): unknown
}

export interface SyncOptions {
  backend?: PushBackend
  commitTimeoutMs?: number
  /**
   * `false` en cuanto se para la sincronización (cierre de sesión, borrado de
   * cuenta). Lo que aún esté en vuelo deja de escribir en la copia local y de
   * tocar el estado: nada de lo que llegue tarde puede colarse en los datos
   * del siguiente dueño.
   */
  alive?: () => boolean
}

async function firestoreBackend(): Promise<PushBackend | null> {
  const services = await getFirebase()
  if (!services) return null
  const fs = services.db
  const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore')
  return {
    batch() {
      const b = writeBatch(fs)
      return {
        set: (path, data) => {
          b.set(doc(fs, path), data)
        },
        delete: (path) => {
          b.delete(doc(fs, path))
        },
        commit: () => b.commit(),
      }
    },
    serverTimestamp: () => serverTimestamp(),
  }
}

/** `p`, o un error `code` si no ha terminado en `ms`. El temporizador se limpia siempre. */
function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), ms)
  })
  return Promise.race([p, guard]).finally(() => clearTimeout(timer))
}

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
export async function push(uid: string, opts: SyncOptions = {}): Promise<{ sent: number; failed: number }> {
  const alive = opts.alive ?? (() => true)
  const report = (patch: Partial<SyncStatus>) => {
    if (alive()) setStatus(patch)
  }
  if (!navigator.onLine) {
    report({ phase: 'offline', pending: await pendingCount() })
    return { sent: 0, failed: 0 }
  }

  const backend = opts.backend ?? (await firestoreBackend())
  if (!backend) return { sent: 0, failed: 0 }
  const commitTimeoutMs = opts.commitTimeoutMs ?? COMMIT_TIMEOUT_MS

  let sent = 0
  let failed = 0
  // A document that keeps failing (a photo upload with Storage not set up, say)
  // stays queued on purpose so it can retry later — but it must never turn the
  // flush into an endless loop, so the number of passes is capped.
  let passes = 0

  for (;;) {
    if (passes++ > 50) break
    // Sincronización parada (cierre de sesión): no se empieza otro lote.
    if (!alive()) break
    const rows = await takeBatch(BATCH_SIZE)
    if (!rows.length) break
    const progressed = rows.length

    report({ phase: 'syncing', pending: await pendingCount() })

    const batch = backend.batch()
    // Cada fila con la versión que tenía al leerla: al terminar sólo se borra
    // si nadie la ha vuelto a encolar mientras tanto (ver `clearEntries`).
    const done: QueueTicket[] = []

    for (const row of rows) {
      const store = row.store as SyncedStore
      const path = `${userCollection(uid, store)}/${row.docId}`

      if (row.op === 'delete') {
        batch.delete(path)
        batch.set(`${tombstoneCollection(uid)}/${store}_${row.docId}`, {
          store,
          docId: row.docId,
          [SYNC_FIELD]: backend.serverTimestamp(),
        })
        done.push(ticketOf(row))
        continue
      }

      const current = await getFromStore<Record<string, unknown>>(store as StoreName, row.docId)
      if (!current) {
        // Deleted locally before it was ever uploaded — nothing to send.
        done.push(ticketOf(row))
        continue
      }

      if (store === 'photos') {
        const photo = current as unknown as ProgressPhoto
        try {
          const storagePath = await uploadPhoto(uid, photo)
          if (storagePath && storagePath !== photo.storagePath) {
            if (alive()) await putFromServer('photos', { ...photo, storagePath })
            current.storagePath = storagePath
          }
        } catch (err) {
          log('sync', `photo upload failed: ${String(err)}`, 'warn')
          failed++
          continue
        }
      }

      batch.set(path, { ...sanitize(store, current), [SYNC_FIELD]: backend.serverTimestamp() })
      done.push(ticketOf(row))
    }

    try {
      await withTimeout(batch.commit(), commitTimeoutMs, 'COMMIT_TIMEOUT')
      await clearEntries(done)
      sent += done.length
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await markFailed(rows.map(ticketOf), message)
      report({ phase: 'error', error: message, pending: await pendingCount() })
      log('sync', `push failed: ${message}`, 'error')
      return { sent, failed: failed + rows.length }
    }

    if (rows.length < BATCH_SIZE) break
    if (done.length === 0 && progressed === rows.length) break // nothing is moving
  }

  const pending = await pendingCount()
  report({
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
  alive: () => boolean,
): Promise<number> {
  const { collection, query, where, orderBy, limit, getDocs, startAfter } = await import('firebase/firestore')
  const last = await getSyncState<number | null>(lastPullKey(store), null)
  const pageSize = store === 'sessions' || store === 'exerciseLogs' ? HEAVY_PAGE : PAGE

  let cursor: QueryDocumentSnapshot<DocumentData> | null = null
  let newest = last
  let count = 0
  const sampleIds: string[] = []

  for (;;) {
    const parts: QueryConstraint[] = [
      ...(last ? [where(SYNC_FIELD, '>', new Date(last))] : []),
      orderBy(SYNC_FIELD),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    ]
    const snap: QuerySnapshot<DocumentData> = await withTimeout(
      getDocs(query(collection(fs, userCollection(uid, store)), ...parts)),
      PULL_TIMEOUT_MS,
      'PULL_TIMEOUT',
    )
    // Lo que llega después de parar la sincronización ya no es de nadie aquí.
    if (!alive()) return count
    if (snap.empty) break

    for (const docSnap of snap.docs) {
      // A document still waiting in our outbox is newer here than on the
      // server; leave ours alone so the push wins.
      if (pendingLocally.has(`${store}:${docSnap.id}`)) continue
      const value = decode(store, docSnap) as { id: string }
      const ts = docSnap.get(SYNC_FIELD) as Timestamp | undefined
      const ms = ts?.toMillis?.()
      if (typeof ms === 'number' && (newest === null || ms > newest)) newest = ms
      // Sample data from the removed "Load DEMO data" never comes back into
      // the app: it is not stored, and it is deleted from the account too.
      // See src/lib/db/sampleData.ts.
      if (isSampleRecord(value)) {
        sampleIds.push(value.id)
        continue
      }
      if (!alive()) return count
      // Lo que se haya guardado aquí mientras se esperaba a Firestore no
      // estaba en `pendingLocally`: `putPulled` lo vuelve a mirar al escribir.
      if (await putPulled(store, value)) count++
    }

    cursor = snap.docs[snap.docs.length - 1]
    if (snap.docs.length < pageSize) break
  }

  if (!alive()) return count
  if (newest !== null) await setSyncState(lastPullKey(store), newest)
  if (sampleIds.length) await enqueueMany(sampleIds.map((docId) => ({ store, docId, op: 'delete' as const })))
  if (count) notify(store as StoreName)
  return count
}

async function pullTombstones(fs: Firestore, uid: string, alive: () => boolean): Promise<number> {
  const { collection, query, where, orderBy, getDocs } = await import('firebase/firestore')
  const last = await getSyncState<number | null>(TOMBSTONE_PULL_KEY, null)
  const parts: QueryConstraint[] = [
    ...(last ? [where(SYNC_FIELD, '>', new Date(last))] : []),
    orderBy(SYNC_FIELD),
  ]
  const snap: QuerySnapshot<DocumentData> = await withTimeout(
    getDocs(query(collection(fs, tombstoneCollection(uid)), ...parts)),
    PULL_TIMEOUT_MS,
    'PULL_TIMEOUT',
  )
  if (!alive()) return 0
  let newest = last
  let count = 0
  const touched = new Set<StoreName>()

  for (const docSnap of snap.docs) {
    const store = docSnap.get('store') as SyncedStore
    const docId = docSnap.get('docId') as string
    if (SYNCED_STORES.includes(store) && docId) {
      if (!alive()) return count
      await deleteFromServer(store, docId)
      touched.add(store as StoreName)
      count++
    }
    const ts = docSnap.get(SYNC_FIELD) as Timestamp | undefined
    const ms = ts?.toMillis?.()
    if (typeof ms === 'number' && (newest === null || ms > newest)) newest = ms
  }

  if (!alive()) return count
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

export async function pull(uid: string, opts: { restoring?: boolean; alive?: () => boolean } = {}): Promise<number> {
  const alive = opts.alive ?? (() => true)
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
        const n = await pullCollection(fs, uid, store, pendingLocally, alive)
        done++
        if (opts.restoring && alive()) setStatus({ restoreLabel: store, restoreDone: done, restoreTotal: waves.length })
        return n
      }),
    )
    for (const n of counts) total += n
  }

  await runWave(FIRST_WAVE)
  if (alive()) await runWave(SECOND_WAVE)
  if (alive()) total += await pullTombstones(fs, uid, alive)

  if (opts.restoring && alive()) setStatus({ restoreLabel: null, restoreDone: waves.length })
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
/** El ciclo en marcha, si lo hay. Hace de la antigua bandera `running`. */
let cycle: Promise<void> | null = null
/** La generación (ver abajo) a la que pertenece `cycle`. */
let cycleGeneration = -1
/** Cuál de los ciclos lanzados es `cycle`: sólo ése lo deja libre al terminar. */
let cycleSerial = 0
/** El ciclo que se hará al terminar `cycle`, si se pidió otro mientras corría. */
let followUp: Promise<void> | null = null
/**
 * Generación de la sincronización: sube con cada `startSync` y cada
 * `stopSync`. Un ciclo recuerda la suya y, si cambia, deja de escribir.
 */
let generation = 0

export function syncingFor(): string | null {
  return activeUid
}

/** Si hay un ciclo de sincronización en marcha. */
export function syncRunning(): boolean {
  return cycle !== null
}

/**
 * Un ciclo para la cuenta activa. Si ya hay uno en marcha, otro detrás de él
 * (ver `syncCycle`): quien espera a `syncNow()` espera de verdad a que lo
 * suyo suba, en vez de volver al instante sin haber subido nada.
 */
export function syncNow(): Promise<void> {
  if (!activeUid) return Promise.resolve()
  return syncCycle(activeUid)
}

/**
 * Subir y después bajar. Nunca rechaza: un fallo queda en el estado y en el
 * registro. Exportado con sus opciones para las pruebas; la app entra
 * siempre por `syncNow`.
 */
export function syncCycle(uid: string, opts: SyncOptions = {}): Promise<void> {
  if (cycle && cycleGeneration === generation) {
    /*
     * Lo que se pide mientras un ciclo sube o baja es algo que ese ciclo no
     * ha visto (un cambio guardado después de que leyera el buzón): hace falta
     * otro al terminar. Antes se devolvía el ciclo en marcha y nada más, y el
     * cambio esperaba al siguiente aviso — hasta 60 s, o para siempre si la
     * bajada se colgaba (ios-auth: el «finalizar» no subió). Las peticiones de
     * mientras tanto se juntan en un único ciclo más.
     */
    if (!followUp) {
      const gen = generation
      followUp = cycle.then(() => {
        followUp = null
        return gen === generation ? syncCycle(uid, opts) : undefined
      })
    }
    return followUp
  }
  // Un ciclo de una sincronización ya parada (otra generación) sigue
  // terminando: éste espera a que acabe y no se mezclan.
  const previous = cycle
  const gen = generation
  const alive = () => gen === generation
  const serial = ++cycleSerial
  const run = (async () => {
    try {
      if (previous) await previous
      if (!alive()) return
      await push(uid, { ...opts, alive })
      if (!alive()) return
      await pull(uid, { alive })
      const pending = await pendingCount()
      if (!alive()) return
      setStatus({
        phase: pending === 0 ? 'synced' : 'syncing',
        pending,
        lastSyncedAt: Date.now(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (alive()) setStatus({ phase: 'error', error: message })
      log('sync', `sync cycle failed: ${message}`, 'error')
    } finally {
      if (cycleSerial === serial) cycle = null
    }
  })()
  cycle = run
  cycleGeneration = gen
  return run
}

/**
 * Espera, como mucho `ms`, a que termine el ciclo en marcha. Para el cierre
 * de sesión y el borrado de cuenta, después de `stopSync`: lo que estaba
 * subiendo o bajando acaba antes de que se vacíe la copia local.
 */
export async function waitForSyncIdle(ms: number): Promise<void> {
  const current = cycle
  if (!current) return
  await withTimeout(current, ms, 'SYNC_IDLE_TIMEOUT').catch(() => undefined)
}

export async function startSync(uid: string, opts: { restore?: boolean } = {}): Promise<void> {
  activeUid = uid
  generation++
  const gen = generation
  setStatus({ phase: 'syncing', error: null })

  if (opts.restore) {
    await pull(uid, { restoring: true, alive: () => gen === generation })
  }
  // Sin esperarlo: los datos de esta cuenta ya están en el dispositivo (o los
  // acaba de traer la restauración de arriba). Esperar el primer ciclo dejaba
  // «Comprobando sesión…» en pantalla lo que tardara la red — con lecturas
  // lentas, decenas de segundos — antes de enseñar lo que ya había. Es lo
  // mismo que hace ya el arranque sin conexión.
  void syncNow()

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
  // Lo que siga en vuelo deja de escribir (ver `SyncOptions.alive`).
  generation++
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

/**
 * Borra los ficheros del usuario en Cloud Storage: las fotos de progreso y la
 * foto de perfil.
 *
 * Se hace recorriendo los documentos de `photos` en Firestore y borrando la
 * ruta que cada uno declara, **no** listando la carpeta. Listar exigiría
 * permiso de lectura sobre el prefijo `users/{uid}/photos`, que
 * `storage.rules` no concede a propósito: las reglas autorizan por fichero.
 * Recorrer los documentos usa el permiso que sí existe y además borra
 * exactamente lo que hay, sin depender de que la carpeta se pueda listar.
 *
 * Los fallos individuales no detienen el borrado. Un objeto que ya no está —
 * porque la subida nunca terminó, o porque se borró antes — devuelve
 * `storage/object-not-found`, y eso no es un problema: el objetivo es que no
 * quede nada, y no queda.
 *
 * Devuelve cuántos ficheros se han borrado de verdad.
 */
async function wipeRemoteStorage(uid: string, photoDocs: Record<string, unknown>[]): Promise<number> {
  const services = await getFirebase()
  if (!services) return 0
  const { ref, deleteObject } = await import('firebase/storage')

  const paths = new Set<string>()
  for (const photo of photoDocs) {
    const declared = typeof photo.storagePath === 'string' ? photo.storagePath : null
    const id = typeof photo.id === 'string' ? photo.id : null
    // `storagePath` es lo que dice el documento; la ruta derivada del id es la
    // que se usó al subir. Se intentan las dos porque un documento antiguo
    // puede no tener el campo, y borrar de más aquí no rompe nada.
    if (declared) paths.add(declared)
    if (id) paths.add(photoStoragePath(uid, id))
  }
  paths.add(avatarStoragePath(uid))

  let removed = 0
  for (const path of paths) {
    try {
      await deleteObject(ref(services.storage, path))
      removed += 1
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== 'storage/object-not-found') {
        log('sync', `could not delete ${path}: ${String(err)}`, 'warn')
      }
    }
  }
  return removed
}

/**
 * Removes every remote document for this user before the auth record goes.
 *
 * También borra sus ficheros en Cloud Storage. Sin esa parte, eliminar la
 * cuenta dejaba las fotos de progreso huérfanas en el bucket para siempre:
 * inaccesibles, porque las reglas las atan a un uid que ya no existe, pero
 * ahí. Google Play exige que eliminar la cuenta elimine todos los datos del
 * usuario, y "casi todos" no cuenta.
 *
 * El orden importa: primero los ficheros, porque son los documentos de
 * `photos` los que dicen dónde están. Borrar los documentos antes dejaría los
 * ficheros sin forma de encontrarlos.
 */
export async function wipeRemoteData(uid: string): Promise<number> {
  const services = await getFirebase()
  if (!services) return 0
  const { collection, getDocs, writeBatch } = await import('firebase/firestore')
  const fs = services.db
  let removed = 0

  const photoSnap = await getDocs(collection(fs, userCollection(uid, 'photos')))
  const files = await wipeRemoteStorage(
    uid,
    photoSnap.docs.map((d) => d.data() as Record<string, unknown>),
  )

  for (const store of [...SYNCED_STORES]) {
    const snap = store === 'photos' ? photoSnap : await getDocs(collection(fs, userCollection(uid, store)))
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

  log('sync', `removed ${removed} remote documents and ${files} stored files for ${uid}`, 'warn')
  return removed
}

export { readProfile }
