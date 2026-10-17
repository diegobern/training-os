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

/* ------------------------------------------------------------- versiones */

/**
 * Reloj de versiones de las filas del buzón (`SyncQueueRow.seq`).
 *
 * Estrictamente creciente dentro de esta carga de la app, y nunca por debajo
 * de la versión anterior de la misma fila más uno: así una fila reescrita
 * tiene siempre otra versión, también después de recargar (cuando el reloj
 * vuelve a empezar). `Date.now()` sólo sirve de suelo para que los números de
 * cargas distintas no se repitan por casualidad.
 */
let seqClock = 0

function nextSeq(previous: number | undefined): number {
  seqClock = Math.max(seqClock + 1, Date.now(), (previous ?? 0) + 1)
  return seqClock
}

/** Lo que la subida recuerda de cada fila que envía: cuál era y en qué versión estaba. */
export interface QueueTicket {
  id: string
  seq: number
}

export function ticketOf(row: SyncQueueRow): QueueTicket {
  return { id: row.id, seq: row.seq ?? 0 }
}

/**
 * Lo único que hace falta del almacén `syncQueue` para encolar dentro de una
 * transacción que abre otro (la del propio documento). Estructural a
 * propósito: vale el `objectStore('syncQueue')` de cualquier transacción de
 * lectura y escritura que lo incluya.
 */
export interface QueueStoreInTx {
  get(id: string): Promise<SyncQueueRow | undefined>
  put(row: SyncQueueRow): Promise<unknown>
}

/**
 * Escribe la fila del buzón de un documento DENTRO de la transacción de quien
 * llama. Con el documento y su fila en la misma transacción, o se guardan los
 * dos o ninguno: un cierre a mitad ya no puede dejar un cambio local que nunca
 * llegará a la cuenta.
 */
export async function queueInTx(
  q: QueueStoreInTx,
  store: SyncedStore,
  docId: string,
  op: 'put' | 'delete',
): Promise<void> {
  const id = `${store}:${docId}`
  const existing = await q.get(id)
  await q.put({
    id,
    store,
    docId,
    op,
    queuedAt: existing?.queuedAt ?? Date.now(),
    attempts: 0,
    lastError: null,
    seq: nextSeq(existing?.seq),
  })
}

/** Avisa de que el buzón tiene algo nuevo. Se llama después de confirmar la transacción, nunca antes. */
export function announceQueued(): void {
  notify('syncQueue')
  queued()
}

/**
 * Hace `work` dentro de `tx` y espera a que se confirme.
 *
 * Si algo falla a mitad, la transacción se aborta entera y el error sube tal
 * cual. Sin esto, el `tx.done` que nadie esperaba se rechazaba suelto: una
 * promesa rechazada sin capturar por cada escritura fallida.
 */
export async function inTx(tx: { done: Promise<void>; abort(): void }, work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (err) {
    try {
      tx.abort()
    } catch {
      /* ya estaba abortada por el propio error */
    }
    await tx.done.catch(() => undefined)
    throw err
  }
  await tx.done
}

/* -------------------------------------------------- buzón: escrituras */

export async function enqueue(store: SyncedStore, docId: string, op: 'put' | 'delete'): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  await inTx(tx, () => queueInTx(tx.store, store, docId, op))
  announceQueued()
}

