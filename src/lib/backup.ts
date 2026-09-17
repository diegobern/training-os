import { getDB, invalidateSettingsCache, log, notify, readSettings, type ExercisePrefRow } from './db/database'
import type {
  BodyweightEntry,
  Exercise,
  ExerciseLog,
  MeasurementEntry,
  Milestone,
  PersonalRecord,
  Routine,
  Settings,
  WorkoutSession,
} from './db/schema'
import { isLogged } from './training/metrics'
import { enqueueMany } from './sync/queue'
import type { SyncedStore } from './firebase/paths'

export const BACKUP_FORMAT = 'training-os-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  app: { name: string; version: string }
  counts: Record<string, number>
  data: {
    settings: Settings | null
    exercises: Exercise[]
    /** Favourites, hidden flags and per-user overrides for catalog exercises. */
    exercisePrefs?: ExercisePrefRow[]
    routines: Routine[]
    sessions: WorkoutSession[]
    exerciseLogs: ExerciseLog[]
    personalRecords: PersonalRecord[]
    bodyweight: BodyweightEntry[]
    measurements: MeasurementEntry[]
    milestones: Milestone[]
    photos?: { id: string; date: string; pose: string; dataUrl: string; weight: number | null; notes: string; createdAt: number }[]
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function buildBackup(includePhotos = false): Promise<BackupFile> {
  const db = await getDB()
  const [settings, exercises, routines, sessions, exerciseLogs, personalRecords, bodyweight, measurements, milestones] =
    await Promise.all([
      readSettings(),
      db.getAll('exercises'),
      db.getAll('routines'),
      db.getAll('sessions'),
      db.getAll('exerciseLogs'),
      db.getAll('personalRecords'),
      db.getAll('bodyweight'),
      db.getAll('measurements'),
      db.getAll('milestones'),
    ])

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'Training OS', version: __APP_VERSION__ },
    counts: {
      exercises: exercises.length,
      routines: routines.length,
      sessions: sessions.length,
      exerciseLogs: exerciseLogs.length,
      personalRecords: personalRecords.length,
      bodyweight: bodyweight.length,
      measurements: measurements.length,
      milestones: milestones.length,
    },
    data: {
      settings,
      exercises,
      routines,
      sessions,
      exerciseLogs,
      personalRecords,
      bodyweight,
      measurements,
      milestones,
    },
  }

  if (includePhotos) {
    // A photo that lives in the account but has not been downloaded to this
    // device has no bytes here; it is skipped rather than exported empty.
    const photos = (await db.getAll('photos')).filter((p) => p.blob instanceof Blob)
    file.data.photos = await Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        date: p.date,
        pose: p.pose,
        dataUrl: await blobToDataUrl(p.blob as Blob),
        weight: p.weight,
        notes: p.notes,
        createdAt: p.createdAt,
      })),
    )
    file.counts.photos = photos.length
  }

  return file
}

