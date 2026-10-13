/* ============================================================================
 * SAMPLE DATA — only what it takes to get rid of it
 *
 * Training OS used to offer "Load DEMO data": a routine and a few weeks of
 * invented sessions, body weights and records, all flagged `demo: true`, so
 * the charts could be tried before there was any real history. It has been
 * removed. What a person sees is their own training, from their own account,
 * and nothing else.
 *
 * Removing the button is not enough on its own: anyone who pressed it still
 * has those records — on this device and, once synced, in their account,
 * from where they would come back on the next phone they sign in on. So:
 *
 *   · `purgeSampleDataOnce()` runs at start-up and deletes every record
 *     flagged `demo: true`, here and (through the normal outbox) in the
 *     account. It remembers that it ran, so after the first launch it costs a
 *     single read.
 *   · `isSampleRecord()` lets the sync engine drop any such record arriving
 *     from the server instead of storing it, and delete it there too.
 *
 * Only records the app itself flagged as sample data are touched. Nothing a
 * person logged is ever flagged, so nothing they logged is ever removed.
 * ========================================================================== */

import { getDB, getMeta, log, notify, setMeta, writeSettings } from './database'
import { enqueueMany } from '../sync/queue'
import type { SyncedStore } from '../firebase/paths'

const PURGED_KEY = 'sampleDataPurgedAt'

type SampleStore = Extract<
  SyncedStore,
  'sessions' | 'exerciseLogs' | 'personalRecords' | 'routines' | 'bodyweight' | 'measurements'
>

/** The stores the old loader wrote to. */
export const SAMPLE_STORES: readonly SampleStore[] = [
  'sessions',
  'exerciseLogs',
  'personalRecords',
  'routines',
  'bodyweight',
  'measurements',
]

/** A record the app created as sample data, never one a person logged. */
export function isSampleRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { demo?: unknown }).demo === true
}

/**
 * Deletes every sample record on this device and queues its deletion in the
 * account. Returns how many it removed.
 */
export async function purgeSampleData(): Promise<number> {
  const db = await getDB()
  const queued: { store: SampleStore; docId: string; op: 'delete' }[] = []

  const sampleSessionIds = new Set<string>()
  for (const s of await db.getAll('sessions')) if (isSampleRecord(s)) sampleSessionIds.add(s.id)

  const tx = db.transaction([...SAMPLE_STORES], 'readwrite')
  for (const s of await tx.objectStore('sessions').getAll()) {
    if (!isSampleRecord(s)) continue
    await tx.objectStore('sessions').delete(s.id)
    queued.push({ store: 'sessions', docId: s.id, op: 'delete' })
  }
  // Logs and records also go by the session they came from: they were written
  // from the sample sessions, whatever their own flag says.
  for (const l of await tx.objectStore('exerciseLogs').getAll()) {
    if (!isSampleRecord(l) && !sampleSessionIds.has(l.sessionId)) continue
    await tx.objectStore('exerciseLogs').delete(l.id)
    queued.push({ store: 'exerciseLogs', docId: l.id, op: 'delete' })
  }
  for (const p of await tx.objectStore('personalRecords').getAll()) {
    if (!isSampleRecord(p) && !sampleSessionIds.has(p.sessionId)) continue
    await tx.objectStore('personalRecords').delete(p.id)
    queued.push({ store: 'personalRecords', docId: p.id, op: 'delete' })
  }
  for (const store of ['routines', 'bodyweight', 'measurements'] as const) {
    for (const row of await tx.objectStore(store).getAll()) {
      if (!isSampleRecord(row)) continue
      await tx.objectStore(store).delete(row.id)
      queued.push({ store, docId: row.id, op: 'delete' })
    }
  }
  await tx.done

  await enqueueMany(queued)
  await writeSettings({ demoDataPresent: false })
  if (queued.length) {
    log('sample', `removed ${queued.length} sample records`)
    notify('routines', 'sessions', 'exerciseLogs', 'personalRecords', 'bodyweight', 'measurements', 'settings')
  }
  return queued.length
}

/**
 * The start-up pass. Never throws: a clean-up that cannot run is retried on
 * the next launch, and must not keep the app from opening.
 */
export async function purgeSampleDataOnce(): Promise<void> {
  try {
    if (await getMeta<number | null>(PURGED_KEY, null)) return
    await purgeSampleData()
    await setMeta(PURGED_KEY, Date.now())
  } catch (err) {
    log('sample', `purge failed, will retry next launch: ${String(err)}`, 'warn')
  }
}