export async function enqueueMany(entries: { store: SyncedStore; docId: string; op: 'put' | 'delete' }[]) {
  if (!entries.length) return
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  await inTx(tx, async () => {
    for (const e of entries) await queueInTx(tx.store, e.store, e.docId, e.op)
  })
  announceQueued()
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

/** Las filas más antiguas, cada una con su versión (ver `ticketOf`). */
export async function takeBatch(limit: number): Promise<SyncQueueRow[]> {
  const db = await getDB()
  const rows = await db.getAllFromIndex('syncQueue', 'by-queued')
  return rows.slice(0, limit)
}

/**
 * Quita del buzón lo que ya subió, en una sola transacción.
 *
 * Compara antes de borrar: una fila cuya versión cambió desde que se leyó
 * es una edición hecha MIENTRAS se subía la anterior, y se queda para la
 * próxima subida. Borrarla por id, como antes, perdía ese cambio en silencio.
 */
export async function clearEntries(tickets: QueueTicket[]): Promise<void> {
  if (!tickets.length) return
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  await inTx(tx, async () => {
    for (const ticket of tickets) {
      const row = await tx.store.get(ticket.id)
      if (row && (row.seq ?? 0) === ticket.seq) await tx.store.delete(ticket.id)
    }
  })
  notify('syncQueue')
}

/** Anota el fallo en las filas que se enviaron. Una fila reescrita desde entonces es otra edición y no se toca. */
export async function markFailed(tickets: QueueTicket[], message: string): Promise<void> {
  if (!tickets.length) return
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readwrite')
  await inTx(tx, async () => {
    for (const ticket of tickets) {
      const row = await tx.store.get(ticket.id)
      if (row && (row.seq ?? 0) === ticket.seq) {
        await tx.store.put({ ...row, attempts: row.attempts + 1, lastError: message })
      }
    }
  })
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

export interface SyncedWriteOptions {
  /**
   * Se mira con la base ya abierta, justo antes de abrir la transacción: si
   * devuelve `false` no se escribe nada. Es lo que impide que un autoguardado
   * que salió antes de cerrar sesión aterrice después, en los datos del
   * siguiente dueño (ver `useWorkout.reset`).
   */
  isCurrent?: () => boolean
}

/**
 * El documento y su fila del buzón, en UNA transacción.
 *
 * Antes eran dos: un cierre de la app entre la una y la otra dejaba el cambio
 * guardado aquí y sin encolar, es decir, sin subir nunca a la cuenta.
 */
export async function putSynced<T extends { id: string }>(
  store: SyncedStore,
  value: T,
  opts: SyncedWriteOptions = {},
): Promise<void> {
  const db = await getDB()
  if (opts.isCurrent && !opts.isCurrent()) return
  const tx = db.transaction([store as AnyStore, 'syncQueue'], 'readwrite')
  await inTx(tx, async () => {
    await tx.objectStore(store as AnyStore).put(value as never)
    await queueInTx(tx.objectStore('syncQueue'), store, value.id, 'put')
  })
  announceQueued()
  notify(store as StoreName)
}

export async function deleteSynced(store: SyncedStore, id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction([store as AnyStore, 'syncQueue'], 'readwrite')
  await inTx(tx, async () => {
    await tx.objectStore(store as AnyStore).delete(id)
    await queueInTx(tx.objectStore('syncQueue'), store, id, 'delete')
  })
  announceQueued()
  notify(store as StoreName)
}

/** Writes what the server sent without echoing it back (photo paths and bytes). */
export async function putFromServer<T extends { id: string }>(store: SyncedStore, value: T): Promise<void> {
  await rawPut(store, value)
}

/**
 * La bajada: escribe lo que llegó del servidor SALVO que ese documento esté
 * en el buzón. Lo pendiente es más nuevo aquí que allí, y pisarlo perdía el
 * cambio en los dos sitios: la subida lee el documento local al subir, y
 * subía la versión vieja que acababa de bajar. La bajada mira el buzón al
 * empezar, pero espera a Firestore (segundos en el iPhone): una serie o un
 * «finalizar» guardados en ese rato no estaban en esa foto. Por eso se vuelve
 * a mirar aquí, en la MISMA transacción que la escritura, y `putSynced`
 * escribe documento y buzón juntos: no hay hueco entre mirar y escribir.
 *
 * Devuelve si escribió.
 */
export async function putPulled<T extends { id: string }>(store: SyncedStore, value: T): Promise<boolean> {
  const db = await getDB()
  const tx = db.transaction([store as AnyStore, 'syncQueue'], 'readwrite')
  let wrote = false
  await inTx(tx, async () => {
    if (await tx.objectStore('syncQueue').get(`${store}:${value.id}`)) return
    await tx.objectStore(store as AnyStore).put(value as never)
    wrote = true
  })
  return wrote
}

export async function deleteFromServer(store: SyncedStore, id: string): Promise<void> {
  await rawDelete(store, id)
}