function download(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportJson(includePhotos = false): Promise<number> {
  const file = await buildBackup(includePhotos)
  download(`training-os-${stamp()}.json`, JSON.stringify(file, null, 2), 'application/json')
  log('backup', `exported ${Object.values(file.counts).reduce((a, b) => a + b, 0)} records`)
  return Object.values(file.counts).reduce((a, b) => a + b, 0)
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(): Promise<number> {
  const db = await getDB()
  const sessions = (await db.getAll('sessions'))
    .filter((s) => s.status === 'completed' && !s.deletedAt)
    .sort((a, b) => a.startedAt - b.startedAt)

  const header = [
    'date',
    'time',
    'routine',
    'day',
    'duration_sec',
    'exercise',
    'muscle_group',
    'set_index',
    'set_type',
    'weight_kg',
    'reps',
    'rir',
    'rpe',
    'volume_kg',
    'demo',
  ]
  const rows: string[] = [header.join(',')]
  let count = 0

  for (const s of sessions) {
    const d = new Date(s.startedAt)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    for (const ex of s.exercises) {
      ex.sets.forEach((set, i) => {
        if (!isLogged(set)) return
        count++
        rows.push(
          [
            date,
            time,
            s.routineName,
            s.dayName,
            s.durationSec,
            ex.name,
            ex.muscleGroup,
            i + 1,
            set.type,
            set.weight,
            set.reps,
            set.rir ?? '',
            set.rpe ?? '',
            (set.weight ?? 0) * (set.reps ?? 0),
            s.demo ? 'yes' : 'no',
          ]
            .map(csvEscape)
            .join(','),
        )
      })
    }
  }

  download(`training-os-sets-${stamp()}.csv`, rows.join('\n'), 'text/csv;charset=utf-8')
  log('backup', `exported ${count} set rows to CSV`)
  return count
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  imported: number
  skipped: number
}

export async function importBackup(json: unknown, mode: ImportMode): Promise<ImportResult> {
  if (typeof json !== 'object' || json === null) throw new Error('Not a Training OS backup')
  const file = json as Partial<BackupFile>
  if (file.format !== BACKUP_FORMAT) throw new Error('Not a Training OS backup')
  if (!file.data) throw new Error('Backup has no data')

  const db = await getDB()
  const stores = [
    'exercises',
    'exercisePrefs',
    'routines',
    'sessions',
    'exerciseLogs',
    'personalRecords',
    'bodyweight',
    'measurements',
    'milestones',
  ] as const

  let imported = 0
  let skipped = 0
  const queued: { store: SyncedStore; docId: string; op: 'put' }[] = []

  if (mode === 'replace') {
    const tx = db.transaction([...stores, 'photos', 'settings'], 'readwrite')
    for (const s of stores) await tx.objectStore(s).clear()
    await tx.objectStore('photos').clear()
    await tx.done
  }

  for (const store of stores) {
    const rows = (file.data[store] ?? []) as { id: string }[]
    if (!Array.isArray(rows)) continue
    const tx = db.transaction(store, 'readwrite')
    for (const row of rows) {
      if (!row || typeof row.id !== 'string') {
        skipped++
        continue
      }
      if (mode === 'merge') {
        const existing = await tx.store.get(row.id)
        if (existing) {
          skipped++
          continue
        }
      }
      await tx.store.put(row as never)
      queued.push({ store: store as SyncedStore, docId: row.id, op: 'put' })
      imported++
    }
    await tx.done
  }

  if (file.data.photos?.length) {
    const tx = db.transaction('photos', 'readwrite')
    for (const p of file.data.photos) {
      const existing = mode === 'merge' ? await tx.store.get(p.id) : undefined
      if (existing) {
        skipped++
        continue
      }
      try {
        const blob = await dataUrlToBlob(p.dataUrl)
        await tx.store.put({
          id: p.id,
          date: p.date,
          pose: p.pose as 'front' | 'side' | 'back',
          blob,
          storagePath: null,
          width: 0,
          height: 0,
          weight: p.weight,
          notes: p.notes,
          createdAt: p.createdAt,
          updatedAt: Date.now(),
        })
        queued.push({ store: 'photos', docId: p.id, op: 'put' })
        imported++
      } catch {
        skipped++
      }
    }
    await tx.done
  }

  if (file.data.settings && mode === 'replace') {
    await db.put('settings', { ...file.data.settings, id: 'app' })
    invalidateSettingsCache()
  }

  // Imported documents must also reach the account, not just this device.
  await enqueueMany(queued)
  log('backup', `imported ${imported} records (${mode}), skipped ${skipped}`)
  notify(...stores, 'photos', 'settings', 'meta')
  return { imported, skipped }
}

export async function wipeEverything(): Promise<void> {
  const db = await getDB()
  const stores = [
    'exercises',
    'exercisePrefs',
    'routines',
    'sessions',
    'exerciseLogs',
    'personalRecords',
    'bodyweight',
    'measurements',
    'milestones',
    'photos',
    'meta',
    'settings',
  ] as const
  const tx = db.transaction([...stores], 'readwrite')
  for (const s of stores) await tx.objectStore(s).clear()
  await tx.done
  invalidateSettingsCache()
  log('backup', 'all local data erased', 'warn')
  notify(...stores)
}
