import { getDB, invalidateSettingsCache, log, notify, readSettings, type ExercisePrefRow } from './db/database'
import {
  defaultSettings,
  type BodyweightEntry,
  type Exercise,
  type ExerciseLog,
  type MeasurementEntry,
  type Milestone,
  type PersonalRecord,
  type Routine,
  type Settings,
  type WorkoutSession,
} from './db/schema'
import { isLogged } from './training/metrics'
import { enqueueMany } from './sync/queue'
import { beforeLocalReset } from './sync/engine'
import { hasActiveSession } from './db/repo.sessions'
import type { SyncedStore } from './firebase/paths'
import { shareTextFile } from './native/chrome'

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

/**
 * Entrega el fichero y dice si de verdad salió.
 *
 * En las apps (Android e iOS) no hay descargas dentro del WebView: el fichero
 * va por el menú de compartir del sistema, y la persona puede cerrarlo sin
 * elegir nada. Eso NO es una copia guardada, y quien borra datos después de
 * exportar (`useAuth.keepLocalSeparate`) tiene que saberlo. En web, el
 * `<a download>` lo entrega el navegador y cuenta como entregado: no hay forma
 * de saber más, y es el camino de siempre.
 */
async function download(filename: string, content: string, type: string): Promise<boolean> {
  // `null`: no es nativo, sigue el camino del navegador.
  const shared = await shareTextFile(filename, content)
  if (shared) return shared.delivered

  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}

/** Lo que devuelve una exportación: cuántos registros llevaba y si el fichero llegó a salir. */
export interface ExportResult {
  count: number
  delivered: boolean
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportJson(includePhotos = false): Promise<ExportResult> {
  const file = await buildBackup(includePhotos)
  const count = Object.values(file.counts).reduce((a, b) => a + b, 0)
  const delivered = await download(`training-os-${stamp()}.json`, JSON.stringify(file, null, 2), 'application/json')
  log('backup', delivered ? `exported ${count} records` : `export of ${count} records not delivered`)
  return { count, delivered }
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(): Promise<ExportResult> {
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
          ]
            .map(csvEscape)
            .join(','),
        )
      })
    }
  }

  const delivered = await download(`training-os-sets-${stamp()}.csv`, rows.join('\n'), 'text/csv;charset=utf-8')
  log('backup', delivered ? `exported ${count} set rows to CSV` : `CSV export of ${count} rows not delivered`)
  return { count, delivered }
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  imported: number
  skipped: number
}

/**
 * Why a file was refused, as a code the screen translates. The messages used
 * to be English sentences shown straight to the person whatever the app's
 * language ("No se pudo importar el archivo: Not a Training OS backup").
 */
export type BackupImportProblem = 'notBackup' | 'noData' | 'activeWorkout'

const PROBLEM_MESSAGES: Record<BackupImportProblem, string> = {
  notBackup: 'Not a Training OS backup',
  noData: 'Backup has no data',
  activeWorkout: 'A workout is in progress',
}

export class BackupImportError extends Error {
  constructor(readonly problem: BackupImportProblem) {
    super(PROBLEM_MESSAGES[problem])
    this.name = 'BackupImportError'
  }
}

/**
 * The i18n key that explains a failed import to the person, by kind of error:
 * a file that is not JSON at all, a JSON that is not one of our backups, a
 * backup without data, a device out of space, or anything else. The raw
 * message stays in the technical log, never on screen.
 */
export function importErrorKey(err: unknown): string {
  if (err instanceof BackupImportError) {
    if (err.problem === 'activeWorkout') return 'data.importBlockedActive'
    return err.problem === 'notBackup' ? 'data.importNotBackup' : 'data.importNoData'
  }
  if (err instanceof SyntaxError) return 'data.importNotJson'
  if (err instanceof DOMException && err.name === 'QuotaExceededError') return 'data.importNoSpace'
  return 'data.importError'
}

export async function importBackup(json: unknown, mode: ImportMode): Promise<ImportResult> {
  if (typeof json !== 'object' || json === null) throw new BackupImportError('notBackup')
  const file = json as Partial<BackupFile>
  if (file.format !== BACKUP_FORMAT) throw new BackupImportError('notBackup')
  if (!file.data) throw new BackupImportError('noData')
  /*
   * «Reemplazar» vacía `sessions`, y con ella el entrenamiento en curso: la
   * pantalla seguiría mostrándolo, el siguiente autoguardado lo resucitaría a
   * medias y el aviso nativo apuntaría a una sesión que ya no existe. Se
   * comprueba aquí, sobre lo guardado, además de en la pantalla (Ajustes mira
   * `useWorkout.session`), para que ningún otro camino pueda saltárselo.
   */
  if (mode === 'replace' && (await hasActiveSession())) throw new BackupImportError('activeWorkout')

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

/**
 * «Borrar todos los datos» de Ajustes.
 *
 * Lo primero, sin esperar a nada, lo mismo que antes de cualquier vaciado
 * (`beforeLocalReset`): el entrenamiento en memoria se vacía y el aviso nativo
 * se retira, para que ni un autoguardado ni un descanso sobrevivan al borrado.
 *
 * La fila de ajustes se borra con todo lo demás, pero el idioma y el tema se
 * conservan: son del dispositivo, no de los datos (igual que en
 * `resetLocalData`), y sin ellos la app reaparecería tras recargar en otro
 * idioma y con un destello claro. El resto de ajustes vuelve a sus valores
 * por defecto, que es lo que promete el aviso («y ajustes»).
 */
export async function wipeEverything(): Promise<void> {
  beforeLocalReset()
  const kept = await readSettings()
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
  await tx.objectStore('settings').put({ ...defaultSettings(), language: kept.language, theme: kept.theme })
  await tx.done
  invalidateSettingsCache()
  log('backup', 'all local data erased', 'warn')
  notify(...stores)
}
